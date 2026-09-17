from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel

from app.models.order import OrderStatus
from app.models.service import Platform
from app.models.user import UserRole


class TodayEconomics(BaseModel):
    revenue: Decimal = Decimal("0.00")
    provider_cost: Decimal = Decimal("0.00")
    gross_profit: Decimal = Decimal("0.00")
    refunds: Decimal = Decimal("0.00")
    net_profit: Decimal = Decimal("0.00")
    orders_total: int = 0
    orders_completed: int = 0
    orders_processing: int = 0
    orders_failed: int = 0


class SaasPanelMetrics(BaseModel):
    active_panels: int = 0
    monthly_recurring_revenue: Decimal = Decimal("0.00")
    expired_panels: int = 0
    provisioning_panels: int = 0


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
    today: Optional[TodayEconomics] = None
    saas: Optional[SaasPanelMetrics] = None


class DailyRevenueItem(BaseModel):
    date_label: str
    full_date: Optional[str] = None
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
