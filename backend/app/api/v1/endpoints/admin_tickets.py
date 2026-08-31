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
    TicketMessageResponse,
    TicketReplyRequest,
    TicketResponse,
    TicketStatusUpdate,
    TicketSummaryResponse,
)

router = APIRouter(prefix="/admin/tickets", tags=["Admin Support Helpdesk"])


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

    return TicketResponse(
        id=ticket.id,
        user_id=ticket.user_id,
        username=ticket.user.username if ticket.user else "User",
        order_id=ticket.order_id,
        subject=ticket.subject,
        priority=ticket.priority,
        status=ticket.status,
        messages=[
            TicketMessageResponse(
                id=m.id,
                ticket_id=m.ticket_id,
                sender_id=m.sender_id,
                sender_username=m.sender.username if m.sender else "Support Staff",
                message=m.message,
                is_admin_reply=m.is_admin_reply,
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
        is_admin_reply=True
    )
    ticket.status = TicketStatus.ANSWERED
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
