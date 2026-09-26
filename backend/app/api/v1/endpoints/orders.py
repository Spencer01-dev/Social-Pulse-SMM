import uuid
from decimal import Decimal
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import cast, desc, select, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user
from app.api.v1.endpoints.tenant import MAIN_PLATFORM_DOMAINS
from app.core.database import get_db
from app.models.child_panel import ChildPanel
from app.models.order import Order, OrderStatus
from app.models.service import Service
from app.models.transaction import PaymentMethod, Transaction, TransactionStatus, TransactionType
from app.models.user import User, UserRole
from app.providers.manager import get_provider
from app.schemas.order import CustomerOrderResponse, OrderCreate

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post("", response_model=CustomerOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    order_in: OrderCreate,
    request: Request,
    x_tenant_domain: Optional[str] = Header(None, alias="X-Tenant-Domain"),
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

    # 2. Resolve tenant context for child-panel attribution and pricing
    tenant_id = None
    panel = None
    raw_domain = x_tenant_domain or request.headers.get("x-tenant-domain") or request.headers.get("X-Tenant-Domain")
    if raw_domain:
        clean_tenant_domain = (
            raw_domain.split(":")[0]
            .strip()
            .lower()
            .replace("https://", "")
            .replace("http://", "")
            .rstrip("/")
        )
        is_main = any(clean_tenant_domain == d or clean_tenant_domain.endswith(f".{d}") for d in MAIN_PLATFORM_DOMAINS)
        if not is_main:
            tenant_q = await db.execute(
                select(ChildPanel).where(ChildPanel.domain == clean_tenant_domain)
            )
            panel = tenant_q.scalars().first()
            if panel:
                tenant_id = panel.id
    if not tenant_id and current_user.tenant_id:
        tenant_id = current_user.tenant_id
        if not panel:
            tenant_q = await db.execute(
                select(ChildPanel).where(ChildPanel.id == tenant_id)
            )
            panel = tenant_q.scalars().first()

    # Universal retail price is service.selling_rate across main platform and child panels
    charge_rate = service.selling_rate
    if panel and panel.branding_json:
        markup = Decimal(str(panel.branding_json.get("default_markup_percent", 0)))
        if markup > 0:
            charge_rate = round(service.selling_rate * (Decimal("1.00") + markup / Decimal("100.00")), 2)

    # 3. Validate quantity boundaries & determine package vs per-1000 pricing
    is_package = (
        (service.service_type and service.service_type.lower() == "package")
        or (service.min_quantity == 1 and service.max_quantity == 1)
        or ("whatsapp" in service.name.lower() and "number" in service.name.lower())
    )
    if is_package:
        effective_min = service.min_quantity or 1
        total_charge = round(charge_rate * Decimal(order_in.quantity), 2)
        provider_cost = round(service.provider_rate * Decimal(order_in.quantity), 2)
    else:
        effective_min = max(service.min_quantity or 100, 100)
        total_charge = round((charge_rate * Decimal(order_in.quantity)) / Decimal(1000), 2)
        provider_cost = round((service.provider_rate * Decimal(order_in.quantity)) / Decimal(1000), 2)

    if order_in.quantity < effective_min:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum order quantity is {effective_min:,}."
        )
    if order_in.quantity > service.max_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum quantity for this service is {service.max_quantity:,}."
        )

    profit = total_charge - provider_cost

    # 4. Atomically lock user row to eliminate double-spend / race condition exploits
    user_lock_query = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    locked_user = user_lock_query.scalars().first()
    if not locked_user or locked_user.balance < total_charge:
        current_bal = locked_user.balance if locked_user else Decimal("0.00")
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient wallet balance. Total cost: KES {total_charge:,.2f} | Available balance: KES {current_bal:,.2f}. Please add funds to proceed."
        )

    # 5. Deduct funds from locked user balance
    locked_user.balance -= total_charge
    db.add(locked_user)

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

    # 8. Persist order record in database (using tenant_id resolved in step 2)
    order = Order(
        user_id=current_user.id,
        tenant_id=tenant_id,
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
    await db.flush()

    # 9. Credit Child Panel owner profit (Spread between retail customer charge and wholesale cost)
    if panel and panel.user_id and panel.user_id != current_user.id:
        wholesale_rate = (
            service.wholesale_rate 
            if (service.wholesale_rate is not None and service.wholesale_rate > 0) 
            else service.selling_rate
        )
        if is_package:
            wholesale_cost = round(wholesale_rate * Decimal(order_in.quantity), 2)
        else:
            wholesale_cost = round((wholesale_rate * Decimal(order_in.quantity)) / Decimal(1000), 2)

        panel_owner_profit = total_charge - wholesale_cost
        if panel_owner_profit > Decimal("0.00"):
            owner_q = await db.execute(
                select(User).where(User.id == panel.user_id).with_for_update()
            )
            panel_owner = owner_q.scalars().first()
            if panel_owner:
                bal_before = panel_owner.balance
                panel_owner.balance += panel_owner_profit
                bal_after = panel_owner.balance
                db.add(panel_owner)

                tx = Transaction(
                    user_id=panel_owner.id,
                    order_id=order.id,
                    tenant_id=panel.id,
                    type=TransactionType.BONUS,
                    amount=panel_owner_profit,
                    balance_before=bal_before,
                    balance_after=bal_after,
                    currency="KES",
                    payment_method=PaymentMethod.INTERNAL,
                    status=TransactionStatus.COMPLETED,
                    description=f"Child Panel profit from Order #{order.order_number}"
                )
                db.add(tx)

    await db.commit()
    await db.refresh(order)

    return CustomerOrderResponse(
        id=order.id,
        order_number=order.order_number,
        tenant_id=order.tenant_id,
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
        refill_available=service.refill_available,
        created_at=order.created_at,
        updated_at=order.updated_at
    )


@router.get("", response_model=List[CustomerOrderResponse])
async def list_my_orders(
    status: Optional[OrderStatus] = None,
    search: Optional[str] = None,
    all_orders: bool = Query(False, description="If admin, view all orders across platform"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    List orders with filters and search. Admins can view all orders.
    """
    query = (
        select(Order)
        .options(selectinload(Order.service))
        .order_by(desc(Order.created_at))
        .offset(skip)
        .limit(limit)
    )

    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    if not (is_admin and all_orders):
        query = query.where(Order.user_id == current_user.id)

    if status:
        query = query.where(Order.status == status)
    if search:
        search_clean = search.strip().lstrip('#').lower()
        pattern = f"%{search_clean}%"
        query = query.join(Order.service, isouter=True)
        query = query.where(
            (cast(Order.order_number, String).ilike(pattern)) |
            (cast(Order.id, String).ilike(pattern)) |
            (Order.target_link.ilike(pattern)) |
            (Service.name.ilike(pattern))
        )

    result = await db.execute(query)
    orders = result.scalars().all()

    return [
        CustomerOrderResponse(
            id=o.id,
            order_number=o.order_number,
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
            refill_available=o.service.refill_available if o.service else False,
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
        order_number=order.order_number,
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
        refill_available=order.service.refill_available if order.service else False,
        created_at=order.created_at,
        updated_at=order.updated_at
    )


@router.post("/{order_id}/refill")
async def request_order_refill(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Request an automated refill for an order.
    Contacts upstream provider via action=refill API.
    """
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.service),
            selectinload(Order.provider)
        )
        .where(Order.id == order_id, Order.user_id == current_user.id)
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if not order.service or not order.service.refill_available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refill is not available for this service. This service does not include a refill guarantee."
        )

    if not order.provider_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This order has not been dispatched to an upstream provider yet."
        )

    if order.status not in [OrderStatus.COMPLETED, OrderStatus.PARTIAL, OrderStatus.IN_PROGRESS]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Refill can only be requested for active or completed orders (current status: {order.status.value})."
        )

    provider_slug = order.provider.slug if order.provider else "jap"
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
            detail=f"Provider Notice: {refill_resp.error or 'Refill not eligible yet. Please allow 24h between refills.'}"
        )

    return {
        "success": True,
        "refill_id": refill_resp.refill_id,
        "order_id": str(order.id),
        "message": f"Refill requested successfully from upstream provider! Refill ID: #{refill_resp.refill_id}"
    }
