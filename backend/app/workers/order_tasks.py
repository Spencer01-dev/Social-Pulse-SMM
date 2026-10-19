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

    return total_checked, total_updated


async def sync_single_order(db: AsyncSession, order: Order) -> Tuple[bool, Order]:
    """
    Sync a single order immediately against its upstream provider.
    Updates start_count, remains, and status, and commits to DB.
    """
    if not order.provider_order_id:
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

