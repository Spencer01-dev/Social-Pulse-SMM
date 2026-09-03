import uuid
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import cast, desc, func, select, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.order import Order, OrderStatus
from app.models.service import Service
from app.models.user import User, UserRole
from app.schemas.order import AdminOrderResponse, OrderStatusUpdate
from app.workers.order_tasks import sync_active_orders

router = APIRouter(prefix="/admin/orders", tags=["Admin Orders Monitoring"])


@router.get("", response_model=List[AdminOrderResponse])
async def list_admin_orders(
    status: Optional[OrderStatus] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    List all platform orders with financial metrics, profit, user details, and provider status.
    """
    query = (
        select(Order)
        .options(
            selectinload(Order.user),
            selectinload(Order.service),
            selectinload(Order.provider)
        )
        .order_by(desc(Order.created_at))
        .offset(skip)
        .limit(limit)
    )

    if status:
        query = query.where(Order.status == status)
    if search:
        search_clean = search.strip().lstrip('#').lower()
        pattern = f"%{search_clean}%"
        query = query.join(Order.user, isouter=True).join(Order.service, isouter=True)
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
    orders = result.scalars().all()

    return [
        AdminOrderResponse(
            id=o.id,
            order_number=o.order_number,
            user_id=o.user_id,
            user_email=o.user.email if o.user else "N/A",
            username=o.user.username if o.user else "N/A",
            service_id=o.service_id,
            service_name=o.service.name if o.service else "SMM Service",
            platform=o.service.platform if o.service else "instagram",
            provider_name=o.provider.name if o.provider else "Direct",
            provider_order_id=o.provider_order_id,
            target_link=o.target_link,
            quantity=o.quantity,
            start_count=o.start_count,
            remains=o.remains,
            charge=o.charge,
            provider_cost=o.provider_cost,
            profit=o.profit,
            currency=o.currency,
            status=o.status,
            error_message=o.error_message,
            created_at=o.created_at,
            updated_at=o.updated_at
        )
        for o in orders
    ]


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
        if order.charge > 0 and order.user:
            from app.models.transaction import PaymentMethod, Transaction, TransactionStatus, TransactionType
            from decimal import Decimal
            balance_before = order.user.balance
            balance_after = balance_before + order.charge
            order.user.balance = balance_after
            db.add(order.user)

            refund_tx = Transaction(
                user_id=order.user.id,
                order_id=order.id,
                type=TransactionType.ORDER_REFUND,
                amount=order.charge,
                balance_before=balance_before,
                balance_after=balance_after,
                currency=order.currency or "KES",
                payment_method=PaymentMethod.INTERNAL,
                payment_reference=f"ADMIN-REFUND-{str(order.id)[:8]}",
                status=TransactionStatus.COMPLETED,
                description=f"Admin canceled & refunded Order #{str(order.id)[:8]}",
            )
            db.add(refund_tx)

    db.add(order)
    await db.commit()
    await db.refresh(order)

    return AdminOrderResponse(
        id=order.id,
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
        provider_cost=order.provider_cost,
        profit=order.profit,
        currency=order.currency,
        status=order.status,
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
    Retry submitting a failed or queued order directly to Delix Gains KE.
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
        provider_cost=order.provider_cost,
        profit=order.profit,
        currency=order.currency,
        status=order.status,
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
