import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field

from app.models.child_panel import ChildPanelStatus


class ChildPanelCreate(BaseModel):
    domain: str = Field(..., min_length=3, max_length=255, description="Custom domain e.g. bestsmmkenya.com")
    admin_username: str = Field(..., min_length=3, max_length=50, description="Administrator username for child panel")
    admin_password: str = Field(..., min_length=6, max_length=100, description="Administrator password")
    currency: str = Field("KES", max_length=10)
    auto_renew: bool = True


class ChildPanelResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    domain: str
    admin_username: str
    currency: str
    price_per_month: Decimal
    status: ChildPanelStatus
    nameserver1: str
    nameserver2: str
    expires_at: datetime
    auto_renew: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChildPanelStatusUpdate(BaseModel):
    status: ChildPanelStatus
    notes: Optional[str] = None
