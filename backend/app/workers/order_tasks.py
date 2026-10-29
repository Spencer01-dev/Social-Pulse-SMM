import logging
from decimal import Decimal
from typing import Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order, OrderStatus
from app.models.provider import Provider
from app.models.transaction import PaymentMethod, Transaction, TransactionStatus, TransactionType
from app.models.user import User
from app.core.config import settings
from app.providers.manager import get_provider

logger = logging.getLogger("socialpulse.order_tasks")


def map_provider_status(provider_status_str: str) -> OrderStatus:
    """
    Map external provider status strings to SocialPulse OrderStatus enum.
    """
    s = str(provider_status_str).lower().strip()
    if "pending" in s or "queue" in s:
        return OrderStatus.PENDING
    elif "process" in s:
        return OrderStatus.PROCESSING
    elif "progress" in s:
        return OrderStatus.IN_PROGRESS
    elif "complete" in s or "success" in s or "done" in s or "finish" in s:
        return OrderStatus.COMPLETED
    elif "partial" in s:
        return OrderStatus.PARTIAL
    elif "cancel" in s or "refund" in s:
        return OrderStatus.CANCELED
    elif "fail" in s or "error" in s:
        return OrderStatus.FAILED
    return OrderStatus.IN_PROGRESS


async def reconcile_provider_cost_and_deduction(
    db: AsyncSession,
    order: Order,
    status_data
) -> bool:
    """
    Sync actual charge from upstream provider (JAP) to order.provider_cost.
    If the order was placed on a Child Panel, ensure order.wholesale_cost equals provider_cost,
    and adjust the child panel owner's balance accordingly so SocialPulse never under- or over-deducts.
    """
    if not status_data or getattr(status_data, "charge", None) is None:
        return False

    try:
        charge_raw = Decimal(str(status_data.charge))
    except Exception:
        return False

    if charge_raw <= Decimal("0.00"):
        return False

    # Convert to KES if provider reported in USD
    currency = getattr(status_data, "currency", "USD") or "USD"
    if str(currency).upper() == "USD":
        actual_kes = round(charge_raw * Decimal(str(settings.DEFAULT_USD_TO_KES)), 2)
    else:
        actual_kes = round(charge_raw, 2)

    changed = False

    # 1. Update order.provider_cost if different
    current_prov = Decimal(str(order.provider_cost or "0.00"))
    if abs(current_prov - actual_kes) > Decimal("0.01"):
        order.provider_cost = actual_kes
        changed = True

    # Order charge & profit reconciliation:
    # Protect against mispriced orders where provider charge exceeds original retail charge
    if order.charge < actual_kes:
        order.charge = actual_kes
        changed = True

    expected_profit = round(order.charge - actual_kes, 2)
    if order.profit != expected_profit:
        order.profit = expected_profit
        changed = True

    # 2. For child panel orders, wholesale cost = actual provider cost
    if order.tenant_id:
        current_ws = Decimal(str(order.wholesale_cost or "0.00"))
        if abs(current_ws - actual_kes) > Decimal("0.01"):
            diff = actual_kes - current_ws  # positive: deduct more from owner; negative: refund excess
            order.wholesale_cost = actual_kes

            # Adjust child panel owner balance so SocialPulse deducts exact live provider cost
            from app.models.child_panel import ChildPanel
            from app.models.user import UserRole
            p_res = await db.execute(select(ChildPanel).where(ChildPanel.id == order.tenant_id))
            panel = p_res.scalars().first()
            if panel and panel.user_id:
                owner_res = await db.execute(
                    select(User).where(User.id == panel.user_id).with_for_update()
                )
                panel_owner = owner_res.scalars().first()
                if panel_owner:
                    bal_before = panel_owner.balance
                    bal_after = max(Decimal("0.00"), bal_before - diff)
                    panel_owner.balance = bal_after
                    db.add(panel_owner)

                    adj_tx = Transaction(
                        user_id=panel_owner.id,
                        order_id=order.id,
                        tenant_id=panel.id,
                        type=TransactionType.ORDER_PAYMENT if diff > 0 else TransactionType.ORDER_REFUND,
                        amount=-diff,
                        balance_before=bal_before,
                        balance_after=bal_after,
                        currency="KES",
                        payment_method=PaymentMethod.INTERNAL,
                        payment_reference=f"WHOLESALE-ADJUST-{order.order_number or str(order.id)[:8]}",
                        status=TransactionStatus.COMPLETED,
                        description=(
                            f"Wholesale cost sync for Order #{order.order_number or str(order.id)[:8]} "
                            f"(Provider actual cost: KES {actual_kes:,.2f})"
                        )
                    )
                    db.add(adj_tx)

                    # Keep child panel admin user in sync
                    admin_res = await db.execute(
                        select(User).where(
                            User.tenant_id == panel.id,
                            User.role == UserRole.ADMIN,
                        ).with_for_update()
                    )
                    for admin_u in admin_res.scalars().all():
                        admin_u.balance = bal_after
                        db.add(admin_u)

    elif not order.tenant_id:
        order.profit = max(Decimal("0.00"), Decimal(str(order.charge or "0.00")) - actual_kes)
        changed = True

    return changed


async def reconcile_recent_child_panel_orders(db: AsyncSession, days: int = 30) -> int:
    """
    Reconciles all recent orders against live provider charges from JAP,
    ensuring wholesale_cost matches real provider_cost, enforcing 50% markup,
    and synchronizing child panel owner deductions.
    """
    from datetime import datetime, timedelta, timezone
    from app.models.service import Service
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    query = (
        select(Order)
        .options(selectinload(Order.service), selectinload(Order.provider))
        .where(Order.created_at >= cutoff)
    )
    result = await db.execute(query)
    orders = result.scalars().all()
    updated_count = 0
    provider_client = get_provider(slug="jap")

    for ord_item in orders:
        try:
            status_data = None
            if ord_item.provider_order_id:
                try:
                    status_data = await provider_client.get_order_status(ord_item.provider_order_id)
                except Exception:
                    status_data = None

            # 1. Determine actual provider cost from JAP or service provider rate
            if status_data and getattr(status_data, "charge", None) and Decimal(str(status_data.charge)) > Decimal("0.00"):
                chg_dec = Decimal(str(status_data.charge))
                curr = getattr(status_data, "currency", "USD") or "USD"
                if str(curr).upper() == "USD":
                    actual_kes = round(chg_dec * Decimal(str(settings.DEFAULT_USD_TO_KES)), 2)
                else:
                    actual_kes = round(chg_dec, 2)
            elif ord_item.service and ord_item.service.provider_rate and ord_item.service.provider_rate > Decimal("0.00"):
                is_pkg = ord_item.service.service_type and str(ord_item.service.service_type).lower() == "package"
                qty = ord_item.quantity or 1
                if is_pkg:
                    actual_kes = round(ord_item.service.provider_rate * Decimal(qty), 2)
                else:
                    actual_kes = round((ord_item.service.provider_rate * Decimal(qty)) / Decimal(1000), 2)
            else:
                actual_kes = Decimal(str(ord_item.provider_cost or ord_item.wholesale_cost or "0.00"))

            if actual_kes > Decimal("0.00"):
                prev_ws = Decimal(str(ord_item.wholesale_cost or "0.00"))
                diff = actual_kes - prev_ws

                ord_item.provider_cost = actual_kes
                ord_item.wholesale_cost = actual_kes
                
                # Protect customer charge against negative margin
                if ord_item.charge < actual_kes:
                    ord_item.charge = actual_kes
                
                ord_item.profit = round(ord_item.charge - actual_kes, 2)

                # Reconcile child panel owner balance if applicable
                if ord_item.tenant_id and abs(diff) > Decimal("0.01"):
                    from app.models.child_panel import ChildPanel
                    from app.models.user import UserRole
                    p_res = await db.execute(select(ChildPanel).where(ChildPanel.id == ord_item.tenant_id))
                    panel = p_res.scalars().first()
                    if panel and panel.user_id:
                        owner_res = await db.execute(
                            select(User).where(User.id == panel.user_id).with_for_update()
                        )
                        panel_owner = owner_res.scalars().first()
                        if panel_owner:
                            bal_before = panel_owner.balance
                            bal_after = max(Decimal("0.00"), bal_before - diff)
                            panel_owner.balance = bal_after
                            db.add(panel_owner)

                            adj_tx = Transaction(
                                user_id=panel_owner.id,
                                order_id=ord_item.id,
                                tenant_id=panel.id,
                                type=TransactionType.ORDER_PAYMENT if diff > 0 else TransactionType.ORDER_REFUND,
                                amount=-diff,
                                balance_before=bal_before,
                                balance_after=bal_after,
                                currency="KES",
                                payment_method=PaymentMethod.INTERNAL,
                                payment_reference=f"WHOLESALE-ADJUST-{ord_item.order_number or str(ord_item.id)[:8]}",
                                status=TransactionStatus.COMPLETED,
                                description=(
                                    f"Wholesale price sync for Order #{ord_item.order_number or str(ord_item.id)[:8]} "
                                    f"(JAP provider cost: KES {actual_kes:,.2f})"
                                )
                            )
                            db.add(adj_tx)

                            # Keep child panel admin user in sync
                            admin_res = await db.execute(
                                select(User).where(
                                    User.tenant_id == panel.id,
                                    User.role == UserRole.ADMIN,
                                ).with_for_update()
                            )
                            for admin_u in admin_res.scalars().all():
                                admin_u.balance = bal_after
                                db.add(admin_u)

                db.add(ord_item)
                updated_count += 1
        except Exception as e:
            logger.warning(f"Failed to reconcile order {ord_item.id}: {e}")
            continue

    if updated_count > 0:
        await db.commit()
    logger.info(f"[+] Corrected {updated_count} recent orders to live JAP wholesale prices and 50% markup.")
    return updated_count


async def sync_active_orders(db: AsyncSession) -> Tuple[int, int]:
    """
    Poll status of all active orders from upstream providers.
    Automatically handles state progression (Pending -> Processing -> In Progress -> Completed/Partial/Canceled)
    and executes automated double-entry ledger refunds for Canceled or Partial orders.
    
    Returns: (total_checked, total_updated)
    """
    active_statuses = [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.IN_PROGRESS]

    # Query active orders that have a provider order ID
    query = (
        select(Order)
        .options(selectinload(Order.provider), selectinload(Order.user))
        .where(
            Order.status.in_(active_statuses),
            Order.provider_order_id.isnot(None)
        )
    )
    result = await db.execute(query)
    active_orders = result.scalars().all()

    total_checked = len(active_orders)
    total_updated = 0

    for order in active_orders:
        provider_slug = "jap"
        if order.provider and order.provider.slug:
            provider_slug = order.provider.slug
        elif order.provider_id:
            p_res = await db.execute(select(Provider).where(Provider.id == order.provider_id))
            p_obj = p_res.scalars().first()
            if p_obj and p_obj.slug:
                provider_slug = p_obj.slug

        provider_client = get_provider(slug=provider_slug)

        try:
            status_data = await provider_client.get_order_status(order.provider_order_id)
            new_status = map_provider_status(status_data.status)

            # If upstream provider reports remains is 0, mark completed ASAP
            if (
                status_data.remains == 0
                and status_data.start_count is not None
                and new_status not in [OrderStatus.CANCELED, OrderStatus.PARTIAL, OrderStatus.FAILED]
            ):
                new_status = OrderStatus.COMPLETED

            changed = False
            if status_data.start_count is not None and order.start_count != status_data.start_count:
                order.start_count = status_data.start_count
                changed = True
            if status_data.remains is not None and order.remains != status_data.remains:
                order.remains = status_data.remains
                changed = True

            # Sync live provider charge and reconcile child panel wholesale cost & deduction
            cost_reconciled = await reconcile_provider_cost_and_deduction(db, order, status_data)
            if cost_reconciled:
                changed = True

            # Check if status has changed
            if new_status != order.status:
                old_status = order.status
                order.status = new_status
                changed = True
                logger.info(f"[*] Order #{str(order.id)[:8]} (Provider ID #{order.provider_order_id}) transitioned: {old_status.value} -> {new_status.value}")

                # Automated Double-Entry Refund for Canceled or Partial orders
                if new_status in [OrderStatus.CANCELED, OrderStatus.PARTIAL]:
                    from app.services.refund_service import refund_order
                    await refund_order(
                        db=db,
                        order=order,
                        reason=f"Provider {new_status.value}",
                        partial_remains=order.remains
                    )

            if changed:
                total_updated += 1
                db.add(order)
        except Exception as err:
            logger.warning(f"[!] Error syncing order #{str(order.id)[:8]} (Provider Order ID #{order.provider_order_id}): {err}")
            continue

    if total_updated > 0:
        await db.commit()

    # Auto-retry: Dispatch any PENDING orders that were never sent to a provider
    undispatched_query = (
        select(Order)
        .options(selectinload(Order.service), selectinload(Order.provider), selectinload(Order.user))
        .where(
            Order.status.in_([OrderStatus.PENDING, OrderStatus.PROCESSING]),
            Order.provider_order_id.is_(None)
        )
    )
    undispatched_result = await db.execute(undispatched_query)
    undispatched_orders = undispatched_result.scalars().all()

    if undispatched_orders:
        logger.info(f"[*] Found {len(undispatched_orders)} undispatched orders. Attempting auto-retry dispatch...")

    for order in undispatched_orders:
        try:
            from app.providers.router import SmartProviderRouter
            from app.models.service import Service

            service = order.service
            if not service and order.service_id:
                svc_res = await db.execute(select(Service).where(Service.id == order.service_id))
                service = svc_res.scalars().first()

            if not service:
                logger.warning(f"[!] Cannot auto-dispatch order #{str(order.id)[:8]}: service not found")
                continue

            p_id, p_order_id, msg = await SmartProviderRouter.dispatch_with_failover(
                service=service,
                target_link=order.target_link,
                quantity=order.quantity,
                db=db,
                comments=getattr(order, 'custom_comments', None)
            )
            if p_order_id:
                order.provider_order_id = str(p_order_id)
                order.status = OrderStatus.IN_PROGRESS
                order.error_message = None
                if p_id:
                    import uuid as uuid_mod
                    try:
                        order.provider_id = uuid_mod.UUID(p_id)
                    except Exception:
                        pass
                db.add(order)
                total_updated += 1
                total_checked += 1
                logger.info(f"[+] Auto-retry dispatch SUCCESS for order #{str(order.id)[:8]}! Provider Order ID: {p_order_id}")
        except Exception as retry_err:
            logger.warning(f"[!] Auto-retry dispatch FAILED for order #{str(order.id)[:8]}: {retry_err}")
            continue

    if undispatched_orders:
        await db.commit()

    return total_checked, total_updated


async def sync_single_order(db: AsyncSession, order: Order) -> Tuple[bool, Order]:
    """
    Sync a single order immediately against its upstream provider.
    Updates start_count, remains, and status, and commits to DB.
    If the order was never dispatched (no provider_order_id), retry dispatch now.
    """
    if not order.provider_order_id:
        # Retry dispatch for orders that failed initial submission
        if order.status in [OrderStatus.PENDING, OrderStatus.PROCESSING]:
            logger.info(f"[*] Retrying dispatch for undispatched order #{str(order.id)[:8]}...")
            try:
                from app.providers.router import SmartProviderRouter
                from sqlalchemy.orm import selectinload
                from sqlalchemy import select as sa_select
                from app.models.service import Service

                # Load the service if not already loaded
                service = order.service
                if not service and order.service_id:
                    svc_res = await db.execute(
                        sa_select(Service).where(Service.id == order.service_id)
                    )
                    service = svc_res.scalars().first()

                if service:
                    p_id, p_order_id, msg = await SmartProviderRouter.dispatch_with_failover(
                        service=service,
                        target_link=order.target_link,
                        quantity=order.quantity,
                        db=db,
                        comments=order.custom_comments
                    )
                    if p_order_id:
                        order.provider_order_id = str(p_order_id)
                        order.status = OrderStatus.IN_PROGRESS
                        order.error_message = None
                        if p_id:
                            import uuid as uuid_mod
                            try:
                                order.provider_id = uuid_mod.UUID(p_id)
                            except Exception:
                                pass
                        db.add(order)
                        await db.commit()
                        await db.refresh(order)
                        logger.info(f"[+] Retry dispatch SUCCESS for order #{str(order.id)[:8]}! Provider Order ID: {p_order_id}")
                        return True, order
                    else:
                        logger.warning(f"[!] Retry dispatch returned no order ID for order #{str(order.id)[:8]}")
                else:
                    logger.warning(f"[!] Cannot retry dispatch: service not found for order #{str(order.id)[:8]}")
            except Exception as retry_err:
                logger.warning(f"[!] Retry dispatch FAILED for order #{str(order.id)[:8]}: {retry_err}")
                clean_err = str(retry_err).replace("JustAnotherPanel", "").replace("JAP", "").replace("Provider Error:", "").strip(" :")
                order.error_message = f"Retry failed: {clean_err}"
                db.add(order)
                await db.commit()
        return False, order

    provider_slug = "jap"
    if order.provider and order.provider.slug:
        provider_slug = order.provider.slug
    elif order.provider_id:
        p_res = await db.execute(select(Provider).where(Provider.id == order.provider_id))
        p_obj = p_res.scalars().first()
        if p_obj and p_obj.slug:
            provider_slug = p_obj.slug

    provider_client = get_provider(slug=provider_slug)

    try:
        status_data = await provider_client.get_order_status(order.provider_order_id)
        new_status = map_provider_status(status_data.status)

        # If upstream provider reports remains is 0, mark completed ASAP
        if (
            status_data.remains == 0
            and status_data.start_count is not None
            and new_status not in [OrderStatus.CANCELED, OrderStatus.PARTIAL, OrderStatus.FAILED]
        ):
            new_status = OrderStatus.COMPLETED

        changed = False
        if status_data.start_count is not None and order.start_count != status_data.start_count:
            order.start_count = status_data.start_count
            changed = True
        if status_data.remains is not None and order.remains != status_data.remains:
            order.remains = status_data.remains
            changed = True

        # Sync live provider charge and reconcile child panel wholesale cost & deduction
        cost_reconciled = await reconcile_provider_cost_and_deduction(db, order, status_data)
        if cost_reconciled:
            changed = True

        if new_status != order.status:
            old_status = order.status
            order.status = new_status
            changed = True
            logger.info(f"[*] Single sync: Order #{str(order.id)[:8]} transitioned: {old_status.value} -> {new_status.value}")

            if new_status in [OrderStatus.CANCELED, OrderStatus.PARTIAL]:
                from app.services.refund_service import refund_order
                await refund_order(
                    db=db,
                    order=order,
                    reason=f"Provider single-sync {new_status.value}",
                    partial_remains=order.remains
                )

        if changed:
            db.add(order)
            await db.commit()
            await db.refresh(order)

        return changed, order
    except Exception as err:
        logger.warning(f"[!] Error syncing single order #{str(order.id)[:8]}: {err}")
        return False, order

