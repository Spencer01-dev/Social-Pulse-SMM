import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from pydantic import BaseModel, Field, HttpUrl

from app.models.order import OrderStatus
from app.models.service import Platform


class OrderCreate(BaseModel):
    service_id: uuid.UUID
    target_link: str = Field(..., min_length=5, max_length=500, description="Target post, profile, or video URL")
    quantity: int = Field(..., ge=100, description="Quantity of units requested. Platform minimum is 100.")
    custom_comments: Optional[str] = None


class CustomerOrderResponse(BaseModel):
    id: uuid.UUID
    order_number: Optional[int] = None
    tenant_id: Optional[uuid.UUID] = None
    service_id: Optional[uuid.UUID] = None
    service_name: Optional[str] = "SMM Service"
    platform: Optional[Any] = "instagram"
    target_link: Optional[str] = ""
    quantity: Optional[int] = 0
    start_count: Optional[int] = 0
    remains: Optional[int] = 0
    charge: Optional[Decimal] = Decimal("0.00")
    currency: Optional[str] = "KES"
    status: Any = OrderStatus.PENDING
    refill_available: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminOrderResponse(BaseModel):
    id: uuid.UUID
    order_number: Optional[int] = None
    tenant_id: Optional[uuid.UUID] = None
    user_id: Optional[uuid.UUID] = None
    user_email: Optional[str] = "N/A"
    username: Optional[str] = "N/A"
    service_id: Optional[uuid.UUID] = None
    service_name: Optional[str] = "SMM Service"
    platform: Optional[str] = "instagram"
    provider_name: Optional[str] = None
    provider_order_id: Optional[str] = None
    target_link: Optional[str] = ""
    quantity: Optional[int] = 0
    start_count: Optional[int] = 0
    remains: Optional[int] = 0
    charge: Optional[Decimal] = Decimal("0.00")
    wholesale_cost: Optional[Decimal] = Decimal("0.00")
    provider_cost: Optional[Decimal] = Decimal("0.00")
    profit: Optional[Decimal] = Decimal("0.00")
    currency: Optional[str] = "KES"
    status: Any = "pending"
    refill_available: bool = False
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    start_count: Optional[int] = None
    remains: Optional[int] = None
    error_message: Optional[str] = None
