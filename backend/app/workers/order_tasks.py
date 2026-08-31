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
    Map external provider (Delix Gains KE) status strings to SocialPulse OrderStatus enum.
    """
    s = str(provider_status_str).lower().strip()
    if "pending" in s or "queue" in s:
        return OrderStatus.PENDING
    elif "process" in s:
        return OrderStatus.PROCESSING
    elif "progress" in s:
        return OrderStatus.IN_PROGRESS
    elif "complete" in s or "success" in s or "done" in s:
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
    Poll status of all active orders from Delix Gains KE and external providers.
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
        provider_slug = order.provider.slug if order.provider else "delix"
        provider_client = get_provider(slug=provider_slug)

        try:
            status_data = await provider_client.get_order_status(order.provider_order_id)
            new_status = map_provider_status(status_data.status)

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
                total_updated += 1
                logger.info(f"[*] Order #{str(order.id)[:8]} (Delix ID #{order.provider_order_id}) transitioned: {old_status.value} -> {new_status.value}")

                # Automated Double-Entry Refund for Canceled or Partial orders
                if new_status in [OrderStatus.CANCELED, OrderStatus.PARTIAL]:
                    refund_amount = Decimal("0.00")
                    if new_status == OrderStatus.CANCELED:
                        refund_amount = order.charge
                    elif new_status == OrderStatus.PARTIAL and order.quantity > 0:
                        unfulfilled_ratio = Decimal(order.remains) / Decimal(order.quantity)
                        refund_amount = round(order.charge * unfulfilled_ratio, 2)

                    if refund_amount > 0 and order.user:
                        balance_before = order.user.balance
                        balance_after = balance_before + refund_amount
                        order.user.balance = balance_after
                        db.add(order.user)

                        # Create double-entry audit transaction ledger entry
                        refund_tx = Transaction(
                            user_id=order.user.id,
                            order_id=order.id,
                            type=TransactionType.ORDER_REFUND,
                            amount=refund_amount,
                            balance_before=balance_before,
                            balance_after=balance_after,
                            currency=order.currency or "KES",
                            payment_method=PaymentMethod.INTERNAL,
                            payment_reference=f"REFUND-{str(order.id)[:8]}",
                            status=TransactionStatus.COMPLETED,
                            description=f"Automated refund for {new_status.value} Order #{str(order.id)[:8]} ({order.remains} unfulfilled)",
                            metadata_json={
                                "order_id": str(order.id),
                                "provider_order_id": order.provider_order_id,
                                "unfulfilled_units": order.remains,
                                "total_quantity": order.quantity,
                                "status": new_status.value,
                            }
                        )
                        db.add(refund_tx)
                        logger.info(f"[+] Auto-refund processed for Order #{str(order.id)[:8]}: {order.currency} {refund_amount} credited to user {order.user.email}")

            if changed:
                db.add(order)
        except Exception as err:
            logger.warning(f"[!] Error syncing order #{str(order.id)[:8]} (Delix Order ID #{order.provider_order_id}): {err}")
            continue

    if total_updated > 0:
        await db.commit()

    return total_checked, total_updated
