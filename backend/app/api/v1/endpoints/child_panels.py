import calendar
import logging
import secrets
import uuid

logger = logging.getLogger("socialpulse.child_panels")
from datetime import date as date_type, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, cast, Date, desc, func, or_, select, String, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, require_roles
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.child_panel import ChildPanel, ChildPanelStatus
from app.models.child_panel_service import ChildPanelServiceConfig
from app.models.order import Order, OrderStatus
from app.models.service import Platform, Service
from app.models.ticket import Ticket, TicketMessage, TicketPriority, TicketStatus
from app.models.transaction import PaymentMethod, Transaction, TransactionStatus, TransactionType
from app.models.user import User, UserRole
from app.schemas.analytics import DailyRevenueItem
from app.schemas.child_panel import (
    ChildPanelAdminCredentialsUpdate,
    ChildPanelCreate,
    ChildPanelOrderResponse,
    ChildPanelOrderStats,
    ChildPanelPaymentGatewayConfig,
    ChildPanelResponse,
    ChildPanelServiceBulkUpdate,
    ChildPanelServiceConfigUpdate,
    ChildPanelServiceItemResponse,
    ChildPanelStatusUpdate,
    ChildPanelUserBalanceAdjust,
    ChildPanelUserResponse,
    ChildPanelUserStatusUpdate,
)
from app.schemas.ticket import (
    AdminTicketCreate,
    TicketMessageResponse,
    TicketReplyRequest,
    TicketResponse,
    TicketStatusUpdate,
    TicketSummaryResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/child-panels", tags=["Child Panels"])

PANEL_MONTHLY_FEE = Decimal("3500.00")


@router.post("", response_model=ChildPanelResponse, status_code=status.HTTP_201_CREATED)
async def order_child_panel(
    panel_in: ChildPanelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Rent a new Child SMM Panel on a custom domain.
    Deducts monthly rental fee (KES 1,500) from user wallet balance and provisions nameserver details.
    """
    clean_domain = panel_in.domain.strip().lower().replace("https://", "").replace("http://", "").rstrip("/")

    # 1. Check if domain already registered
    existing_q = await db.execute(select(ChildPanel).where(ChildPanel.domain == clean_domain))
    if existing_q.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The domain '{clean_domain}' is already registered on SocialPulse."
        )

    # 2. Check wallet balance
    if current_user.balance < PANEL_MONTHLY_FEE:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient balance. Child panel rental is KES {PANEL_MONTHLY_FEE:,.2f} per month. Your balance: KES {current_user.balance:,.2f}. Please add funds to proceed."
        )

    # 3. Deduct balance and record double-entry transaction
    balance_before = current_user.balance
    balance_after = balance_before - PANEL_MONTHLY_FEE
    current_user.balance = balance_after
    db.add(current_user)

    expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    # 4. Create child panel record
    panel = ChildPanel(
        user_id=current_user.id,
        domain=clean_domain,
        admin_username=panel_in.admin_username.strip(),
        admin_password_hash=get_password_hash(panel_in.admin_password),
        currency=panel_in.currency or "KES",
        price_per_month=PANEL_MONTHLY_FEE,
        status=ChildPanelStatus.PENDING,
        nameserver1="ns1.socialpulse.io",
        nameserver2="ns2.socialpulse.io",
        expires_at=expires_at,
        auto_renew=panel_in.auto_renew
    )
    db.add(panel)
    await db.flush()

    # 5. Record transaction ledger
    tx = Transaction(
        user_id=current_user.id,
        type=TransactionType.ORDER_PAYMENT,
        amount=-PANEL_MONTHLY_FEE,
        balance_before=balance_before,
        balance_after=balance_after,
        currency="KES",
        payment_method=PaymentMethod.INTERNAL,
        payment_reference=f"PANEL-{str(panel.id)[:8]}",
        status=TransactionStatus.COMPLETED,
        description=f"Monthly rental for Child Panel: {clean_domain}",
        metadata_json={
            "panel_id": str(panel.id),
            "domain": clean_domain,
            "duration_days": 30,
            "expires_at": expires_at.isoformat()
        }
    )
    db.add(tx)

    await db.commit()
    await db.refresh(panel)

    # 6. Trigger automated provisioning pipeline
    from app.services.provisioning import ChildPanelProvisioningService
    panel = await ChildPanelProvisioningService.run_provisioning_pipeline(db, panel)

    return panel


@router.get("/my", response_model=List[ChildPanelResponse])
async def list_my_child_panels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    List all child panels owned by the current authenticated user.
    If the user is a platform super_admin or admin on SocialPulse (tenant_id is None),
    returns all child panels across the platform so they can oversee and manage all rented panels.
    Also includes panels where the user is the designated tenant admin.
    """
    if current_user.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN] and current_user.tenant_id is None:
        query = select(ChildPanel).order_by(desc(ChildPanel.created_at))
        result = await db.execute(query)
        return result.scalars().all()

    conditions = [ChildPanel.user_id == current_user.id]
    # If the user has a tenant_id, also match panels where they are the tenant admin
    if current_user.tenant_id:
        conditions.append(ChildPanel.id == current_user.tenant_id)

    query = (
        select(ChildPanel)
        .where(or_(*conditions))
        .order_by(desc(ChildPanel.created_at))
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{panel_id}/renew", response_model=ChildPanelResponse)
async def renew_child_panel(
    panel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Renew a child panel for an additional 30 days.
    """
    query = await db.execute(
        select(ChildPanel).where(ChildPanel.id == panel_id, ChildPanel.user_id == current_user.id)
    )
    panel = query.scalars().first()
    if not panel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child panel not found."
        )

    if current_user.balance < panel.price_per_month:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient balance. Renewal is KES {panel.price_per_month:,.2f}. Your balance: KES {current_user.balance:,.2f}."
        )

    balance_before = current_user.balance
    balance_after = balance_before - panel.price_per_month
    current_user.balance = balance_after
    db.add(current_user)

    # Extend expiration
    now = datetime.now(timezone.utc)
    base_date = panel.expires_at if panel.expires_at > now else now
    new_expires_at = base_date + timedelta(days=30)
    panel.expires_at = new_expires_at
    if panel.status == ChildPanelStatus.EXPIRED:
        panel.status = ChildPanelStatus.ACTIVE
    db.add(panel)

    tx = Transaction(
        user_id=current_user.id,
        type=TransactionType.ORDER_PAYMENT,
        amount=-panel.price_per_month,
        balance_before=balance_before,
        balance_after=balance_after,
        currency="KES",
        payment_method=PaymentMethod.INTERNAL,
        payment_reference=f"RENEW-{str(panel.id)[:8]}",
        status=TransactionStatus.COMPLETED,
        description=f"30-day renewal for Child Panel: {panel.domain}",
        metadata_json={
            "panel_id": str(panel.id),
            "domain": panel.domain,
            "new_expires_at": new_expires_at.isoformat()
        }
    )
    db.add(tx)

    await db.commit()
    await db.refresh(panel)
    return panel


@router.patch("/{panel_id}/admin-credentials", response_model=ChildPanelResponse)
async def update_child_panel_admin_credentials(
    panel_id: uuid.UUID,
    payload: ChildPanelAdminCredentialsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Update administrator username and/or reset administrator password for a child panel.
    Only the panel owner or a platform super_admin can perform this action.
    """
    query = await db.execute(select(ChildPanel).where(ChildPanel.id == panel_id))
    panel = query.scalars().first()
    if not panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child panel not found.")

    if panel.user_id != current_user.id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to manage this child panel.")

    old_username = panel.admin_username
    if payload.admin_username and payload.admin_username.strip():
        panel.admin_username = payload.admin_username.strip()

    if payload.admin_password and payload.admin_password.strip():
        panel.admin_password_hash = get_password_hash(payload.admin_password.strip())

    db.add(panel)

    # If a linked User record exists for this child panel admin, update their username/password as well
    user_q = await db.execute(
        select(User).where(or_(User.username == old_username, User.tenant_id == panel.id))
    )
    admin_user_record = user_q.scalars().first()
    if admin_user_record:
        if payload.admin_username and payload.admin_username.strip():
            admin_user_record.username = payload.admin_username.strip()
        if payload.admin_password and payload.admin_password.strip():
            admin_user_record.hashed_password = panel.admin_password_hash
        db.add(admin_user_record)

    await db.commit()
    await db.refresh(panel)
    return panel


@router.get("/admin/all", response_model=List[ChildPanelResponse])
async def list_all_child_panels_admin(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Staff / Admin endpoint to view all child panels across the platform.
    """
    query = select(ChildPanel).order_by(desc(ChildPanel.created_at))
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/admin/{panel_id}/status", response_model=ChildPanelResponse)
async def update_child_panel_status_admin(
    panel_id: uuid.UUID,
    payload: ChildPanelStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Staff endpoint to update child panel provisioning status (active, suspended, terminated).
    """
    query = await db.execute(select(ChildPanel).where(ChildPanel.id == panel_id))
    panel = query.scalars().first()
    if not panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child panel not found.")

    panel.status = payload.status
    if payload.notes:
        panel.notes = payload.notes
    db.add(panel)
    await db.commit()
    await db.refresh(panel)
    return panel


@router.post("/{panel_id}/verify-dns")
async def verify_child_panel_dns(
    panel_id: uuid.UUID,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Check if nameservers or CNAME for this child panel have propagated.
    Transitions panel to ACTIVE if verified or forced for testing.
    """
    query = await db.execute(
        select(ChildPanel).where(ChildPanel.id == panel_id)
    )
    panel = query.scalars().first()
    if not panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child panel not found.")

    # Only owner or admin can trigger verification
    if panel.user_id != current_user.id and current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    from app.services.provisioning import ChildPanelProvisioningService
    result = await ChildPanelProvisioningService.verify_dns_and_activate(db, panel, force_activate=force)
    return result


@router.post("/{panel_id}/retry", response_model=ChildPanelResponse)
async def retry_child_panel_provisioning(
    panel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Retry provisioning pipeline if stuck or failed.
    """
    query = await db.execute(
        select(ChildPanel).where(ChildPanel.id == panel_id)
    )
    panel = query.scalars().first()
    if not panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child panel not found.")

    if panel.user_id != current_user.id and current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    from app.services.provisioning import ChildPanelProvisioningService
    panel = await ChildPanelProvisioningService.run_provisioning_pipeline(db, panel)
    return panel


@router.patch("/{panel_id}/branding", response_model=ChildPanelResponse)
async def update_child_panel_branding(
    panel_id: uuid.UUID,
    branding: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Update tenant branding, site name, logo, theme, and default markup.
    """
    query = await db.execute(
        select(ChildPanel).where(ChildPanel.id == panel_id)
    )
    panel = query.scalars().first()
    if not panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child panel not found.")

    if panel.user_id != current_user.id and current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    from sqlalchemy.orm.attributes import flag_modified

    existing_branding = dict(panel.branding_json or {})
    existing_branding.update(branding)
    panel.branding_json = existing_branding
    flag_modified(panel, "branding_json")

    db.add(panel)
    await db.commit()
    await db.refresh(panel)
    return panel


# ==============================================================================
# CHILD PANEL OWNER MANAGEMENT: ORDER MONITOR, SUPPORT HELPDESK & USER MANAGEMENT
# ==============================================================================

async def get_panel_and_verify_owner(
    panel_id: uuid.UUID,
    db: AsyncSession,
    current_user: User
) -> ChildPanel:
    """Verify that current user is the owner of this child panel or platform admin."""
    query = await db.execute(select(ChildPanel).where(ChildPanel.id == panel_id))
    panel = query.scalars().first()
    if not panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child panel not found.")

    is_owner = (panel.user_id == current_user.id)
    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    is_tenant_admin = (current_user.tenant_id == panel.id and current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN])

    if not (is_owner or is_admin or is_tenant_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be the owner or administrator of this child panel."
        )
    return panel


@router.get("/{panel_id}", response_model=ChildPanelResponse)
async def get_child_panel_by_id(
    panel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Get single child panel by ID.
    Accessible to panel owner, designated tenant admin, or platform admins.
    """
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)
    return panel


# ------------------------------------------------------------------------------
# 0. CHILD PANEL PAYMENT GATEWAY SETTINGS (PayHero Till / Paybill, Paystack)
# ------------------------------------------------------------------------------

@router.get("/{panel_id}/payment-gateway", response_model=ChildPanelPaymentGatewayConfig)
async def get_child_panel_payment_gateway(
    panel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Get configured payment gateway (PayHero Till/Paybill, Paystack, Manual) for a child panel.
    Accessible to panel owner and platform admins.
    """
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)
    meta = dict(panel.metadata_json or {})
    gateway_data = meta.get("payment_gateway", {
        "gateway_provider": "payhero",
        "is_active": True
    })
    return ChildPanelPaymentGatewayConfig(**gateway_data)


@router.patch("/{panel_id}/payment-gateway", response_model=ChildPanelPaymentGatewayConfig)
async def update_child_panel_payment_gateway(
    panel_id: uuid.UUID,
    config: ChildPanelPaymentGatewayConfig,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Update payment gateway (PayHero Till/Paybill, Paystack, Manual) for a child panel.
    Directs customer deposits on this domain straight into the child panel's Till/Paybill.
    """
    from sqlalchemy.orm.attributes import flag_modified

    panel = await get_panel_and_verify_owner(panel_id, db, current_user)
    meta = dict(panel.metadata_json or {})
    meta["payment_gateway"] = config.dict()
    panel.metadata_json = meta
    flag_modified(panel, "metadata_json")

    db.add(panel)
    await db.commit()
    await db.refresh(panel)
    return config


# ------------------------------------------------------------------------------
# 1. CHILD PANEL ORDERS MONITOR
# ------------------------------------------------------------------------------

@router.get("/{panel_id}/orders", response_model=List[ChildPanelOrderResponse])
async def list_child_panel_orders(
    panel_id: uuid.UUID,
    status_filter: Optional[OrderStatus] = Query(None, alias="status"),
    search: Optional[str] = None,
    date: Optional[str] = Query(None, description="Filter orders created on this date YYYY-MM-DD"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """List all customer orders placed on this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    # 1. Proactively reconcile/backfill any orphaned orders where customer belongs to this child panel
    try:
        subq = select(User.id).where(User.tenant_id == panel.id).scalar_subquery()
        await db.execute(
            update(Order)
            .where(
                Order.tenant_id.is_(None),
                Order.user_id.in_(subq)
            )
            .values(tenant_id=panel.id)
        )
        await db.commit()
    except Exception as bf_err:
        await db.rollback()
        logger.warning(f"Note: skipped on-the-fly backfill for panel {panel.id}: {bf_err}")

    # 2. Build order query with explicit JOINs to avoid any MissingGreenlet lazy-loading issues
    query = (
        select(
            Order,
            User.username.label("user_username"),
            Service.name.label("service_name")
        )
        .join(User, Order.user_id == User.id, isouter=True)
        .join(Service, Order.service_id == Service.id, isouter=True)
        .where(
            or_(
                Order.tenant_id == panel.id,
                User.tenant_id == panel.id
            )
        )
        .order_by(desc(Order.created_at))
        .offset(skip)
        .limit(limit)
    )

    if status_filter:
        query = query.where(Order.status == status_filter)

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
            pass

    if search:
        s = f"%{search.strip().lower()}%"
        query = query.where(
            (cast(Order.order_number, String).ilike(s)) |
            (cast(Order.id, String).ilike(s)) |
            (Order.target_link.ilike(s)) |
            (User.username.ilike(s)) |
            (Service.name.ilike(s))
        )

    try:
        result = await db.execute(query)
        rows = result.all()
    except Exception as q_err:
        logger.exception(f"Error querying orders for child panel {panel.id}: {q_err}")
        return []

    out = []
    for o, u_name, svc_name in rows:
        try:
            chg = Decimal(str(o.charge)) if o.charge is not None else Decimal("0.00")
            ws = Decimal(str(o.wholesale_cost)) if o.wholesale_cost is not None else Decimal("0.00")
            prof = Decimal(str(o.profit)) if o.profit is not None else Decimal("0.00")
            panel_profit = (chg - ws) if ws > Decimal("0.00") else prof

            st_val = getattr(o, "status", "pending")
            st_str = str(getattr(st_val, "value", getattr(st_val, "name", st_val)) or "pending").lower()

            clean_err = None
            if getattr(o, "error_message", None):
                clean_err = str(o.error_message).replace("JustAnotherPanel", "").replace("JAP", "").replace("Provider Error:", "").strip(" :")

            out.append(
                ChildPanelOrderResponse(
                    id=o.id,
                    order_number=o.order_number,
                    user_id=o.user_id,
                    username=u_name or "Customer",
                    service_id=o.service_id,
                    service_name=svc_name or "Service",
                    target_link=o.target_link or "",
                    quantity=o.quantity or 0,
                    charge=chg,
                    profit=panel_profit,
                    status=st_str,
                    remains=o.remains or 0,
                    start_count=o.start_count or 0,
                    error_message=clean_err,
                    created_at=o.created_at
                )
            )
        except Exception as item_err:
            logger.warning(f"Error formatting child panel order {getattr(o, 'id', None)}: {item_err}")
            continue
    return out


@router.post("/{panel_id}/orders/{order_id}/sync")
async def sync_child_panel_order(
    panel_id: uuid.UUID,
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Sync single child panel order with upstream provider immediately."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.service), selectinload(Order.provider), selectinload(Order.user))
        .where(Order.id == order_id, or_(Order.tenant_id == panel.id, Order.user.has(User.tenant_id == panel.id)))
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found on this child panel.")

    from app.workers.order_tasks import sync_single_order
    changed, updated_order = await sync_single_order(db, order)

    # Re-fetch order with relationships to avoid MissingGreenlet in async context
    refreshed_res = await db.execute(
        select(Order)
        .options(selectinload(Order.service), selectinload(Order.user))
        .where(Order.id == order_id)
    )
    updated_order = refreshed_res.scalars().first() or updated_order

    panel_profit = (updated_order.charge - updated_order.wholesale_cost) if (updated_order.wholesale_cost and updated_order.wholesale_cost > Decimal("0.00")) else updated_order.profit

    return {
        "success": True,
        "message": f"Order status updated: {updated_order.status.value}",
        "order": ChildPanelOrderResponse(
            id=updated_order.id,
            order_number=updated_order.order_number,
            user_id=updated_order.user_id,
            username=updated_order.user.username if updated_order.user else "Customer",
            service_id=updated_order.service_id,
            service_name=updated_order.service.name if updated_order.service else "Service",
            target_link=updated_order.target_link,
            quantity=updated_order.quantity,
            charge=updated_order.charge,
            profit=panel_profit,
            status=updated_order.status.value if hasattr(updated_order.status, "value") else str(updated_order.status),
            remains=updated_order.remains,
            start_count=updated_order.start_count,
            created_at=updated_order.created_at
        )
    }


@router.get("/{panel_id}/orders/stats", response_model=ChildPanelOrderStats)
async def get_child_panel_order_stats(
    panel_id: uuid.UUID,
    date: Optional[str] = Query(None, description="Optional date filter YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Get aggregated order statistics and total profit for this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    query = (
        select(Order.status, Order.charge, Order.wholesale_cost, Order.profit)
        .join(User, Order.user_id == User.id, isouter=True)
        .where(
            or_(
                Order.tenant_id == panel.id,
                User.tenant_id == panel.id
            )
        )
    )

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
            pass

    try:
        orders_q = await db.execute(query)
        rows = orders_q.all()
    except Exception as stats_err:
        logger.exception(f"Error fetching stats for panel {panel.id}: {stats_err}")
        rows = []

    total = len(rows)
    pending = 0
    processing = 0
    in_progress = 0
    completed = 0
    canceled = 0
    total_rev = Decimal("0.00")
    total_prof = Decimal("0.00")

    for status_val, charge_val, wholesale_val, profit_val in rows:
        st = status_val.value if hasattr(status_val, "value") else str(status_val)
        if st == OrderStatus.PENDING.value:
            pending += 1
        elif st == OrderStatus.PROCESSING.value:
            processing += 1
        elif st == OrderStatus.IN_PROGRESS.value:
            in_progress += 1
        elif st == OrderStatus.COMPLETED.value:
            completed += 1
        elif st in [OrderStatus.CANCELED.value, OrderStatus.FAILED.value]:
            canceled += 1

        if st not in [OrderStatus.CANCELED.value, OrderStatus.FAILED.value]:
            c_val = Decimal(str(charge_val or 0))
            w_val = Decimal(str(wholesale_val or 0))
            # Child panel net profit: retail charge collected from customer minus wholesale cost paid to SocialPulse
            p_val = (c_val - w_val) if w_val > Decimal("0.00") else Decimal(str(profit_val or 0))
            total_rev += c_val
            total_prof += p_val

    return ChildPanelOrderStats(
        total_orders=total,
        pending_orders=pending,
        processing_orders=processing,
        in_progress_orders=in_progress,
        completed_orders=completed,
        canceled_orders=canceled,
        total_revenue=total_rev,
        total_profit=total_prof
    )


@router.post("/{panel_id}/orders/{order_id}/cancel", response_model=ChildPanelOrderResponse)
async def cancel_child_panel_order(
    panel_id: uuid.UUID,
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Cancel order placed on child panel and automatically refund the customer's wallet balance."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    res = await db.execute(
        select(Order)
        .options(selectinload(Order.user), selectinload(Order.service))
        .where(Order.id == order_id, or_(Order.tenant_id == panel.id, Order.user.has(User.tenant_id == panel.id)))
    )
    order = res.scalars().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found for this child panel.")

    if order.status in [OrderStatus.COMPLETED, OrderStatus.CANCELED]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot cancel order in status '{order.status.value}'.")

    order.status = OrderStatus.CANCELED
    order.error_message = "Canceled by Child Panel administrator"

    # Idempotent Dual-Entry Refund (Customer retail + Panel owner wholesale + admin balance sync)
    from app.services.refund_service import refund_order
    await refund_order(db, order, reason="Child Panel Admin canceled")

    db.add(order)
    await db.commit()

    refreshed_res = await db.execute(
        select(Order)
        .options(selectinload(Order.user), selectinload(Order.service))
        .where(Order.id == order_id)
    )
    order = refreshed_res.scalars().first() or order

    return ChildPanelOrderResponse(
        id=order.id,
        order_number=order.order_number,
        user_id=order.user_id,
        username=order.user.username if order.user else "Customer",
        service_id=order.service_id,
        service_name=order.service.name if order.service else "Service",
        target_link=order.target_link,
        quantity=order.quantity,
        charge=order.charge,
        profit=order.profit,
        status=order.status.value if hasattr(order.status, "value") else str(order.status),
        remains=order.remains,
        start_count=order.start_count,
        created_at=order.created_at
    )


# ------------------------------------------------------------------------------
# 1B. CHILD PANEL ORDERS CALENDAR & SUMMARY TELEMETRY
# ------------------------------------------------------------------------------

@router.get("/{panel_id}/analytics/daily-revenue", response_model=List[DailyRevenueItem])
async def get_child_panel_daily_revenue(
    panel_id: uuid.UUID,
    days: int = Query(60, ge=7, le=180),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Get day-by-day revenue, profit, and order count for this child panel (e.g. for the Daily Calendar)."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    day_expr = cast(Order.created_at, Date)
    active_order_filter = ~Order.status.in_([OrderStatus.CANCELED, OrderStatus.FAILED])

    daily_rev_expr = Order.charge
    daily_profit_expr = case(
        (and_(Order.wholesale_cost.isnot(None), Order.wholesale_cost > Decimal("0.00")),
         Order.charge - Order.wholesale_cost),
        else_=Order.profit
    )

    query = (
        select(
            day_expr.label("day"),
            func.coalesce(func.sum(daily_rev_expr), Decimal("0.00")),
            func.coalesce(func.sum(daily_profit_expr), Decimal("0.00")),
            func.count(Order.id)
        )
        .join(User, Order.user_id == User.id, isouter=True)
        .where(
            or_(
                Order.tenant_id == panel.id,
                User.tenant_id == panel.id
            ),
            Order.created_at >= start_date,
            active_order_filter
        )
        .group_by(day_expr)
        .order_by(day_expr)
    )
    result = await db.execute(query)
    rows = result.all()

    db_map = {}
    for row in rows:
        if row[0]:
            iso_key = row[0].strftime("%Y-%m-%d") if hasattr(row[0], "strftime") else str(row[0])
            db_map[iso_key] = {
                "revenue": row[1] or Decimal("0.00"),
                "profit": row[2] or Decimal("0.00"),
                "orders_count": row[3] or 0
            }

    timeline: List[DailyRevenueItem] = []
    now_utc = datetime.now(timezone.utc)
    for i in range(days, -1, -1):
        dt = now_utc - timedelta(days=i)
        iso_str = dt.strftime("%Y-%m-%d")
        label = dt.strftime("%b %d")
        item_data = db_map.get(iso_str, {"revenue": Decimal("0.00"), "profit": Decimal("0.00"), "orders_count": 0})
        timeline.append(
            DailyRevenueItem(
                date_label=label,
                full_date=iso_str,
                revenue=item_data["revenue"],
                profit=item_data["profit"],
                orders_count=item_data["orders_count"]
            )
        )
    return timeline


@router.get("/{panel_id}/analytics/monthly-summary")
async def get_child_panel_monthly_summary(
    panel_id: uuid.UUID,
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Get aggregated monthly performance metrics and day-by-day breakdown for this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    days_in_month = calendar.monthrange(year, month)[1]
    start_dt_utc = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    end_dt_utc = datetime(year, month, days_in_month, 23, 59, 59, 999999, tzinfo=timezone.utc)
    active_order_filter = ~Order.status.in_([OrderStatus.CANCELED, OrderStatus.FAILED])

    month_rev_expr = Order.charge
    month_profit_expr = case(
        (and_(Order.wholesale_cost.isnot(None), Order.wholesale_cost > Decimal("0.00")),
         Order.charge - Order.wholesale_cost),
        else_=Order.profit
    )
    month_cost_expr = func.coalesce(Order.wholesale_cost, Decimal("0.00"))

    query = (
        select(
            func.coalesce(func.sum(month_rev_expr), Decimal("0.00")),
            func.coalesce(func.sum(month_profit_expr), Decimal("0.00")),
            func.coalesce(func.sum(month_cost_expr), Decimal("0.00")),
            func.count(Order.id)
        )
        .join(User, Order.user_id == User.id, isouter=True)
        .where(
            or_(
                Order.tenant_id == panel.id,
                User.tenant_id == panel.id
            ),
            Order.created_at >= start_dt_utc,
            Order.created_at <= end_dt_utc,
            active_order_filter
        )
    )
    result = await db.execute(query)
    total_rev, total_profit, total_cost, total_orders = result.first()

    # Query daily breakdown
    daily_query = (
        select(Order.created_at, Order.charge, Order.profit, Order.wholesale_cost, Order.id)
        .join(User, Order.user_id == User.id, isouter=True)
        .where(
            or_(
                Order.tenant_id == panel.id,
                User.tenant_id == panel.id
            ),
            Order.created_at >= start_dt_utc,
            Order.created_at <= end_dt_utc,
            active_order_filter
        )
        .order_by(Order.created_at.asc())
    )
    daily_res = await db.execute(daily_query)
    order_rows = daily_res.all()

    day_buckets = {d: {"revenue": Decimal("0.00"), "profit": Decimal("0.00"), "orders_count": 0} for d in range(1, days_in_month + 1)}
    for created_at_val, chg_val, prof_val, ws_val, _oid in order_rows:
        if created_at_val:
            day_num = created_at_val.day
            if day_num in day_buckets:
                c = Decimal(str(chg_val or 0))
                w = Decimal(str(ws_val or 0))
                p = (c - w) if w > Decimal("0.00") else Decimal(str(prof_val or 0))
                day_buckets[day_num]["revenue"] += c
                day_buckets[day_num]["profit"] += p
                day_buckets[day_num]["orders_count"] += 1

    days_list = [
        {
            "day": d,
            "date": f"{year}-{month:02d}-{d:02d}",
            "revenue": float(day_buckets[d]["revenue"]),
            "profit": float(day_buckets[d]["profit"]),
            "orders_count": day_buckets[d]["orders_count"]
        }
        for d in range(1, days_in_month + 1)
    ]

    margin = Decimal("0.00")
    if total_rev > 0:
        margin = round((total_profit / total_rev) * Decimal("100.00"), 1)

    return {
        "year": year,
        "month": month,
        "month_name": calendar.month_name[month],
        "total_revenue": float(total_rev),
        "total_gross_profit": float(total_profit),
        "total_provider_cost": float(total_cost),
        "total_orders": total_orders,
        "profit_margin_percent": float(margin),
        "days": days_list
    }


# ------------------------------------------------------------------------------
# 2. CHILD PANEL SUPPORT HELPDESK
# ------------------------------------------------------------------------------

@router.get("/{panel_id}/tickets", response_model=List[TicketSummaryResponse])
async def list_child_panel_tickets(
    panel_id: uuid.UUID,
    status_filter: Optional[TicketStatus] = Query(None, alias="status"),
    priority_filter: Optional[TicketPriority] = Query(None, alias="priority"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """List customer support tickets for this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    query = (
        select(Ticket)
        .options(selectinload(Ticket.messages), selectinload(Ticket.user))
        .where(
            or_(
                Ticket.tenant_id == panel.id,
                Ticket.user.has(User.tenant_id == panel.id)
            )
        )
        .order_by(desc(Ticket.updated_at))
        .offset(skip)
        .limit(limit)
    )
    if status_filter:
        query = query.where(Ticket.status == status_filter)
    if priority_filter:
        query = query.where(Ticket.priority == priority_filter)

    result = await db.execute(query)
    tickets = result.scalars().all()

    summaries = []
    for t in tickets:
        last_msg = t.messages[-1].message if t.messages else None
        summaries.append(
            TicketSummaryResponse(
                id=t.id,
                user_id=t.user_id,
                username=t.user.username if t.user else "Customer",
                order_id=t.order_id,
                subject=t.subject,
                priority=t.priority,
                status=t.status,
                last_message=last_msg,
                user_unread=getattr(t, "user_unread", False),
                admin_unread=getattr(t, "admin_unread", False),
                created_at=t.created_at,
                updated_at=t.updated_at
            )
        )
    return summaries


@router.get("/{panel_id}/tickets/unread-count", response_model=UnreadCountResponse)
async def get_child_panel_tickets_unread_count(
    panel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Get total count of customer tickets with unread replies for child panel staff."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)
    res = await db.execute(
        select(func.count(Ticket.id))
        .where(
            or_(
                Ticket.tenant_id == panel.id,
                Ticket.user.has(User.tenant_id == panel.id)
            ),
            Ticket.admin_unread == True
        )
    )
    count = res.scalar() or 0
    return UnreadCountResponse(unread_count=count)


@router.post("/{panel_id}/tickets", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_child_panel_customer_ticket(
    panel_id: uuid.UUID,
    ticket_in: AdminTicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Child panel owner/admin proactively opens a support ticket to contact a customer."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    user_res = await db.execute(select(User).where(User.id == ticket_in.user_id))
    target_user = user_res.scalars().first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target customer not found.")

    if target_user.tenant_id and target_user.tenant_id != panel.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot contact customer from a different child panel."
        )

    ticket = Ticket(
        user_id=target_user.id,
        tenant_id=panel.id,
        order_id=ticket_in.order_id,
        subject=ticket_in.subject.strip(),
        priority=ticket_in.priority or TicketPriority.MEDIUM,
        status=TicketStatus.OPEN,
        user_unread=True,
        admin_unread=False
    )
    db.add(ticket)
    await db.flush()

    message = TicketMessage(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        message=ticket_in.message.strip(),
        is_admin_reply=True
    )
    db.add(message)
    await db.commit()

    query = (
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(Ticket.id == ticket.id)
    )
    res = await db.execute(query)
    fresh_ticket = res.scalars().first()

    return TicketResponse(
        id=fresh_ticket.id,
        user_id=fresh_ticket.user_id,
        username=fresh_ticket.user.username if fresh_ticket.user else "Customer",
        order_id=fresh_ticket.order_id,
        subject=fresh_ticket.subject,
        priority=fresh_ticket.priority,
        status=fresh_ticket.status,
        user_unread=fresh_ticket.user_unread,
        admin_unread=fresh_ticket.admin_unread,
        messages=[
            TicketMessageResponse(
                id=m.id,
                ticket_id=m.ticket_id,
                sender_id=m.sender_id,
                sender_username=m.sender.username if m.sender else "Staff",
                message=m.message,
                is_admin_reply=m.is_admin_reply,
                is_read=m.is_read,
                created_at=m.created_at
            )
            for m in fresh_ticket.messages
        ],
        created_at=fresh_ticket.created_at,
        updated_at=fresh_ticket.updated_at
    )


@router.get("/{panel_id}/tickets/{ticket_id}", response_model=TicketResponse)
async def get_child_panel_ticket_detail(
    panel_id: uuid.UUID,
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Get full threaded messages for a specific support ticket on this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    query = (
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(
            Ticket.id == ticket_id,
            or_(
                Ticket.tenant_id == panel.id,
                Ticket.user.has(User.tenant_id == panel.id)
            )
        )
    )
    result = await db.execute(query)
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found for this panel.")

    # Automatically mark admin_unread as False when panel staff opens the ticket
    if ticket.admin_unread:
        ticket.admin_unread = False
        db.add(ticket)
        await db.commit()

    return TicketResponse(
        id=ticket.id,
        user_id=ticket.user_id,
        username=ticket.user.username if ticket.user else "Customer",
        order_id=ticket.order_id,
        subject=ticket.subject,
        priority=ticket.priority,
        status=ticket.status,
        user_unread=ticket.user_unread,
        admin_unread=ticket.admin_unread,
        messages=[
            TicketMessageResponse(
                id=m.id,
                ticket_id=m.ticket_id,
                sender_id=m.sender_id,
                sender_username=m.sender.username if m.sender else "Staff",
                message=m.message,
                is_admin_reply=m.is_admin_reply,
                is_read=m.is_read,
                created_at=m.created_at
            )
            for m in ticket.messages
        ],
        created_at=ticket.created_at,
        updated_at=ticket.updated_at
    )


@router.post("/{panel_id}/tickets/{ticket_id}/reply", response_model=TicketResponse)
async def reply_child_panel_ticket(
    panel_id: uuid.UUID,
    ticket_id: uuid.UUID,
    reply_in: TicketReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Child panel owner/staff reply to support ticket and automatically mark status as 'Answered'."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    query = (
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(
            Ticket.id == ticket_id,
            or_(
                Ticket.tenant_id == panel.id,
                Ticket.user.has(User.tenant_id == panel.id)
            )
        )
    )
    result = await db.execute(query)
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found for this panel.")

    msg = TicketMessage(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        message=reply_in.message,
        is_admin_reply=True
    )
    ticket.status = TicketStatus.ANSWERED
    ticket.user_unread = True
    ticket.admin_unread = False
    db.add(msg)
    db.add(ticket)
    await db.commit()

    # Re-fetch ticket with fresh messages eagerly
    reload_q = (
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(Ticket.id == ticket_id)
        .execution_options(populate_existing=True)
    )
    res = await db.execute(reload_q)
    fresh_ticket = res.scalars().first()

    return TicketResponse(
        id=fresh_ticket.id,
        user_id=fresh_ticket.user_id,
        username=fresh_ticket.user.username if fresh_ticket.user else "Customer",
        order_id=fresh_ticket.order_id,
        subject=fresh_ticket.subject,
        priority=fresh_ticket.priority,
        status=fresh_ticket.status,
        user_unread=fresh_ticket.user_unread,
        admin_unread=fresh_ticket.admin_unread,
        messages=[
            TicketMessageResponse(
                id=m.id,
                ticket_id=m.ticket_id,
                sender_id=m.sender_id,
                sender_username=m.sender.username if m.sender else "Staff",
                message=m.message,
                is_admin_reply=m.is_admin_reply,
                is_read=m.is_read,
                created_at=m.created_at
            )
            for m in fresh_ticket.messages
        ],
        created_at=fresh_ticket.created_at,
        updated_at=fresh_ticket.updated_at
    )


@router.patch("/{panel_id}/tickets/{ticket_id}/status", response_model=TicketResponse)
async def update_child_panel_ticket_status(
    panel_id: uuid.UUID,
    ticket_id: uuid.UUID,
    status_in: TicketStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Change support ticket status (e.g. close or reopen) for this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    query = (
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(
            Ticket.id == ticket_id,
            or_(
                Ticket.tenant_id == panel.id,
                Ticket.user.has(User.tenant_id == panel.id)
            )
        )
    )
    result = await db.execute(query)
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found for this panel.")

    ticket.status = status_in.status
    db.add(ticket)
    await db.commit()

    reload_q = (
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(Ticket.id == ticket_id)
        .execution_options(populate_existing=True)
    )
    res = await db.execute(reload_q)
    fresh_ticket = res.scalars().first()

    return TicketResponse(
        id=fresh_ticket.id,
        user_id=fresh_ticket.user_id,
        username=fresh_ticket.user.username if fresh_ticket.user else "Customer",
        order_id=fresh_ticket.order_id,
        subject=fresh_ticket.subject,
        priority=fresh_ticket.priority,
        status=fresh_ticket.status,
        messages=[
            TicketMessageResponse(
                id=m.id,
                ticket_id=m.ticket_id,
                sender_id=m.sender_id,
                sender_username=m.sender.username if m.sender else "Staff",
                message=m.message,
                is_admin_reply=m.is_admin_reply,
                created_at=m.created_at
            )
            for m in fresh_ticket.messages
        ],
        created_at=fresh_ticket.created_at,
        updated_at=fresh_ticket.updated_at
    )


# ------------------------------------------------------------------------------
# 3. CHILD PANEL CUSTOMER USER MANAGEMENT
# ------------------------------------------------------------------------------

@router.get("/{panel_id}/users", response_model=List[ChildPanelUserResponse])
async def list_child_panel_users(
    panel_id: uuid.UUID,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """List all registered customers belonging to this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    query = (
        select(User)
        .where(User.tenant_id == panel.id)
        .order_by(desc(User.created_at))
        .offset(skip)
        .limit(limit)
    )
    if search:
        pattern = f"%{search.strip().lower()}%"
        query = query.where(
            (User.username.ilike(pattern)) |
            (User.email.ilike(pattern)) |
            (User.full_name.ilike(pattern))
        )

    result = await db.execute(query)
    users = result.scalars().all()

    out = []
    for u in users:
        orders_stat = await db.execute(
            select(func.count(Order.id), func.coalesce(func.sum(Order.charge), Decimal("0.00")))
            .where(Order.user_id == u.id, Order.tenant_id == panel.id)
        )
        cnt, spent = orders_stat.first() or (0, Decimal("0.00"))

        out.append(
            ChildPanelUserResponse(
                id=u.id,
                username=u.username,
                email=u.email,
                phone_number=u.phone_number,
                balance=u.balance,
                currency=u.currency or "KES",
                is_active=u.is_active,
                total_orders=cnt or 0,
                total_spent=Decimal(str(spent or 0)),
                created_at=u.created_at
            )
        )
    return out


@router.patch("/{panel_id}/users/{user_id}/status", response_model=ChildPanelUserResponse)
async def update_child_panel_user_status(
    panel_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ChildPanelUserStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Activate or suspend a customer registered on this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    res = await db.execute(select(User).where(User.id == user_id, User.tenant_id == panel.id))
    user_record = res.scalars().first()
    if not user_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found under this panel.")

    user_record.is_active = payload.is_active
    db.add(user_record)
    await db.commit()
    await db.refresh(user_record)

    orders_stat = await db.execute(
        select(func.count(Order.id), func.coalesce(func.sum(Order.charge), Decimal("0.00")))
        .where(Order.user_id == user_record.id, Order.tenant_id == panel.id)
    )
    cnt, spent = orders_stat.first() or (0, Decimal("0.00"))

    return ChildPanelUserResponse(
        id=user_record.id,
        username=user_record.username,
        email=user_record.email,
        phone_number=user_record.phone_number,
        balance=user_record.balance,
        currency=user_record.currency or "KES",
        is_active=user_record.is_active,
        total_orders=cnt or 0,
        total_spent=Decimal(str(spent or 0)),
        created_at=user_record.created_at
    )


# =============================================================================
# SERVICE MANAGEMENT — Panel owner manages which services appear on their panel
# =============================================================================

_PUBLIC_PLATFORMS = [
    Platform.TIKTOK,
    Platform.FACEBOOK,
    Platform.INSTAGRAM,
    Platform.WHATSAPP,
    Platform.TELEGRAM,
]


async def _get_panel_for_owner(
    panel_id: str,
    db: AsyncSession,
    current_user: User
) -> ChildPanel:
    """Resolve panel by ID, verifying ownership (or admin bypass)."""
    try:
        pid = uuid.UUID(panel_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid panel ID")
    q = await db.execute(select(ChildPanel).where(ChildPanel.id == pid))
    panel = q.scalars().first()
    if not panel:
        raise HTTPException(status_code=404, detail="Child panel not found")
    if str(panel.user_id) != str(current_user.id) and current_user.role not in [
        UserRole.ADMIN, UserRole.SUPER_ADMIN
    ]:
        raise HTTPException(status_code=403, detail="Access denied")
    return panel


@router.get("/{panel_id}/services", response_model=List[ChildPanelServiceItemResponse])
async def list_panel_services(
    panel_id: str,
    platform: Optional[str] = None,
    search: Optional[str] = None,
    category: Optional[str] = None,
    enabled_only: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    List all catalog services with this panel's enable/disable state and markup overrides.
    Shows wholesale cost, computed client rate, and per-service custom markup.
    """
    panel = await _get_panel_for_owner(panel_id, db, current_user)

    default_markup = Decimal("0")
    if panel.branding_json:
        try:
            default_markup = Decimal(str(panel.branding_json.get("default_markup_percent", 0)))
        except Exception:
            default_markup = Decimal("0")

    svc_query = (
        select(Service)
        .where(
            Service.is_active == True,
            Service.platform.in_(_PUBLIC_PLATFORMS),
            Service.provider_rate > Decimal("0.00"),
        )
        .order_by(Service.sort_order, Service.name)
        .offset(skip)
        .limit(limit)
    )
    if platform:
        # Compare against the stored string value directly (case-insensitive)
        platform_lower = platform.lower().strip()
        svc_query = svc_query.where(Service.platform == platform_lower)
    if category and category != "all":
        svc_query = svc_query.where(Service.category.ilike(f"%{category}%"))
    if search:
        pat = f"%{search.lower()}%"
        svc_query = svc_query.where(
            (Service.name.ilike(pat)) |
            (Service.category.ilike(pat)) |
            (Service.description.ilike(pat))
        )

    svc_result = await db.execute(svc_query)
    services = svc_result.scalars().all()

    svc_ids = [s.id for s in services]
    if svc_ids:
        cfg_result = await db.execute(
            select(ChildPanelServiceConfig).where(
                ChildPanelServiceConfig.panel_id == panel.id,
                ChildPanelServiceConfig.service_id.in_(svc_ids)
            )
        )
        configs = {str(c.service_id): c for c in cfg_result.scalars().all()}
    else:
        configs = {}

    items = []
    for s in services:
        cfg = configs.get(str(s.id))
        is_enabled = cfg.is_enabled if cfg else True
        if enabled_only and not is_enabled:
            continue

        ws = s.wholesale_rate if (s.wholesale_rate and s.wholesale_rate > Decimal("0")) \
            else round(s.provider_rate * Decimal("1.30"), 2)

        default_client_rate = round(ws * (1 + default_markup / 100), 2) if default_markup > 0 else s.selling_rate
        custom_pct = cfg.custom_markup_percent if cfg and cfg.custom_markup_percent is not None else None
        effective_client_rate = round(ws * (1 + custom_pct / 100), 2) if custom_pct is not None else default_client_rate

        items.append(ChildPanelServiceItemResponse(
            id=s.id,
            platform=s.platform.value if hasattr(s.platform, "value") else str(s.platform),
            name=s.name,
            description=s.description,
            service_type=s.service_type,
            category=s.category,
            wholesale_rate=ws,
            default_client_rate=default_client_rate,
            custom_markup_percent=custom_pct,
            effective_client_rate=effective_client_rate,
            min_quantity=s.min_quantity,
            max_quantity=s.max_quantity,
            refill_available=s.refill_available,
            cancel_available=s.cancel_available,
            is_enabled=is_enabled,
        ))

    return items


@router.patch("/{panel_id}/services/{service_id}", response_model=ChildPanelServiceItemResponse)
async def update_panel_service_config(
    panel_id: str,
    service_id: uuid.UUID,
    body: ChildPanelServiceConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """Toggle enable/disable or set a custom markup for one service on this child panel."""
    panel = await _get_panel_for_owner(panel_id, db, current_user)

    svc_q = await db.execute(select(Service).where(Service.id == service_id, Service.is_active == True))
    svc = svc_q.scalars().first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    cfg_q = await db.execute(
        select(ChildPanelServiceConfig).where(
            ChildPanelServiceConfig.panel_id == panel.id,
            ChildPanelServiceConfig.service_id == service_id
        )
    )
    cfg = cfg_q.scalars().first()
    if not cfg:
        cfg = ChildPanelServiceConfig(
            panel_id=panel.id,
            service_id=service_id,
            is_enabled=True,
            custom_markup_percent=None
        )
        db.add(cfg)

    if body.is_enabled is not None:
        cfg.is_enabled = body.is_enabled
    if "custom_markup_percent" in body.model_fields_set:
        cfg.custom_markup_percent = body.custom_markup_percent

    await db.commit()
    await db.refresh(cfg)

    default_markup = Decimal("0")
    if panel.branding_json:
        try:
            default_markup = Decimal(str(panel.branding_json.get("default_markup_percent", 0)))
        except Exception:
            pass

    ws = svc.wholesale_rate if (svc.wholesale_rate and svc.wholesale_rate > Decimal("0")) \
        else round(svc.provider_rate * Decimal("1.30"), 2)
    default_client_rate = round(ws * (1 + default_markup / 100), 2) if default_markup > 0 else svc.selling_rate
    custom_pct = cfg.custom_markup_percent
    effective_client_rate = round(ws * (1 + custom_pct / 100), 2) if custom_pct is not None else default_client_rate

    return ChildPanelServiceItemResponse(
        id=svc.id,
        platform=svc.platform.value if hasattr(svc.platform, "value") else str(svc.platform),
        name=svc.name,
        description=svc.description,
        service_type=svc.service_type,
        category=svc.category,
        wholesale_rate=ws,
        default_client_rate=default_client_rate,
        custom_markup_percent=custom_pct,
        effective_client_rate=effective_client_rate,
        min_quantity=svc.min_quantity,
        max_quantity=svc.max_quantity,
        refill_available=svc.refill_available,
        cancel_available=svc.cancel_available,
        is_enabled=cfg.is_enabled,
    )


@router.post("/{panel_id}/services/bulk", response_model=dict)
async def bulk_update_panel_services(
    panel_id: str,
    body: ChildPanelServiceBulkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """Bulk enable or disable a list of services for this child panel."""
    panel = await _get_panel_for_owner(panel_id, db, current_user)

    if not body.service_ids:
        return {"updated": 0, "message": "No services provided."}

    cfg_q = await db.execute(
        select(ChildPanelServiceConfig).where(
            ChildPanelServiceConfig.panel_id == panel.id,
            ChildPanelServiceConfig.service_id.in_(body.service_ids)
        )
    )
    existing = {str(c.service_id): c for c in cfg_q.scalars().all()}

    updated = 0
    for svc_id in body.service_ids:
        cfg = existing.get(str(svc_id))
        if cfg:
            cfg.is_enabled = body.is_enabled
        else:
            cfg = ChildPanelServiceConfig(
                panel_id=panel.id,
                service_id=svc_id,
                is_enabled=body.is_enabled,
            )
            db.add(cfg)
        updated += 1

    await db.commit()
    action = "enabled" if body.is_enabled else "disabled"
    return {"updated": updated, "message": f"{updated} service(s) {action} on your panel."}
@router.post("/{panel_id}/users/{user_id}/adjust-balance", response_model=ChildPanelUserResponse)
async def adjust_child_panel_user_balance(
    panel_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ChildPanelUserBalanceAdjust,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Credit or debit a customer's wallet balance on this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    res = await db.execute(select(User).where(User.id == user_id, User.tenant_id == panel.id))
    user_record = res.scalars().first()
    if not user_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found under this panel.")

    bal_before = user_record.balance
    bal_after = bal_before + payload.amount
    if bal_after < Decimal("0.00"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Adjustment would result in negative balance: KES {bal_after:,.2f}")

    user_record.balance = bal_after
    db.add(user_record)

    tx = Transaction(
        user_id=user_record.id,
        type=TransactionType.DEPOSIT if payload.amount >= Decimal("0.00") else TransactionType.WALLET_ADJUSTMENT,
        amount=payload.amount,
        balance_before=bal_before,
        balance_after=bal_after,
        currency=user_record.currency or "KES",
        payment_method=PaymentMethod.INTERNAL,
        payment_reference=f"PANEL-ADJ-{secrets.token_hex(4).upper()}",
        status=TransactionStatus.COMPLETED,
        description=f"Panel Admin: {payload.reason or 'Balance adjustment'}"
    )
    db.add(tx)
    await db.commit()
    await db.refresh(user_record)

    orders_stat = await db.execute(
        select(func.count(Order.id), func.coalesce(func.sum(Order.charge), Decimal("0.00")))
        .where(Order.user_id == user_record.id, Order.tenant_id == panel.id)
    )
    cnt, spent = orders_stat.first() or (0, Decimal("0.00"))

    return ChildPanelUserResponse(
        id=user_record.id,
        username=user_record.username,
        email=user_record.email,
        phone_number=user_record.phone_number,
        balance=user_record.balance,
        currency=user_record.currency or "KES",
        is_active=user_record.is_active,
        total_orders=cnt or 0,
        total_spent=Decimal(str(spent or 0)),
        created_at=user_record.created_at
    )


# ------------------------------------------------------------------------------
# 5. RETROACTIVE ORDER BALANCE RECONCILIATION
# ------------------------------------------------------------------------------

@router.post("/{panel_id}/reconcile-orders")
async def reconcile_child_panel_orders_endpoint(
    panel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Retroactively inspects all customer orders placed on this child panel.
    Deducts retail charges for any customer whose order was undeducted,
    deducts wholesale costs from the child panel owner, and synchronizes
    the child panel admin balance.
    """
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)
    from app.services.reconciliation_service import reconcile_panel_orders
    report = await reconcile_panel_orders(db, panel_id=panel.id, dry_run=False)
    return report


@router.post("/admin/reconcile-all-orders")
async def reconcile_all_child_panel_orders_admin_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Super Admin endpoint to retroactively reconcile undeducted orders across all child panels.
    """
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform administrator privileges required.")
    from app.services.reconciliation_service import reconcile_panel_orders
    report = await reconcile_panel_orders(db, panel_id=None, dry_run=False)
    return report


