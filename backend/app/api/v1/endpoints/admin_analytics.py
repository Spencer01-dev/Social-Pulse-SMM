from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, List
from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.order import Order, OrderStatus
from app.models.service import Platform, Service
from app.models.transaction import Transaction, TransactionStatus, TransactionType
from app.models.user import User, UserRole
from app.schemas.analytics import (
    AnalyticsOverviewResponse,
    DailyRevenueItem,
    PlatformMetricItem,
    RecentActivityItem,
    TopServiceItem,
)

router = APIRouter(prefix="/admin/analytics", tags=["Admin Analytics & Telemetry"])


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_analytics_overview(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Get executive KPI metrics (Total Revenue, Provider Cost, Gross Profit, Users, Orders).
    """
    # 1. Orders Financial Aggregation
    order_agg = await db.execute(
        select(
            func.coalesce(func.sum(Order.charge), Decimal("0.00")),
            func.coalesce(func.sum(Order.provider_cost), Decimal("0.00")),
            func.coalesce(func.sum(Order.profit), Decimal("0.00")),
            func.count(Order.id)
        )
    )
    total_rev, total_cost, total_profit, total_orders = order_agg.first()

    # 2. Completed Orders Count
    comp_orders = await db.execute(
        select(func.count(Order.id)).where(Order.status == OrderStatus.COMPLETED)
    )
    total_completed = comp_orders.scalar() or 0

    # 3. Active Users Count
    user_count_res = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )
    total_active_users = user_count_res.scalar() or 0

    # 4. Total Deposits Volume
    deposits_res = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), Decimal("0.00")))
        .where(Transaction.type == TransactionType.DEPOSIT, Transaction.status == TransactionStatus.COMPLETED)
    )
    total_deposits = deposits_res.scalar() or Decimal("0.00")

    # Margin calculation
    profit_margin = Decimal("0.00")
    if total_rev > 0:
        profit_margin = round((total_profit / total_rev) * Decimal("100.00"), 1)

    return AnalyticsOverviewResponse(
        total_revenue=total_rev,
        total_provider_cost=total_cost,
        total_gross_profit=total_profit,
        profit_margin_percent=profit_margin,
        total_orders_count=total_orders,
        total_completed_orders=total_completed,
        total_active_users=total_active_users,
        total_deposits_volume=total_deposits,
        currency="KES"
    )


@router.get("/daily-revenue", response_model=List[DailyRevenueItem])
async def get_daily_revenue_trends(
    days: int = 14,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Get day-by-day revenue and profit timeline for the last N days.
    """
    start_date = datetime.now() - timedelta(days=days)
    
    query = (
        select(
            func.date_trunc('day', Order.created_at).label('day'),
            func.coalesce(func.sum(Order.charge), Decimal("0.00")),
            func.coalesce(func.sum(Order.profit), Decimal("0.00")),
            func.count(Order.id)
        )
        .where(Order.created_at >= start_date)
        .group_by(func.date_trunc('day', Order.created_at))
        .order_by(func.date_trunc('day', Order.created_at))
    )
    result = await db.execute(query)
    rows = result.all()

    # Map existing days into a dictionary
    db_map = {row[0].strftime("%b %d"): (row[1], row[2], row[3]) for row in rows if row[0]}

    # Ensure all days in the range have data points (even 0)
    timeline: List[DailyRevenueItem] = []
    for i in range(days - 1, -1, -1):
        d = datetime.now() - timedelta(days=i)
        label = d.strftime("%b %d")
        rev, prof, count = db_map.get(label, (Decimal("0.00"), Decimal("0.00"), 0))
        timeline.append(
            DailyRevenueItem(
                date_label=label,
                revenue=rev,
                profit=prof,
                orders_count=count
            )
        )

    return timeline


@router.get("/platform-breakdown", response_model=List[PlatformMetricItem])
async def get_platform_metrics(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Breakdown of orders, revenue, and profits categorized by social media platform.
    """
    query = (
        select(
            Service.platform,
            func.count(Order.id),
            func.coalesce(func.sum(Order.charge), Decimal("0.00")),
            func.coalesce(func.sum(Order.profit), Decimal("0.00"))
        )
        .join(Service, Order.service_id == Service.id)
        .group_by(Service.platform)
    )
    result = await db.execute(query)
    data = result.all()

    metrics = []
    for platform, count, rev, profit in data:
        metrics.append(
            PlatformMetricItem(
                platform=platform,
                name=platform.value.capitalize(),
                orders_count=count,
                revenue=rev,
                profit=profit
            )
        )

    # If empty, return standard popular platforms with 0
    if not metrics:
        for p in [Platform.INSTAGRAM, Platform.FACEBOOK, Platform.YOUTUBE, Platform.TIKTOK]:
            metrics.append(
                PlatformMetricItem(
                    platform=p,
                    name=p.value.capitalize(),
                    orders_count=0,
                    revenue=Decimal("0.00"),
                    profit=Decimal("0.00")
                )
            )

    return metrics


@router.get("/top-services", response_model=List[TopServiceItem])
async def get_top_services(
    limit: int = 5,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Get top performing services by revenue and order volume.
    """
    query = (
        select(
            Service.id,
            Service.name,
            Service.platform,
            func.count(Order.id).label("order_count"),
            func.coalesce(func.sum(Order.charge), Decimal("0.00")).label("total_rev"),
            func.coalesce(func.sum(Order.profit), Decimal("0.00")).label("total_profit")
        )
        .join(Order, Service.id == Order.service_id)
        .group_by(Service.id, Service.name, Service.platform)
        .order_by(desc("total_rev"))
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        TopServiceItem(
            service_id=str(r[0]),
            name=r[1],
            platform=r[2],
            orders_count=r[3],
            total_revenue=r[4],
            total_profit=r[5]
        )
        for r in rows
    ]


@router.get("/recent-activity", response_model=List[RecentActivityItem])
async def get_recent_activity(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Real-time feed of recent orders, deposits, and user registrations.
    """
    activities: List[RecentActivityItem] = []

    # Recent Orders
    orders_res = await db.execute(
        select(Order).options(selectinload(Order.user), selectinload(Order.service)).order_by(desc(Order.created_at)).limit(5)
    )
    for o in orders_res.scalars().all():
        activities.append(
            RecentActivityItem(
                id=str(o.id),
                event_type="order",
                title=f"New Order #{str(o.id)[:8]}",
                subtitle=f"{o.user.username if o.user else 'User'} ordered {o.quantity:,} {o.service.name if o.service else 'Units'}",
                amount=o.charge,
                currency=o.currency,
                timestamp=o.created_at
            )
        )

    # Recent Deposits
    deposits_res = await db.execute(
        select(Transaction).options(selectinload(Transaction.user)).where(Transaction.type == TransactionType.DEPOSIT).order_by(desc(Transaction.created_at)).limit(5)
    )
    for d in deposits_res.scalars().all():
        activities.append(
            RecentActivityItem(
                id=str(d.id),
                event_type="deposit",
                title=f"Wallet Deposit ({d.payment_method.value.upper()})",
                subtitle=f"{d.user.username if d.user else 'User'} funded account ({d.payment_reference or 'Direct'})",
                amount=d.amount,
                currency=d.currency,
                timestamp=d.created_at
            )
        )

    # Sort combined activities by timestamp descending
    activities.sort(key=lambda x: x.timestamp, reverse=True)
    return activities[:limit]
