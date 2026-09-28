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
    status: str
    provisioning_step: Optional[str] = "pending"
    last_error: Optional[str] = None
    branding_json: Optional[dict] = None
    metadata_json: Optional[dict] = None
    nameserver1: str
    nameserver2: str
    expires_at: datetime
    auto_renew: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChildPanelPaymentGatewayConfig(BaseModel):
    gateway_provider: str = Field("payhero", description="payhero | paystack | manual")
    # PayHero Fields
    payhero_channel_id: Optional[str] = Field(None, description="PayHero Till/Paybill Channel ID")
    payhero_api_key: Optional[str] = Field(None, description="PayHero API Key")
    payhero_api_secret: Optional[str] = Field(None, description="PayHero API Secret (if basic auth)")
    payhero_account_name: Optional[str] = Field(None, description="PayHero Account / Till Business Name")
    # Paystack Fields
    paystack_public_key: Optional[str] = Field(None, description="Paystack Public Key")
    paystack_secret_key: Optional[str] = Field(None, description="Paystack Secret Key")
    # Manual Till Fields
    manual_till_number: Optional[str] = Field(None, description="Manual Till or Paybill Number")
    manual_account_name: Optional[str] = Field(None, description="Manual Till Business Name")
    manual_instructions: Optional[str] = Field(None, description="Instructions shown to end customer")
    is_active: bool = True


class ChildPanelStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


class ChildPanelOrderStats(BaseModel):
    total_orders: int
    pending_orders: int
    processing_orders: int
    in_progress_orders: int
    completed_orders: int
    canceled_orders: int
    total_revenue: Decimal
    total_profit: Decimal


class ChildPanelOrderResponse(BaseModel):
    id: uuid.UUID
    order_number: Optional[int] = None
    user_id: uuid.UUID
    username: str
    service_id: uuid.UUID
    service_name: str
    target_link: str
    quantity: int
    charge: Decimal
    profit: Decimal
    status: str
    remains: int
    start_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class ChildPanelUserResponse(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    phone_number: Optional[str] = None
    balance: Decimal
    currency: str
    is_active: bool
    total_orders: int
    total_spent: Decimal
    created_at: datetime

    class Config:
        from_attributes = True


class ChildPanelUserBalanceAdjust(BaseModel):
    amount: Decimal = Field(..., description="Amount to credit or debit")
    reason: Optional[str] = Field("Manual panel balance adjustment", max_length=255)


class ChildPanelUserStatusUpdate(BaseModel):
    is_active: bool

