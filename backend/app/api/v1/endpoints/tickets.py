import uuid
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user
from app.api.v1.endpoints.tenant import MAIN_PLATFORM_DOMAINS
from app.core.database import get_db
from app.models.child_panel import ChildPanel
from app.models.ticket import Ticket, TicketMessage, TicketStatus
from app.models.user import User
from app.schemas.ticket import (
    TicketCreate,
    TicketMessageResponse,
    TicketReplyRequest,
    TicketResponse,
    TicketSummaryResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/tickets", tags=["Customer Support Tickets"])


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_my_unread_tickets_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Get total count of tickets with unread admin messages for the logged-in customer.
    """
    query = select(Ticket).where(
        Ticket.user_id == current_user.id,
        Ticket.user_unread == True,
        Ticket.status != TicketStatus.CLOSED
    )
    result = await db.execute(query)
    count = len(result.scalars().all())
    return UnreadCountResponse(unread_count=count)


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    ticket_in: TicketCreate,
    request: Request,
    x_tenant_domain: Optional[str] = Header(None, alias="X-Tenant-Domain"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Open a new support ticket.
    """
    tenant_id = current_user.tenant_id
    if not tenant_id:
        raw_domain = x_tenant_domain or request.headers.get("x-tenant-domain") or request.headers.get("X-Tenant-Domain")
        if raw_domain:
            clean_tenant_domain = (
                raw_domain.split(":")[0]
                .strip()
                .lower()
                .replace("https://", "")
                .replace("http://", "")
                .rstrip("/")
            )
            clean_no_www = clean_tenant_domain[4:] if clean_tenant_domain.startswith("www.") else clean_tenant_domain
            clean_with_www = f"www.{clean_no_www}"
            is_main = any(clean_no_www == d or clean_no_www.endswith(f".{d}") for d in MAIN_PLATFORM_DOMAINS)
            if not is_main:
                tenant_q = await db.execute(
                    select(ChildPanel).where(
                        or_(
                            ChildPanel.domain == clean_tenant_domain,
                            ChildPanel.domain == clean_no_www,
                            ChildPanel.domain == clean_with_www,
                        )
                    )
                )
                panel = tenant_q.scalars().first()
                if panel:
                    tenant_id = panel.id

    # 0. Self-healing DDL: ensure ticket columns exist on live production database
    try:
        from sqlalchemy import text
        await db.execute(text("""
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS user_unread BOOLEAN DEFAULT FALSE;
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS admin_unread BOOLEAN DEFAULT FALSE;
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tenant_id UUID;
            ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
        """))
        await db.commit()
    except Exception:
        await db.rollback()

    try:
        valid_order_id = None
        if ticket_in.order_id:
            try:
                from app.models.order import Order
                ord_check = await db.execute(select(Order.id).where(Order.id == ticket_in.order_id))
                if ord_check.scalar():
                    valid_order_id = ticket_in.order_id
            except Exception:
                valid_order_id = None

        ticket = Ticket(
            user_id=current_user.id,
            tenant_id=tenant_id,
            order_id=valid_order_id,
            subject=ticket_in.subject.strip(),
            priority=ticket_in.priority or TicketPriority.MEDIUM,
            status=TicketStatus.OPEN,
            user_unread=False,
            admin_unread=True,
        )
        db.add(ticket)
        await db.flush()

        # Initial message
        first_msg = TicketMessage(
            ticket_id=ticket.id,
            sender_id=current_user.id,
            message=ticket_in.message.strip(),
            is_admin_reply=False,
            is_read=True
        )
        db.add(first_msg)
        await db.commit()

        reload_q = (
            select(Ticket)
            .options(
                selectinload(Ticket.user),
                selectinload(Ticket.messages).selectinload(TicketMessage.sender)
            )
            .where(Ticket.id == ticket.id)
        )
        res = await db.execute(reload_q)
        fresh_ticket = res.scalars().first()

        return TicketResponse(
            id=fresh_ticket.id,
            user_id=fresh_ticket.user_id,
            username=current_user.username,
            order_id=fresh_ticket.order_id,
            subject=fresh_ticket.subject,
            priority=fresh_ticket.priority,
            status=fresh_ticket.status,
            user_unread=bool(getattr(fresh_ticket, "user_unread", False)),
            admin_unread=bool(getattr(fresh_ticket, "admin_unread", True)),
            messages=[
                TicketMessageResponse(
                    id=m.id,
                    ticket_id=m.ticket_id,
                    sender_id=m.sender_id,
                    sender_username=m.sender.username if m.sender else current_user.username,
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to submit ticket: {str(exc)}"
        )


@router.get("", response_model=List[TicketSummaryResponse])
async def list_my_tickets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    List all support tickets created by or sent to the logged-in customer.
    """
    query = (
        select(Ticket)
        .options(selectinload(Ticket.messages), selectinload(Ticket.user))
        .where(Ticket.user_id == current_user.id)
        .order_by(desc(Ticket.updated_at))
    )
    result = await db.execute(query)
    tickets = result.scalars().all()

    summaries = []
    for t in tickets:
        last_msg = t.messages[-1].message if t.messages else None
        summaries.append(
            TicketSummaryResponse(
                id=t.id,
                user_id=t.user_id,
                username=current_user.username,
                order_id=t.order_id,
                subject=t.subject,
                priority=t.priority,
                status=t.status,
                user_unread=bool(getattr(t, "user_unread", False)),
                admin_unread=bool(getattr(t, "admin_unread", False)),
                last_message=last_msg,
                created_at=t.created_at,
                updated_at=t.updated_at
            )
        )
    return summaries


@router.get("/{ticket_id}", response_model=TicketResponse)
async def get_ticket_details(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Get support ticket with full threaded messages conversation.
    Automatically marks ticket as read for the customer.
    """
    query = (
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(Ticket.id == ticket_id, Ticket.user_id == current_user.id)
    )
    result = await db.execute(query)
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    # Mark as read for customer
    needs_commit = False
    if getattr(ticket, "user_unread", False):
        ticket.user_unread = False
        needs_commit = True
    for m in ticket.messages:
        if m.is_admin_reply and not getattr(m, "is_read", False):
            m.is_read = True
            needs_commit = True
    if needs_commit:
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
        user_unread=False,
        admin_unread=bool(getattr(ticket, "admin_unread", False)),
        messages=[
            TicketMessageResponse(
                id=m.id,
                ticket_id=m.ticket_id,
                sender_id=m.sender_id,
                sender_username=m.sender.username if m.sender else ("Support Staff" if m.is_admin_reply else "User"),
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
async def reply_to_ticket(
    ticket_id: uuid.UUID,
    reply_in: TicketReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Customer reply to an existing support ticket thread.
    Flags ticket as unread for the admin.
    """
    query = (
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(Ticket.id == ticket_id, Ticket.user_id == current_user.id)
    )
    result = await db.execute(query)
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    # Add message
    msg = TicketMessage(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        message=reply_in.message,
        is_admin_reply=False,
        is_read=False
    )
    ticket.status = TicketStatus.CUSTOMER_REPLY
    ticket.user_unread = False
    ticket.admin_unread = True  # Notify admin!
    db.add(msg)
    db.add(ticket)
    await db.commit()

    # Return refreshed ticket
    return await get_ticket_details(ticket_id=ticket_id, db=db, current_user=current_user)


@router.patch("/{ticket_id}/close", response_model=TicketResponse)
async def close_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Close an active ticket.
    """
    query = select(Ticket).where(Ticket.id == ticket_id, Ticket.user_id == current_user.id)
    result = await db.execute(query)
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    ticket.status = TicketStatus.CLOSED
    db.add(ticket)
    await db.commit()

    return await get_ticket_details(ticket_id=ticket_id, db=db, current_user=current_user)
