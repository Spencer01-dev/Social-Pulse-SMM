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

