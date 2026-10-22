import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import cast, desc, or_, select, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user
from app.api.v1.endpoints.tenant import MAIN_PLATFORM_DOMAINS
from app.core.database import get_db
from app.models.child_panel import ChildPanel, ChildPanelStatus
from app.models.order import Order, OrderStatus
from app.models.service import Service
from app.models.transaction import PaymentMethod, Transaction, TransactionStatus, TransactionType
from app.models.user import User, UserRole
from app.providers.manager import get_provider
from app.schemas.order import CustomerOrderResponse, OrderCreate
from app.workers.order_tasks import sync_single_order

logger = logging.getLogger(__name__)

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
        clean_no_www = clean_tenant_domain[4:] if clean_tenant_domain.startswith("www.") else clean_tenant_domain
        clean_with_www = f"www.{clean_no_www}"
        is_main = any(clean_no_www == d or clean_no_www.endswith(f".{d}") for d in MAIN_PLATFORM_DOMAINS)
        if not is_main:
            tenant_q = await db.execute(
                select(ChildPanel).where(
                    or_(
                        ChildPanel.domain == clean_tenant_domain,
                        ChildPanel.domain == clean_no_www,
                        ChildPanel.domain == clean_with_www,
                    )
                )
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

    if panel:
        # Instant Expiration Guard: Block orders instantly if child panel monthly subscription has expired
        now_utc = datetime.now(timezone.utc)
        exp_time = panel.expires_at if (panel.expires_at and panel.expires_at.tzinfo) else (panel.expires_at.replace(tzinfo=timezone.utc) if panel.expires_at else None)
        if panel.status != ChildPanelStatus.ACTIVE.value or (exp_time and exp_time < now_utc):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="This Child Panel's subscription (KES 3,500/month) has expired and is suspended. Please contact the administrator to renew."
            )

    # Determine retail charge rate:
    # Child panels get direct provider rates (service.provider_rate) with NO deduction in between.
    # If the child panel owner configured a custom markup percent, apply it directly over provider_rate.
    charge_rate = service.selling_rate
    if panel and panel.branding_json:
        try:
            panel_markup = Decimal(str(panel.branding_json.get("default_markup_percent", 0)))
            if panel_markup > Decimal("0"):
                # Direct provider price base from JAP
                charge_rate = round(service.provider_rate * (Decimal("1") + (panel_markup / Decimal("100"))), 2)
        except Exception:
            charge_rate = service.selling_rate

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

    # 3b. Negative-Margin Guard: Block orders where provider cost exceeds selling price
    if profit < Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"This service is currently mispriced — selling rate (KES {total_charge:,.2f}) "
                f"is below provider cost (KES {provider_cost:,.2f}). "
                f"Please contact the administrator to update the service pricing."
            )
        )

    # 4. Atomically lock user row to eliminate double-spend / race condition exploits
    user_lock_query = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    locked_user = user_lock_query.scalars().first()
    if not locked_user or locked_user.balance <= Decimal("0.00"):
        current_bal = locked_user.balance if locked_user else Decimal("0.00")
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Your wallet balance is KES {current_bal:,.2f}. Please add funds to place an order."
        )
    if locked_user.balance < total_charge or (locked_user.balance - total_charge) < Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient wallet balance. Total cost: KES {total_charge:,.2f} | Available balance: KES {locked_user.balance:,.2f}. Please add funds to proceed."
        )

    # 4b. Child Panel Wholesale Rate: Direct JAP provider pricing
    panel_owner = None
    wholesale_cost = Decimal("0.00")
    if panel and panel.user_id:
        wholesale_rate = service.provider_rate
        if is_package:
            wholesale_cost = round(wholesale_rate * Decimal(order_in.quantity), 2)
        else:
            wholesale_cost = round((wholesale_rate * Decimal(order_in.quantity)) / Decimal(1000), 2)

        # If order is placed on a child panel by an end-customer (not the owner themselves ordering as owner)
        if panel.user_id != locked_user.id and wholesale_cost > Decimal("0.00"):
            owner_q = await db.execute(
                select(User).where(User.id == panel.user_id).with_for_update()
            )
            panel_owner = owner_q.scalars().first()
            if panel_owner:
                if panel_owner.balance <= Decimal("0.00") or panel_owner.balance < wholesale_cost or (panel_owner.balance - wholesale_cost) < Decimal("0.00"):
                    raise HTTPException(
                        status_code=status.HTTP_402_PAYMENT_REQUIRED,
                        detail=(
                            f"Child panel owner has insufficient wholesale fulfillment balance "
                            f"(KES {panel_owner.balance:,.2f} available, KES {wholesale_cost:,.2f} required). "
                            f"Please top up the Parent Wholesale Balance."
                        )
                    )

    # 5. Deduct funds from customer wallet (guaranteed non-negative)
    customer_bal_before = locked_user.balance
    locked_user.balance = max(Decimal("0.00"), customer_bal_before - total_charge)
    db.add(locked_user)

    # 5b. Deduct wholesale fulfillment cost from child panel owner (guaranteed non-negative)
    owner_bal_before = None
    if panel_owner and wholesale_cost > Decimal("0.00"):
        owner_bal_before = panel_owner.balance
        panel_owner.balance = max(Decimal("0.00"), owner_bal_before - wholesale_cost)
        db.add(panel_owner)

        # Sync Child Panel Admin account balance immediately so child panel header/wallet stays in sync
        admin_res = await db.execute(
            select(User).where(
                User.tenant_id == panel.id,
                User.role == UserRole.ADMIN,
            ).with_for_update()
        )
        for admin_u in admin_res.scalars().all():
            admin_u.balance = panel_owner.balance
            db.add(admin_u)

    # 6. Sanitize and canonicalize target URL
    from app.core.link_cleaner import sanitize_and_canonicalize_target_link
    target_link_clean = await sanitize_and_canonicalize_target_link(order_in.target_link)

    # 7. Dispatch order using Multi-Provider Smart Router with Auto-Failover
    provider_order_id = None
    initial_status = OrderStatus.PENDING
    error_msg = None
    dispatched_provider_id = service.provider_id

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
        if p_id:
            try:
                dispatched_provider_id = uuid.UUID(p_id)
            except Exception:
                pass
        initial_status = OrderStatus.IN_PROGRESS if p_order_id else OrderStatus.PROCESSING
    except Exception as exc:
        error_msg = f"Provider failover exhausted: {str(exc)}"
        initial_status = OrderStatus.PENDING

    # 8. Persist order record in database (using tenant_id resolved in step 2)
    order_profit = (total_charge - wholesale_cost) if (panel and wholesale_cost > Decimal("0.00")) else profit

    order = Order(
        user_id=current_user.id,
        tenant_id=tenant_id,
        service_id=service.id,
        provider_id=dispatched_provider_id,
        provider_order_id=provider_order_id,
        target_link=target_link_clean,
        quantity=order_in.quantity,
        start_count=0,
        remains=order_in.quantity,
        charge=total_charge,
        wholesale_cost=wholesale_cost,
        provider_cost=provider_cost,
        profit=order_profit,
        currency="KES",
        status=initial_status,
        custom_comments=order_in.custom_comments,
        error_message=error_msg
    )

    db.add(order)
    await db.flush()

    # 9a. Record Customer order payment transaction in ledger
    customer_tx = Transaction(
        user_id=locked_user.id,
        order_id=order.id,
        tenant_id=tenant_id,
        type=TransactionType.ORDER_PAYMENT,
        amount=-total_charge,
        balance_before=customer_bal_before,
        balance_after=locked_user.balance,
        currency="KES",
        payment_method=PaymentMethod.INTERNAL,
        payment_reference=f"ORD-{order.order_number or str(order.id)[:8]}",
        status=TransactionStatus.COMPLETED,
        description=f"Payment for Order #{order.order_number or str(order.id)[:8]} - {service.name}"
    )
    db.add(customer_tx)

    # 9b. Record Child Panel Owner wholesale deduction in transaction ledger
    if panel_owner and wholesale_cost > Decimal("0.00") and owner_bal_before is not None:
        owner_tx = Transaction(
            user_id=panel_owner.id,
            order_id=order.id,
            tenant_id=panel.id,
            type=TransactionType.ORDER_PAYMENT,
            amount=-wholesale_cost,
            balance_before=owner_bal_before,
            balance_after=panel_owner.balance,
            currency="KES",
            payment_method=PaymentMethod.INTERNAL,
            payment_reference=f"WHOLESALE-{order.order_number or str(order.id)[:8]}",
            status=TransactionStatus.COMPLETED,
            description=f"Wholesale fulfillment for Order #{order.order_number or str(order.id)[:8]} on {panel.domain}"
        )
        db.add(owner_tx)

    await db.commit()
    await db.refresh(order)

    # 10. Immediate initial sync pass to capture start_count from upstream provider
    if provider_order_id:
        try:
            from app.workers.order_tasks import sync_single_order
            await sync_single_order(db, order)
        except Exception as e:
            logger.info(f"Initial sync pass for new order #{order.id}: {e}")

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
    request: Request,
    status: Optional[OrderStatus] = None,
    search: Optional[str] = None,
    all_orders: bool = Query(False, description="If admin, view all orders across platform or tenant"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    x_tenant_domain: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    List orders with filters and search. Strictly enforces tenant boundary isolation.
    """
    query = (
        select(Order)
        .options(selectinload(Order.service))
        .order_by(desc(Order.created_at))
        .offset(skip)
        .limit(limit)
    )

    # 1. Resolve effective tenant ID: check user account first, then incoming domain header
    effective_tenant_id = current_user.tenant_id
    if not effective_tenant_id and request:
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
            clean_no_www = clean_tenant_domain[4:] if clean_tenant_domain.startswith("www.") else clean_tenant_domain
            clean_with_www = f"www.{clean_no_www}"
            is_main = any(clean_no_www == d or clean_no_www.endswith(f".{d}") for d in MAIN_PLATFORM_DOMAINS)
            if not is_main:
                tenant_q = await db.execute(
                    select(ChildPanel).where(
                        or_(
                            ChildPanel.domain == clean_tenant_domain,
                            ChildPanel.domain == clean_no_www,
                            ChildPanel.domain == clean_with_www,
                        )
                    )
                )
                panel = tenant_q.scalars().first()
                if panel:
                    effective_tenant_id = panel.id

    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]

    # 2. Strict tenant boundary filtering:
    if effective_tenant_id:
        # User is in child panel context (e.g. skakegains.com)
        if is_admin and all_orders:
            # Child panel admin viewing all orders of this specific child panel
            query = query.where(Order.tenant_id == effective_tenant_id)
        else:
            # Child panel user viewing only their own orders placed on this panel
            query = query.where(
                Order.user_id == current_user.id,
                Order.tenant_id == effective_tenant_id
            )
    else:
        # User is in main platform context (SocialPulse)
        if current_user.role == UserRole.SUPER_ADMIN and all_orders:
            # Super admin viewing all main platform orders
            query = query.where(Order.tenant_id.is_(None))
        else:
            # Main platform customer viewing only their own personal orders
            query = query.where(
                Order.user_id == current_user.id,
                Order.tenant_id.is_(None)
            )

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


@router.post("/{order_id}/sync")
async def customer_sync_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Customer live check: query upstream provider for live delivery progress of an order.
    """
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.service), selectinload(Order.provider), selectinload(Order.user))
        .where(Order.id == order_id, Order.user_id == current_user.id)
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    changed, updated_order = await sync_single_order(db, order)
    delivered = max(0, updated_order.quantity - updated_order.remains)
    pct = round((delivered / (updated_order.quantity or 1)) * 100)

    return {
        "success": True,
        "message": f"Progress updated: {delivered}/{updated_order.quantity} received ({pct}%).",
        "status": updated_order.status.value,
        "start_count": updated_order.start_count,
        "remains": updated_order.remains,
        "delivered": delivered,
        "progress_percent": pct,
        "changed": changed
    }

