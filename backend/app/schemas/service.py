import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field

from app.models.service import MarkupType, Platform


# ==========================================
# CUSTOMER FACING SCHEMAS (Safe / No Leaks)
# ==========================================

class CustomerServiceResponse(BaseModel):
    id: uuid.UUID
    platform: Platform
    name: str
    description: Optional[str] = None
    service_type: str
    category: str
    rate: Decimal = Field(..., description="Customer selling rate per 1,000 units in KES")
    min_quantity: int
    max_quantity: int
    refill_available: bool
    cancel_available: bool

    class Config:
        from_attributes = True


class PlatformSummary(BaseModel):
    platform: Platform
    name: str
    icon: str
    service_count: int


# ==========================================
# ADMIN SCHEMAS (Full Access / Margins)
# ==========================================

class AdminServiceResponse(BaseModel):
    id: uuid.UUID
    provider_id: Optional[uuid.UUID] = None
    provider_service_id: str
    platform: Platform
    name: str
    description: Optional[str] = None
    service_type: str
    category: str
    provider_rate: Decimal
    selling_rate: Decimal
    profit_margin: Decimal
    markup_type: MarkupType
    markup_value: Decimal
    min_quantity: int
    max_quantity: int
    refill_available: bool
    cancel_available: bool
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    selling_rate: Optional[Decimal] = None
    markup_type: Optional[MarkupType] = None
    markup_value: Optional[Decimal] = None
    min_quantity: Optional[int] = None
    max_quantity: Optional[int] = None
    is_active: Optional[bool] = None
    platform: Optional[Platform] = None
    category: Optional[str] = None


class BulkMarkupRequest(BaseModel):
    platform: Optional[Platform] = None
    category: Optional[str] = None
    markup_type: MarkupType = MarkupType.PERCENTAGE
    markup_value: Decimal = Field(..., gt=0, description="Percentage (e.g. 50%) or fixed addition in KES")


class SyncServicesResponse(BaseModel):
    provider_slug: str
    total_fetched: int
    created: int
    updated: int
    message: str
