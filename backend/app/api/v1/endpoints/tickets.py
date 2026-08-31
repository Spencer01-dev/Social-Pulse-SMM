import uuid
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user
from app.core.database import get_db
from app.models.ticket import Ticket, TicketMessage, TicketStatus
from app.models.user import User
from app.schemas.ticket import (
    TicketCreate,
    TicketMessageResponse,
    TicketReplyRequest,
    TicketResponse,
    TicketSummaryResponse,
)

router = APIRouter(prefix="/tickets", tags=["Customer Support Tickets"])


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    ticket_in: TicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Open a new support ticket.
    """
    ticket = Ticket(
        user_id=current_user.id,
        order_id=ticket_in.order_id,
        subject=ticket_in.subject,
        priority=ticket_in.priority,
        status=TicketStatus.OPEN
    )
    db.add(ticket)
    await db.flush()

    # Initial message
    first_msg = TicketMessage(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        message=ticket_in.message,
        is_admin_reply=False
    )
    db.add(first_msg)
    await db.commit()
    await db.refresh(ticket)

    return TicketResponse(
        id=ticket.id,
        user_id=ticket.user_id,
        username=current_user.username,
        order_id=ticket.order_id,
        subject=ticket.subject,
        priority=ticket.priority,
        status=ticket.status,
        messages=[
            TicketMessageResponse(
                id=first_msg.id,
                ticket_id=first_msg.ticket_id,
                sender_id=first_msg.sender_id,
                sender_username=current_user.username,
                message=first_msg.message,
                is_admin_reply=first_msg.is_admin_reply,
                created_at=first_msg.created_at
            )
        ],
        created_at=ticket.created_at,
        updated_at=ticket.updated_at
    )


@router.get("", response_model=List[TicketSummaryResponse])
async def list_my_tickets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    List all support tickets created by the logged-in customer.
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
                sender_username=m.sender.username if m.sender else "User",
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
async def reply_to_ticket(
    ticket_id: uuid.UUID,
    reply_in: TicketReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Customer reply to an existing support ticket thread.
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
        is_admin_reply=False
    )
    ticket.status = TicketStatus.CUSTOMER_REPLY
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
