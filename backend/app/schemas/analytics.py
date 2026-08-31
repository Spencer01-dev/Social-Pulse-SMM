from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel

from app.models.order import OrderStatus
from app.models.service import Platform
from app.models.user import UserRole


class AnalyticsOverviewResponse(BaseModel):
    total_revenue: Decimal
    total_provider_cost: Decimal
    total_gross_profit: Decimal
    profit_margin_percent: Decimal
    total_orders_count: int
    total_completed_orders: int
    total_active_users: int
    total_deposits_volume: Decimal
    currency: str = "KES"


class DailyRevenueItem(BaseModel):
    date_label: str
    revenue: Decimal
    profit: Decimal
    orders_count: int


class PlatformMetricItem(BaseModel):
    platform: Platform
    name: str
    orders_count: int
    revenue: Decimal
    profit: Decimal


class TopServiceItem(BaseModel):
    service_id: str
    name: str
    platform: Platform
    orders_count: int
    total_revenue: Decimal
    total_profit: Decimal


class RecentActivityItem(BaseModel):
    id: str
    event_type: str  # order, deposit, user_registered
    title: str
    subtitle: str
    amount: Optional[Decimal] = None
    currency: str = "KES"
    timestamp: datetime
