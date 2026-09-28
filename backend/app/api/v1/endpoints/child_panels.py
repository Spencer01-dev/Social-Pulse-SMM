import secrets
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import cast, desc, func, or_, select, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, require_roles
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.child_panel import ChildPanel, ChildPanelStatus
from app.models.order import Order, OrderStatus
from app.models.service import Service
from app.models.ticket import Ticket, TicketMessage, TicketPriority, TicketStatus
from app.models.transaction import PaymentMethod, Transaction, TransactionStatus, TransactionType
from app.models.user import User, UserRole
from app.schemas.child_panel import (
    ChildPanelCreate,
    ChildPanelOrderResponse,
    ChildPanelOrderStats,
    ChildPanelPaymentGatewayConfig,
    ChildPanelResponse,
    ChildPanelStatusUpdate,
    ChildPanelUserBalanceAdjust,
    ChildPanelUserResponse,
    ChildPanelUserStatusUpdate,
)
from app.schemas.ticket import (
    TicketMessageResponse,
    TicketReplyRequest,
    TicketResponse,
    TicketStatusUpdate,
    TicketSummaryResponse,
)

router = APIRouter(prefix="/child-panels", tags=["Child Panels"])

PANEL_MONTHLY_FEE = Decimal("1500.00")


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
    """
    query = (
        select(ChildPanel)
        .where(ChildPanel.user_id == current_user.id)
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
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """List all customer orders placed on this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    query = (
        select(Order)
        .options(selectinload(Order.user), selectinload(Order.service))
        .where(Order.tenant_id == panel.id)
        .order_by(desc(Order.created_at))
        .offset(skip)
        .limit(limit)
    )
    if status_filter:
        query = query.where(Order.status == status_filter)
    if search:
        s = f"%{search.strip().lower()}%"
        query = query.join(Order.user, isouter=True).join(Order.service, isouter=True)
        query = query.where(
            (cast(Order.order_number, String).ilike(s)) |
            (Order.target_link.ilike(s)) |
            (User.username.ilike(s)) |
            (Service.name.ilike(s))
        )

    result = await db.execute(query)
    orders = result.scalars().all()

    out = []
    for o in orders:
        out.append(
            ChildPanelOrderResponse(
                id=o.id,
                order_number=o.order_number,
                user_id=o.user_id,
                username=o.user.username if o.user else "Customer",
                service_id=o.service_id,
                service_name=o.service.name if o.service else "Service",
                target_link=o.target_link,
                quantity=o.quantity,
                charge=o.charge,
                profit=o.profit,
                status=o.status.value if hasattr(o.status, "value") else str(o.status),
                remains=o.remains,
                start_count=o.start_count,
                created_at=o.created_at
            )
        )
    return out


@router.get("/{panel_id}/orders/stats", response_model=ChildPanelOrderStats)
async def get_child_panel_order_stats(
    panel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """Get aggregated order statistics and total profit for this child panel."""
    panel = await get_panel_and_verify_owner(panel_id, db, current_user)

    orders_q = await db.execute(
        select(Order.status, Order.charge, Order.profit).where(Order.tenant_id == panel.id)
    )
    rows = orders_q.all()

    total = len(rows)
    pending = 0
    processing = 0
    in_progress = 0
    completed = 0
    canceled = 0
    total_rev = Decimal("0.00")
    total_prof = Decimal("0.00")

    for status_val, charge_val, profit_val in rows:
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
            total_rev += Decimal(str(charge_val or 0))
            total_prof += Decimal(str(profit_val or 0))

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
        .where(Order.id == order_id, Order.tenant_id == panel.id)
    )
    order = res.scalars().first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found for this child panel.")

    if order.status in [OrderStatus.COMPLETED, OrderStatus.CANCELED]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot cancel order in status '{order.status.value}'.")

    order.status = OrderStatus.CANCELED
    order.error_message = "Canceled by Child Panel administrator"

    # Refund customer balance
    if order.charge > 0 and order.user:
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
            payment_reference=f"PANEL-REFUND-{str(order.id)[:8]}",
            status=TransactionStatus.COMPLETED,
            description=f"Child Panel Admin canceled & refunded Order #{str(order.order_number or order.id)[:8]}",
        )
        db.add(refund_tx)

    db.add(order)
    await db.commit()
    await db.refresh(order)

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
                created_at=t.created_at,
                updated_at=t.updated_at
            )
        )
    return summaries


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

    return TicketResponse(
        id=ticket.id,
        user_id=ticket.user_id,
        username=ticket.user.username if ticket.user else "Customer",
        order_id=ticket.order_id,
        subject=ticket.subject,
        priority=ticket.priority,
        status=ticket.status,
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

