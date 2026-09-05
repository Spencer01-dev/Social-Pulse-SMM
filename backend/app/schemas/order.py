import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
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
    service_id: uuid.UUID
    service_name: str
    platform: Platform
    target_link: str
    quantity: int
    start_count: int
    remains: int
    charge: Decimal
    currency: str
    status: OrderStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AdminOrderResponse(BaseModel):
    id: uuid.UUID
    order_number: Optional[int] = None
    user_id: uuid.UUID
    user_email: str
    username: str
    service_id: uuid.UUID
    service_name: str
    platform: Platform
    provider_name: Optional[str] = None
    provider_order_id: Optional[str] = None
    target_link: str
    quantity: int
    start_count: int
    remains: int
    charge: Decimal
    provider_cost: Decimal
    profit: Decimal
    currency: str
    status: OrderStatus
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    start_count: Optional[int] = None
    remains: Optional[int] = None
    error_message: Optional[str] = None
