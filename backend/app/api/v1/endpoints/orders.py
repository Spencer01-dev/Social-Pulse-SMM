import uuid
from decimal import Decimal
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user
from app.core.database import get_db
from app.models.order import Order, OrderStatus
from app.models.service import Service
from app.models.user import User
from app.providers.manager import get_provider
from app.schemas.order import CustomerOrderResponse, OrderCreate

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post("", response_model=CustomerOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    order_in: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Place a new social media marketing order.
    Checks wallet balance, reserves funds, and dispatches to the service provider.
    """
    # 1. Fetch requested service
    service_query = await db.execute(
        select(Service)
        .options(selectinload(Service.provider))
        .where(Service.id == order_in.service_id, Service.is_active == True)
    )
    service = service_query.scalars().first()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested service is currently inactive or unavailable."
        )

    # 2. Validate quantity boundaries
    if order_in.quantity < service.min_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum quantity for this service is {service.min_quantity:,}."
        )
    if order_in.quantity > service.max_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum quantity for this service is {service.max_quantity:,}."
        )

    # 3. Calculate financial metrics (in KES)
    total_charge = round((service.selling_rate * Decimal(order_in.quantity)) / Decimal(1000), 2)
    provider_cost = round((service.provider_rate * Decimal(order_in.quantity)) / Decimal(1000), 2)
    profit = total_charge - provider_cost

    # 4. Check user wallet balance
    if current_user.balance < total_charge:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient wallet balance. Total cost: KES {total_charge:,.2f} | Available balance: KES {current_user.balance:,.2f}. Please add funds to proceed."
        )

    # 5. Deduct funds from user balance
    current_user.balance -= total_charge
    db.add(current_user)

    # 6. Sanitize and canonicalize target URL
    from app.core.link_cleaner import sanitize_and_canonicalize_target_link
    target_link_clean = await sanitize_and_canonicalize_target_link(order_in.target_link)

    # 7. Dispatch order using Multi-Provider Smart Router with Auto-Failover
    provider_order_id = None
    initial_status = OrderStatus.PENDING
    error_msg = None

    try:
        from app.providers.router import SmartProviderRouter
        p_id, p_order_id, msg = await SmartProviderRouter.dispatch_with_failover(
            service=service,
            target_link=target_link_clean,
            quantity=order_in.quantity,
            db=db,
            comments=order_in.custom_comments
        )
        provider_order_id = p_order_id
        initial_status = OrderStatus.IN_PROGRESS if p_order_id else OrderStatus.PROCESSING
    except Exception as exc:
        error_msg = f"Provider failover exhausted: {str(exc)}"
        initial_status = OrderStatus.PENDING

    # 7. Persist order record in database
    order = Order(
        user_id=current_user.id,
        service_id=service.id,
        provider_id=service.provider_id,
        provider_order_id=provider_order_id,
        target_link=target_link_clean,
        quantity=order_in.quantity,
        start_count=0,
        remains=order_in.quantity,
        charge=total_charge,
        provider_cost=provider_cost,
        profit=profit,
        currency="KES",
        status=initial_status,
        custom_comments=order_in.custom_comments,
        error_message=error_msg
    )

    db.add(order)
    await db.commit()
    await db.refresh(order)

    return CustomerOrderResponse(
        id=order.id,
        service_id=service.id,
        service_name=service.name,
        platform=service.platform,
        target_link=order.target_link,
        quantity=order.quantity,
        start_count=order.start_count,
        remains=order.remains,
        charge=order.charge,
        currency=order.currency,
        status=order.status,
        created_at=order.created_at,
        updated_at=order.updated_at
    )


@router.get("", response_model=List[CustomerOrderResponse])
async def list_my_orders(
    status: Optional[OrderStatus] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    List all orders created by the authenticated user with filters and search.
    """
    query = (
        select(Order)
        .options(selectinload(Order.service))
        .where(Order.user_id == current_user.id)
        .order_by(desc(Order.created_at))
        .offset(skip)
        .limit(limit)
    )

    if status:
        query = query.where(Order.status == status)
    if search:
        pattern = f"%{search.lower()}%"
        query = query.where(
            (Order.target_link.ilike(pattern))
        )

    result = await db.execute(query)
    orders = result.scalars().all()

    return [
        CustomerOrderResponse(
            id=o.id,
            service_id=o.service_id,
            service_name=o.service.name if o.service else "SMM Service",
            platform=o.service.platform if o.service else "instagram",
            target_link=o.target_link,
            quantity=o.quantity,
            start_count=o.start_count,
            remains=o.remains,
            charge=o.charge,
            currency=o.currency,
            status=o.status,
            created_at=o.created_at,
            updated_at=o.updated_at
        )
        for o in orders
    ]


@router.get("/{order_id}", response_model=CustomerOrderResponse)
async def get_order_details(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Get full details of a specific order.
    """
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.service))
        .where(Order.id == order_id, Order.user_id == current_user.id)
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    return CustomerOrderResponse(
        id=order.id,
        service_id=order.service_id,
        service_name=order.service.name if order.service else "SMM Service",
        platform=order.service.platform if order.service else "instagram",
        target_link=order.target_link,
        quantity=order.quantity,
        start_count=order.start_count,
        remains=order.remains,
        charge=order.charge,
        currency=order.currency,
        status=order.status,
        created_at=order.created_at,
        updated_at=order.updated_at
    )
