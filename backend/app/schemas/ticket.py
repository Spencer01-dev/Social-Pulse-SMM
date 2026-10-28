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
    is_read: bool = False
    created_at: datetime


class TicketCreate(BaseModel):
    subject: str = Field(..., min_length=3, max_length=255)
    priority: TicketPriority = TicketPriority.MEDIUM
    order_id: Optional[uuid.UUID] = None
    message: str = Field(..., min_length=5, description="Initial issue description or inquiry")


class AdminTicketCreate(BaseModel):
    user_id: uuid.UUID
    order_id: Optional[uuid.UUID] = None
    subject: str = Field(..., min_length=3, max_length=255)
    priority: TicketPriority = TicketPriority.MEDIUM
    message: str = Field(..., min_length=1, description="Message from admin to customer")


class TicketReplyRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Message response")


class TicketStatusUpdate(BaseModel):
    status: TicketStatus


class UnreadCountResponse(BaseModel):
    unread_count: int


class TicketResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    order_id: Optional[uuid.UUID] = None
    subject: str
    priority: TicketPriority
    status: TicketStatus
    user_unread: bool = False
    admin_unread: bool = False
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
    user_unread: bool = False
    admin_unread: bool = False
    last_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
