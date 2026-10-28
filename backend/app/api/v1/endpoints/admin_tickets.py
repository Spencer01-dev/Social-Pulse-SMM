import uuid
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.ticket import Ticket, TicketMessage, TicketPriority, TicketStatus
from app.models.user import User, UserRole
from app.schemas.ticket import (
    AdminTicketCreate,
    TicketMessageResponse,
    TicketReplyRequest,
    TicketResponse,
    TicketStatusUpdate,
    TicketSummaryResponse,
    UnreadCountResponse,
)

import logging
from sqlalchemy import text
from app.models.child_panel import ChildPanel
from app.models.order import Order

logger = logging.getLogger("socialpulse.admin_tickets")

router = APIRouter(prefix="/admin/tickets", tags=["Admin Support Helpdesk"])


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_admin_unread_count(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Get the total count of tickets that require admin response (unread customer replies or open tickets).
    """
    try:
        query = select(Ticket).where(
            (Ticket.status == TicketStatus.CUSTOMER_REPLY) | (Ticket.admin_unread == True)
        )
        result = await db.execute(query)
        count = len(result.scalars().all())
        return UnreadCountResponse(unread_count=count)
    except Exception:
        # Fallback if admin_unread column is pending migration
        try:
            fallback_q = select(Ticket).where(Ticket.status == TicketStatus.CUSTOMER_REPLY)
            res = await db.execute(fallback_q)
            return UnreadCountResponse(unread_count=len(res.scalars().all()))
        except Exception:
            return UnreadCountResponse(unread_count=0)


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_ticket_for_user(
    ticket_in: AdminTicketCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Admin opens a personal support ticket to contact a customer (e.g. regarding an order issue or notice).
    Automatically flags the ticket as unread for the customer.
    """
    # 0. Self-healing DDL: ensure ticket columns exist on live production database
    try:
        await db.execute(text("""
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS user_unread BOOLEAN DEFAULT FALSE;
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS admin_unread BOOLEAN DEFAULT FALSE;
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tenant_id UUID;
            ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
        """))
        await db.commit()
    except Exception as ddl_err:
        await db.rollback()
        logger.warning(f"Self-healing DDL in admin_create_ticket_for_user: {ddl_err}")

    try:
        # 1. Verify target customer exists
        user_res = await db.execute(select(User).where(User.id == ticket_in.user_id))
        customer = user_res.scalars().first()
        if not customer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target customer not found")

        # 2. Verify order_id to prevent foreign key errors if order was purged/mismatched
        valid_order_id = None
        if ticket_in.order_id:
            try:
                ord_check = await db.execute(select(Order.id).where(Order.id == ticket_in.order_id))
                if ord_check.scalar():
                    valid_order_id = ticket_in.order_id
            except Exception:
                valid_order_id = None

        # 3. Verify tenant_id to prevent foreign key errors with deleted child panels
        valid_tenant_id = None
        if customer.tenant_id:
            try:
                cp_check = await db.execute(select(ChildPanel.id).where(ChildPanel.id == customer.tenant_id))
                if cp_check.scalar():
                    valid_tenant_id = customer.tenant_id
            except Exception:
                valid_tenant_id = None

        # 4. Create the ticket thread
        new_ticket = Ticket(
            user_id=customer.id,
            tenant_id=valid_tenant_id,
            order_id=valid_order_id,
            subject=ticket_in.subject.strip(),
            priority=ticket_in.priority or TicketPriority.MEDIUM,
            status=TicketStatus.ANSWERED,
            user_unread=True,    # Immediately alert the customer with unread notification badge!
            admin_unread=False,
        )
        db.add(new_ticket)
        await db.flush()

        # 5. Add admin's initial message
        first_msg = TicketMessage(
            ticket_id=new_ticket.id,
            sender_id=admin.id,
            message=ticket_in.message.strip(),
            is_admin_reply=True,
            is_read=False
        )
        db.add(first_msg)
        await db.commit()

        # Re-fetch ticket with selectinload to guarantee fully loaded relationships
        reload_q = (
            select(Ticket)
            .options(
                selectinload(Ticket.user),
                selectinload(Ticket.messages).selectinload(TicketMessage.sender)
            )
            .where(Ticket.id == new_ticket.id)
        )
        res = await db.execute(reload_q)
        fresh_ticket = res.scalars().first()

        return TicketResponse(
            id=fresh_ticket.id,
            user_id=fresh_ticket.user_id,
            username=customer.username,
            order_id=fresh_ticket.order_id,
            subject=fresh_ticket.subject,
            priority=fresh_ticket.priority,
            status=fresh_ticket.status,
            user_unread=bool(getattr(fresh_ticket, "user_unread", True)),
            admin_unread=bool(getattr(fresh_ticket, "admin_unread", False)),
            messages=[
                TicketMessageResponse(
                    id=m.id,
                    ticket_id=m.ticket_id,
                    sender_id=m.sender_id,
                    sender_username=m.sender.username if m.sender else admin.username,
                    message=m.message,
                    is_admin_reply=m.is_admin_reply,
                    is_read=bool(getattr(m, "is_read", False)),
                    created_at=m.created_at
                )
                for m in fresh_ticket.messages
            ],
            created_at=fresh_ticket.created_at,
            updated_at=fresh_ticket.updated_at
        )
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception(f"Exception during admin ticket creation: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create ticket: {str(exc)}"
        )


@router.get("", response_model=List[TicketSummaryResponse])
async def list_all_tickets(
    status_filter: Optional[TicketStatus] = None,
    priority_filter: Optional[TicketPriority] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    List all platform tickets across all customers.
    """
    query = select(Ticket).options(selectinload(Ticket.messages), selectinload(Ticket.user)).order_by(desc(Ticket.updated_at)).offset(skip).limit(limit)
    if status_filter:
        query = query.where(Ticket.status == status_filter)
    if priority_filter:
        query = query.where(Ticket.priority == priority_filter)

    result = await db.execute(query)
    tickets = result.scalars().all()

    summaries = []
    for t in tickets:
        last_msg = t.messages[-1].message if t.messages else None
        summaries.append(
            TicketSummaryResponse(
                id=t.id,
                user_id=t.user_id,
                username=t.user.username if t.user else "User",
                order_id=t.order_id,
                subject=t.subject,
                priority=t.priority,
                status=t.status,
                user_unread=bool(getattr(t, "user_unread", False)),
                admin_unread=bool(getattr(t, "admin_unread", False) or t.status == TicketStatus.CUSTOMER_REPLY),
                last_message=last_msg,
                created_at=t.created_at,
                updated_at=t.updated_at
            )
        )
    return summaries


@router.get("/{ticket_id}", response_model=TicketResponse)
async def get_admin_ticket_details(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Get support ticket with full threaded messages for admin inspection.
    Marks admin_unread as False since admin has now opened it.
    """
    query = (
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(Ticket.id == ticket_id)
    )
    result = await db.execute(query)
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    # Mark as read for admin
    if getattr(ticket, "admin_unread", False):
        ticket.admin_unread = False
        db.add(ticket)
        await db.commit()

    return TicketResponse(
        id=ticket.id,
        user_id=ticket.user_id,
        username=ticket.user.username if ticket.user else "User",
        order_id=ticket.order_id,
        subject=ticket.subject,
        priority=ticket.priority,
        status=ticket.status,
        user_unread=bool(getattr(ticket, "user_unread", False)),
        admin_unread=bool(getattr(ticket, "admin_unread", False)),
        messages=[
            TicketMessageResponse(
                id=m.id,
                ticket_id=m.ticket_id,
                sender_id=m.sender_id,
                sender_username=m.sender.username if m.sender else "Support Staff",
                message=m.message,
                is_admin_reply=m.is_admin_reply,
                is_read=bool(getattr(m, "is_read", False)),
                created_at=m.created_at
            )
            for m in ticket.messages
        ],
        created_at=ticket.created_at,
        updated_at=ticket.updated_at
    )


@router.post("/{ticket_id}/reply", response_model=TicketResponse)
async def admin_reply_to_ticket(
    ticket_id: uuid.UUID,
    reply_in: TicketReplyRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Admin reply to support ticket and automatically mark status as 'Answered'.
    Flags user_unread as True so customer gets instant notification.
    """
    query = (
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(Ticket.id == ticket_id)
    )
    result = await db.execute(query)
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    msg = TicketMessage(
        ticket_id=ticket.id,
        sender_id=admin.id,
        message=reply_in.message,
        is_admin_reply=True,
        is_read=False
    )
    ticket.status = TicketStatus.ANSWERED
    ticket.user_unread = True  # Customer receives notification badge!
    ticket.admin_unread = False
    db.add(msg)
    db.add(ticket)
    await db.commit()

    return await get_admin_ticket_details(ticket_id=ticket_id, db=db, admin=admin)


@router.patch("/{ticket_id}/status", response_model=TicketResponse)
async def update_ticket_status(
    ticket_id: uuid.UUID,
    status_in: TicketStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Admin override of ticket status (e.g. Closed, Open).
    """
    query = select(Ticket).where(Ticket.id == ticket_id)
    result = await db.execute(query)
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    ticket.status = status_in.status
    db.add(ticket)
    await db.commit()

    return await get_admin_ticket_details(ticket_id=ticket_id, db=db, admin=admin)
