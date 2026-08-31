import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.models.ticket import TicketPriority, TicketStatus


class TicketMessageResponse(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    sender_id: uuid.UUID
    sender_username: str
    message: str
    is_admin_reply: bool
    created_at: datetime


class TicketCreate(BaseModel):
    subject: str = Field(..., min_length=3, max_length=255)
    priority: TicketPriority = TicketPriority.MEDIUM
    order_id: Optional[uuid.UUID] = None
    message: str = Field(..., min_length=5, description="Initial issue description or inquiry")


class TicketReplyRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Message response")


class TicketStatusUpdate(BaseModel):
    status: TicketStatus


class TicketResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    order_id: Optional[uuid.UUID] = None
    subject: str
    priority: TicketPriority
    status: TicketStatus
    messages: List[TicketMessageResponse] = []
    created_at: datetime
    updated_at: datetime


class TicketSummaryResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    order_id: Optional[uuid.UUID] = None
    subject: str
    priority: TicketPriority
    status: TicketStatus
    last_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
