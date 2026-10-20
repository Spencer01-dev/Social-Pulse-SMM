import uuid
from datetime import date as date_type, datetime, timezone
from decimal import Decimal
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, cast, Date, desc, func, or_, select, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.order import Order, OrderStatus
from app.models.provider import Provider
from app.models.service import Service
from app.models.user import User, UserRole
from app.schemas.order import AdminOrderResponse, OrderStatusUpdate
from app.workers.order_tasks import sync_active_orders, sync_single_order

router = APIRouter(prefix="/admin/orders", tags=["Admin Orders Monitoring"])


@router.get("", response_model=List[AdminOrderResponse])
async def list_admin_orders(
    status: Optional[OrderStatus] = None,
    search: Optional[str] = None,
    date: Optional[str] = Query(None, description="Filter by date (YYYY-MM-DD)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    List all platform orders with financial metrics, profit, user details, and provider status.
    Optionally filter by a specific date to see that day's activity.
    """
    query = (
        select(
            Order,
            User.email.label("user_email"),
            User.username.label("user_username"),
            Service.name.label("service_name"),
            Service.platform.label("service_platform"),
            Service.refill_available.label("service_refill_available"),
            Provider.slug.label("provider_slug")
        )
        .join(User, Order.user_id == User.id, isouter=True)
        .join(Service, Order.service_id == Service.id, isouter=True)
        .join(Provider, Order.provider_id == Provider.id, isouter=True)
        .order_by(desc(Order.created_at))
        .offset(skip)
        .limit(limit)
    )

    if status:
        query = query.where(Order.status == status)

    # Filter by specific date (YYYY-MM-DD) when calendar date is selected
    if date and date.strip():
        try:
            parsed_date = date_type.fromisoformat(date.strip())
            start_dt = datetime(parsed_date.year, parsed_date.month, parsed_date.day, 0, 0, 0, tzinfo=timezone.utc)
            end_dt = datetime(parsed_date.year, parsed_date.month, parsed_date.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
            start_naive = datetime(parsed_date.year, parsed_date.month, parsed_date.day, 0, 0, 0)
            end_naive = datetime(parsed_date.year, parsed_date.month, parsed_date.day, 23, 59, 59, 999999)
            query = query.where(
                or_(
                    and_(Order.created_at >= start_dt, Order.created_at <= end_dt),
                    and_(Order.created_at >= start_naive, Order.created_at <= end_naive),
                    cast(Order.created_at, Date) == parsed_date
                )
            )
        except ValueError:
            pass  # Ignore invalid date format, return all orders

    if search:
        search_clean = search.strip().lstrip('#').lower()
        pattern = f"%{search_clean}%"
        query = query.where(
            (cast(Order.order_number, String).ilike(pattern)) |
            (cast(Order.id, String).ilike(pattern)) |
            (Order.target_link.ilike(pattern)) |
            (Order.provider_order_id.ilike(pattern)) |
            (User.email.ilike(pattern)) |
            (User.username.ilike(pattern)) |
            (Service.name.ilike(pattern))
        )

    result = await db.execute(query)
    rows = result.all()

    response_items = []
    for o, u_email, u_name, svc_name, svc_plat, svc_refill, prov_slug in rows:
        try:
            prov_name = "Direct"
            if prov_slug:
                s_lower = str(prov_slug).lower()
                prov_name = "JustAnotherPanel (JAP)" if "jap" in s_lower else str(prov_slug).capitalize()

            plat_str = "instagram"
            if svc_plat:
                plat_str = str(getattr(svc_plat, "value", svc_plat) or "instagram")

            chg = Decimal(str(o.charge)) if o.charge is not None else Decimal("0.00")
            ws_cost = Decimal(str(o.wholesale_cost)) if o.wholesale_cost is not None else Decimal("0.00")
            prov_cost = Decimal(str(o.provider_cost)) if o.provider_cost is not None else Decimal("0.00")
            prof_val = Decimal(str(o.profit)) if o.profit is not None else Decimal("0.00")

            if o.tenant_id and ws_cost > Decimal("0.00"):
                calc_profit = ws_cost - prov_cost
            else:
                calc_profit = prof_val

            st_val = getattr(o, "status", "pending")
            st_str = str(getattr(st_val, "value", getattr(st_val, "name", st_val)) or "pending").lower()

            response_items.append(
                AdminOrderResponse(
                    id=o.id,
                    order_number=o.order_number,
                    tenant_id=o.tenant_id,
                    user_id=o.user_id,
                    user_email=u_email or "N/A",
                    username=u_name or "Customer",
                    service_id=o.service_id,
                    service_name=svc_name or "SMM Service",
                    platform=plat_str,
                    provider_name=prov_name,
                    provider_order_id=str(o.provider_order_id) if o.provider_order_id else None,
                    target_link=o.target_link or "",
                    quantity=o.quantity or 0,
                    start_count=o.start_count or 0,
                    remains=o.remains or 0,
                    charge=chg,
                    wholesale_cost=ws_cost,
                    provider_cost=prov_cost,
                    profit=calc_profit,
                    currency=o.currency or "KES",
                    status=st_str,
                    refill_available=bool(svc_refill) if svc_refill is not None else False,
                    error_message=str(o.error_message) if o.error_message else None,
                    created_at=o.created_at,
                    updated_at=o.updated_at or o.created_at
                )
            )
        except Exception as item_err:
            print(f"[!] Warning: error formatting order {getattr(o, 'id', None)}: {item_err}")
            continue

    return response_items


@router.patch("/{order_id}/status", response_model=AdminOrderResponse)
async def override_order_status(
    order_id: uuid.UUID,
    update_in: OrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Manually override the status, start count, or remains of an order.
    """
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.user),
            selectinload(Order.service),
            selectinload(Order.provider)
        )
        .where(Order.id == order_id)
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    old_status = order.status
    order.status = update_in.status
    if update_in.start_count is not None:
        order.start_count = update_in.start_count
    if update_in.remains is not None:
        order.remains = update_in.remains
    if update_in.error_message is not None:
        order.error_message = update_in.error_message

    # Auto-refund if admin overrides status to Canceled or Failed
    if update_in.status in [OrderStatus.CANCELED, OrderStatus.FAILED] and old_status not in [OrderStatus.CANCELED, OrderStatus.FAILED]:
        from app.services.refund_service import refund_order
        await refund_order(db, order, reason="Admin status override")

    db.add(order)
    await db.commit()
    await db.refresh(order)

    return AdminOrderResponse(
        id=order.id,
        order_number=order.order_number,
        tenant_id=order.tenant_id,
        user_id=order.user_id,
        user_email=order.user.email if order.user else "N/A",
        username=order.user.username if order.user else "N/A",
        service_id=order.service_id,
        service_name=order.service.name if order.service else "SMM Service",
        platform=order.service.platform if order.service else "instagram",
        provider_name=order.provider.name if order.provider else "Direct",
        provider_order_id=order.provider_order_id,
        target_link=order.target_link,
        quantity=order.quantity,
        start_count=order.start_count,
        remains=order.remains,
        charge=order.charge,
        wholesale_cost=order.wholesale_cost or Decimal("0.00"),
        provider_cost=order.provider_cost,
        profit=(
            (order.wholesale_cost - order.provider_cost)
            if (order.tenant_id and order.wholesale_cost and order.wholesale_cost > Decimal("0.00"))
            else order.profit
        ),
        currency=order.currency,
        status=order.status,
        refill_available=order.service.refill_available if order.service else False,
        error_message=order.error_message,
        created_at=order.created_at,
        updated_at=order.updated_at
    )


@router.post("/{order_id}/retry", response_model=AdminOrderResponse)
async def retry_order_dispatch(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Retry submitting a failed or queued order directly to upstream provider.
    """
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.user),
            selectinload(Order.service),
            selectinload(Order.provider)
        )
        .where(Order.id == order_id)
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    from app.providers.router import SmartProviderRouter
    try:
        p_id, p_order_id, msg = await SmartProviderRouter.dispatch_with_failover(
            service=order.service,
            target_link=order.target_link,
            quantity=order.quantity,
            db=db,
            comments=order.custom_comments
        )
        order.provider_order_id = p_order_id
        order.status = OrderStatus.IN_PROGRESS if p_order_id else OrderStatus.PROCESSING
        order.error_message = None
    except Exception as e:
        order.error_message = str(e)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Retry failed: {str(e)}")

    db.add(order)
    await db.commit()
    await db.refresh(order)

    return AdminOrderResponse(
        id=order.id,
        order_number=order.order_number,
        tenant_id=order.tenant_id,
        user_id=order.user_id,
        user_email=order.user.email if order.user else "N/A",
        username=order.user.username if order.user else "N/A",
        service_id=order.service_id,
        service_name=order.service.name if order.service else "SMM Service",
        platform=order.service.platform if order.service else "instagram",
        provider_name=order.provider.name if order.provider else "Direct",
        provider_order_id=order.provider_order_id,
        target_link=order.target_link,
        quantity=order.quantity,
        start_count=order.start_count,
        remains=order.remains,
        charge=order.charge,
        wholesale_cost=order.wholesale_cost or Decimal("0.00"),
        provider_cost=order.provider_cost,
        profit=(
            (order.wholesale_cost - order.provider_cost)
            if (order.tenant_id and order.wholesale_cost and order.wholesale_cost > Decimal("0.00"))
            else order.profit
        ),
        currency=order.currency,
        status=order.status,
        refill_available=order.service.refill_available if order.service else False,
        error_message=order.error_message,
        created_at=order.created_at,
        updated_at=order.updated_at
    )


@router.post("/sync-active")
async def trigger_active_orders_sync(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Manually trigger a sync cycle for all active orders from external providers.
    """
    checked, updated = await sync_active_orders(db)
    return {
        "message": f"Order synchronization finished. Checked {checked} active orders, updated {updated}.",
        "checked": checked,
        "updated": updated
    }


@router.post("/{order_id}/sync")
async def admin_sync_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Instantly check upstream provider status and live progress (remains, start count) for a single order.
    """
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.service), selectinload(Order.provider), selectinload(Order.user))
        .where(Order.id == order_id)
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    changed, updated_order = await sync_single_order(db, order)
    delivered = max(0, updated_order.quantity - updated_order.remains)
    pct = round((delivered / (updated_order.quantity or 1)) * 100)

    return {
        "success": True,
        "message": f"Order #{str(updated_order.id)[:8]} synced: {delivered}/{updated_order.quantity} delivered ({pct}%), {updated_order.remains} remaining.",
        "status": updated_order.status.value,
        "start_count": updated_order.start_count,
        "remains": updated_order.remains,
        "delivered": delivered,
        "progress_percent": pct,
        "changed": changed
    }


@router.post("/{order_id}/refill")
async def admin_refill_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Admin triggers an automated refill request on the upstream provider for any order.
    """
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.service),
            selectinload(Order.provider)
        )
        .where(Order.id == order_id)
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if not order.provider_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order has not been dispatched to an upstream provider or has no provider order ID."
        )

    provider_slug = order.provider.slug if order.provider else "jap"
    from app.providers.manager import get_provider
    provider_client = get_provider(slug=provider_slug)

    try:
        refill_resp = await provider_client.refill_order(str(order.provider_order_id))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Provider connection error: {str(exc)}"
        )

    if not refill_resp.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider Notice: {refill_resp.error or 'Refill not eligible yet.'}"
        )

    return {
        "success": True,
        "refill_id": refill_resp.refill_id,
        "order_id": str(order.id),
        "message": f"Refill requested on {provider_slug.upper()}! Provider Refill ID: #{refill_resp.refill_id}"
    }
