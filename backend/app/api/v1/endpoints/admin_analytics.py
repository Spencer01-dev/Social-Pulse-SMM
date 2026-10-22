import calendar
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, List
from fastapi import APIRouter, Depends
from sqlalchemy import case, cast, Date, desc, func, select
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
    TodayEconomics,
    SaasPanelMetrics,
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
    # Exclude canceled and failed orders from financial metrics (those are refunded)
    active_order_filter = ~Order.status.in_([OrderStatus.CANCELED, OrderStatus.FAILED])
    # Platform revenue = wholesale_cost for child panel orders, charge for direct orders
    # CRITICAL: Use NULLIF to treat 0 as NULL so fallback to provider_cost (not charge)
    # This prevents child panel customer retail charges from inflating SocialPulse revenue
    platform_rev_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        )),
        else_=Order.charge
    )
    # Platform profit = wholesale_cost - provider_cost for child panel, charge - provider_cost for direct
    platform_profit_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        ) - Order.provider_cost),
        else_=Order.charge - Order.provider_cost
    )
    order_agg = await db.execute(
        select(
            func.coalesce(func.sum(platform_rev_expr), Decimal("0.00")),
            func.coalesce(func.sum(Order.provider_cost), Decimal("0.00")),
            func.coalesce(func.sum(platform_profit_expr), Decimal("0.00")),
            func.count(Order.id)
        ).where(active_order_filter)
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

    # 5. Today's Provider Economics
    from app.models.child_panel import ChildPanel, ChildPanelStatus
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_rev_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        )),
        else_=Order.charge
    )
    today_profit_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        ) - Order.provider_cost),
        else_=Order.charge - Order.provider_cost
    )
    today_agg = await db.execute(
        select(
            func.coalesce(func.sum(today_rev_expr), Decimal("0.00")),
            func.coalesce(func.sum(Order.provider_cost), Decimal("0.00")),
            func.coalesce(func.sum(today_profit_expr), Decimal("0.00")),
            func.count(Order.id)
        ).where(active_order_filter, Order.created_at >= today_start)
    )
    t_rev, t_cost, t_gross, t_orders = today_agg.first()

    today_ref_res = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), Decimal("0.00")))
        .where(Transaction.type == TransactionType.ORDER_REFUND, Transaction.created_at >= today_start)
    )
    t_refunds = abs(today_ref_res.scalar() or Decimal("0.00"))
    t_net = max(Decimal("0.00"), t_gross - t_refunds)

    t_completed_res = await db.execute(
        select(func.count(Order.id)).where(Order.status == OrderStatus.COMPLETED, Order.created_at >= today_start)
    )
    t_completed = t_completed_res.scalar() or 0

    t_proc_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.status.in_([OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.IN_PROGRESS]),
            Order.created_at >= today_start
        )
    )
    t_processing = t_proc_res.scalar() or 0

    t_failed_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.status.in_([OrderStatus.FAILED, OrderStatus.CANCELED]),
            Order.created_at >= today_start
        )
    )
    t_failed = t_failed_res.scalar() or 0

    # 6. Child Panel SaaS Recurring Telemetry
    active_panels_res = await db.execute(
        select(func.count(ChildPanel.id)).where(ChildPanel.status == ChildPanelStatus.ACTIVE.value)
    )
    active_panels = active_panels_res.scalar() or 0

    expired_panels_res = await db.execute(
        select(func.count(ChildPanel.id)).where(ChildPanel.status == ChildPanelStatus.EXPIRED.value)
    )
    expired_panels = expired_panels_res.scalar() or 0

    prov_panels_res = await db.execute(
        select(func.count(ChildPanel.id)).where(
            ChildPanel.status.in_([
                ChildPanelStatus.PENDING.value,
                ChildPanelStatus.PAYMENT_CONFIRMED.value,
                ChildPanelStatus.CREATING_TENANT.value,
                ChildPanelStatus.CONFIGURING_DATABASE.value,
                ChildPanelStatus.CONFIGURING_DOMAIN.value,
                ChildPanelStatus.CONFIGURING_BRANDING.value,
                ChildPanelStatus.CONFIGURING_API.value,
                ChildPanelStatus.SSL_PENDING.value,
            ])
        )
    )
    prov_panels = prov_panels_res.scalar() or 0

    mrr_res = await db.execute(
        select(func.coalesce(func.sum(ChildPanel.price_per_month), Decimal("0.00")))
        .where(ChildPanel.status == ChildPanelStatus.ACTIVE.value)
    )
    mrr = mrr_res.scalar() or Decimal("0.00")

    today_economics = TodayEconomics(
        revenue=t_rev,
        provider_cost=t_cost,
        gross_profit=t_gross,
        refunds=t_refunds,
        net_profit=t_net,
        orders_total=t_orders,
        orders_completed=t_completed,
        orders_processing=t_processing,
        orders_failed=t_failed
    )

    saas_metrics = SaasPanelMetrics(
        active_panels=active_panels,
        monthly_recurring_revenue=mrr,
        expired_panels=expired_panels,
        provisioning_panels=prov_panels
    )

    return AnalyticsOverviewResponse(
        total_revenue=total_rev,
        total_provider_cost=total_cost,
        total_gross_profit=total_profit,
        profit_margin_percent=profit_margin,
        total_orders_count=total_orders,
        total_completed_orders=total_completed,
        total_active_users=total_active_users,
        total_deposits_volume=total_deposits,
        currency="KES",
        today=today_economics,
        saas=saas_metrics
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
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    day_expr = cast(Order.created_at, Date)
    
    daily_rev_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        )),
        else_=Order.charge
    )
    daily_profit_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        ) - Order.provider_cost),
        else_=Order.charge - Order.provider_cost
    )
    try:
        query = (
            select(
                day_expr.label('day'),
                func.coalesce(func.sum(daily_rev_expr), Decimal("0.00")),
                func.coalesce(func.sum(daily_profit_expr), Decimal("0.00")),
                func.count(Order.id)
            )
            .where(
                Order.created_at >= start_date,
                ~Order.status.in_([OrderStatus.CANCELED, OrderStatus.FAILED])
            )
            .group_by(day_expr)
            .order_by(day_expr)
        )
        result = await db.execute(query)
        rows = result.all()
    except Exception:
        start_naive = datetime.now() - timedelta(days=days)
        query = (
            select(
                day_expr.label('day'),
                func.coalesce(func.sum(daily_rev_expr), Decimal("0.00")),
                func.coalesce(func.sum(daily_profit_expr), Decimal("0.00")),
                func.count(Order.id)
            )
            .where(
                Order.created_at >= start_naive,
                ~Order.status.in_([OrderStatus.CANCELED, OrderStatus.FAILED])
            )
            .group_by(day_expr)
            .order_by(day_expr)
        )
        result = await db.execute(query)
        rows = result.all()

    # Map existing days into a dictionary keyed by ISO date YYYY-MM-DD
    db_map = {}
    for row in rows:
        if row[0]:
            iso_key = row[0].strftime("%Y-%m-%d") if hasattr(row[0], "strftime") else str(row[0])
            db_map[iso_key] = (row[1], row[2], row[3])

    # Ensure all days in the range have data points (even 0)
    timeline: List[DailyRevenueItem] = []
    now_utc = datetime.now(timezone.utc)
    for i in range(days - 1, -1, -1):
        d = now_utc - timedelta(days=i)
        iso_str = d.strftime("%Y-%m-%d")
        label = d.strftime("%b %d")
        rev, prof, count = db_map.get(iso_str, (Decimal("0.00"), Decimal("0.00"), 0))
        timeline.append(
            DailyRevenueItem(
                date_label=label,
                full_date=iso_str,
                revenue=rev,
                profit=prof,
                orders_count=count
            )
        )

    return timeline


@router.get("/monthly-summary")
async def get_monthly_summary(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Get aggregated total revenue, provider cost, gross profit, and order volume for a specific month and year.
    """
    days_in_month = calendar.monthrange(year, month)[1]
    start_dt_utc = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    end_dt_utc = datetime(year, month, days_in_month, 23, 59, 59, 999999, tzinfo=timezone.utc)
    start_dt_naive = datetime(year, month, 1, 0, 0, 0)
    end_dt_naive = datetime(year, month, days_in_month, 23, 59, 59, 999999)

    active_order_filter = ~Order.status.in_([OrderStatus.CANCELED, OrderStatus.FAILED])

    month_rev_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        )),
        else_=Order.charge
    )
    month_profit_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        ) - Order.provider_cost),
        else_=Order.charge - Order.provider_cost
    )
    try:
        query = (
            select(
                func.coalesce(func.sum(month_rev_expr), Decimal("0.00")),
                func.coalesce(func.sum(month_profit_expr), Decimal("0.00")),
                func.coalesce(func.sum(Order.provider_cost), Decimal("0.00")),
                func.count(Order.id)
            )
            .where(
                Order.created_at >= start_dt_utc,
                Order.created_at <= end_dt_utc,
                active_order_filter
            )
        )
        result = await db.execute(query)
        total_rev, total_profit, total_cost, total_orders = result.first()
    except Exception:
        query = (
            select(
                func.coalesce(func.sum(month_rev_expr), Decimal("0.00")),
                func.coalesce(func.sum(month_profit_expr), Decimal("0.00")),
                func.coalesce(func.sum(Order.provider_cost), Decimal("0.00")),
                func.count(Order.id)
            )
            .where(
                Order.created_at >= start_dt_naive,
                Order.created_at <= end_dt_naive,
                active_order_filter
            )
        )
        result = await db.execute(query)
        total_rev, total_profit, total_cost, total_orders = result.first()

    # Query daily breakdown for that month (include wholesale_cost + tenant_id for correct per-row calculation)
    try:
        daily_query = (
            select(Order.created_at, Order.charge, Order.profit, Order.id, Order.wholesale_cost, Order.tenant_id, Order.provider_cost)
            .where(
                Order.created_at >= start_dt_utc,
                Order.created_at <= end_dt_utc,
                active_order_filter
            )
            .order_by(Order.created_at.asc())
        )
        daily_res = await db.execute(daily_query)
        rows = daily_res.all()
    except Exception:
        daily_query = (
            select(Order.created_at, Order.charge, Order.profit, Order.id, Order.wholesale_cost, Order.tenant_id, Order.provider_cost)
            .where(
                Order.created_at >= start_dt_naive,
                Order.created_at <= end_dt_naive,
                active_order_filter
            )
            .order_by(Order.created_at.asc())
        )
        daily_res = await db.execute(daily_query)
        rows = daily_res.all()

    daily_map = {}
    for r in rows:
        created = r[0]
        if hasattr(created, "day"):
            d = created.day
            if d not in daily_map:
                daily_map[d] = {"revenue": Decimal("0.00"), "profit": Decimal("0.00"), "orders": 0}
            charge = Decimal(str(r[1] or 0))
            wholesale = Decimal(str(r[4] or 0)) if r[4] else Decimal("0")
            tenant = r[5]
            prov_cost = Decimal(str(r[6] or 0))
            # Platform revenue: for child panel orders use wholesale_cost (or provider_cost fallback)
            # NEVER use customer retail charge for child panel orders — that inflates admin revenue
            if tenant:
                effective_rev = wholesale if wholesale > Decimal("0") else prov_cost
                daily_map[d]["revenue"] += effective_rev
                daily_map[d]["profit"] += effective_rev - prov_cost
            else:
                daily_map[d]["revenue"] += charge
                daily_map[d]["profit"] += charge - prov_cost
            daily_map[d]["orders"] += 1

    days_list = []
    for d in range(1, days_in_month + 1):
        if d in daily_map:
            days_list.append({
                "day": d,
                "date": f"{year}-{month:02d}-{d:02d}",
                "revenue": float(daily_map[d]["revenue"]),
                "profit": float(daily_map[d]["profit"]),
                "orders_count": daily_map[d]["orders"],
            })

    total_rev_dec = Decimal(str(total_rev or 0))
    total_prof_dec = Decimal(str(total_profit or 0))
    margin = round(float((total_prof_dec / total_rev_dec) * Decimal("100.0")), 2) if total_rev_dec > 0 else 0.0

    return {
        "year": year,
        "month": month,
        "month_name": calendar.month_name[month],
        "total_revenue": float(total_rev_dec),
        "total_gross_profit": float(total_prof_dec),
        "total_provider_cost": float(total_cost or 0),
        "total_orders": int(total_orders or 0),
        "profit_margin_percent": margin,
        "days": days_list,
    }


@router.get("/platform-breakdown", response_model=List[PlatformMetricItem])
async def get_platform_metrics(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Breakdown of orders, revenue, and profits categorized by social media platform.
    """
    plat_rev_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        )),
        else_=Order.charge
    )
    plat_profit_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        ) - Order.provider_cost),
        else_=Order.charge - Order.provider_cost
    )
    query = (
        select(
            Service.platform,
            func.count(Order.id),
            func.coalesce(func.sum(plat_rev_expr), Decimal("0.00")),
            func.coalesce(func.sum(plat_profit_expr), Decimal("0.00"))
        )
        .join(Service, Order.service_id == Service.id)
        .where(~Order.status.in_([OrderStatus.CANCELED, OrderStatus.FAILED]))
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
    # Top services revenue: use platform-correct revenue (wholesale for child panel, charge for direct)
    top_rev_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        )),
        else_=Order.charge
    )
    top_profit_expr = case(
        (Order.tenant_id.isnot(None), func.coalesce(
            func.nullif(Order.wholesale_cost, Decimal("0.00")),
            Order.provider_cost
        ) - Order.provider_cost),
        else_=Order.charge - Order.provider_cost
    )
    query = (
        select(
            Service.id,
            Service.name,
            Service.platform,
            func.count(Order.id).label("order_count"),
            func.coalesce(func.sum(top_rev_expr), Decimal("0.00")).label("total_rev"),
            func.coalesce(func.sum(top_profit_expr), Decimal("0.00")).label("total_profit")
        )
        .join(Order, Service.id == Order.service_id)
        .where(~Order.status.in_([OrderStatus.CANCELED, OrderStatus.FAILED]))
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
