"""
SocialPulse Order Refund Engine
Handles dual-entry refunds for retail customers and child panel parent wholesale accounts.
Guarantees strict idempotency and audit ledger compliance.
"""
import logging
from decimal import Decimal
from typing import Any, Dict, Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.child_panel import ChildPanel
from app.models.order import Order, OrderStatus
from app.models.service import Service
from app.models.transaction import (
    PaymentMethod,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from app.models.user import User, UserRole

logger = logging.getLogger("socialpulse.refund_engine")


async def refund_order(
    db: AsyncSession,
    order: Order,
    reason: str = "Order canceled",
    partial_remains: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Executes idempotent refund for an order:
    1. Credits retail charge (or partial remainder) back to the ordering customer.
    2. If the order originated from a child panel, credits wholesale cost back to the panel owner's parent account.
    3. Syncs the child panel admin's balance immediately with the parent account balance.
    4. Records double-entry Transaction ledger entries for all balance movements.
    """
    results = {
        "customer_refunded": False,
        "customer_amount": Decimal("0.00"),
        "owner_refunded": False,
        "owner_amount": Decimal("0.00"),
    }

    # 1. Determine customer refund amount
    charge = Decimal(str(order.charge or 0.00))
    customer_refund = Decimal("0.00")

    if order.status in [OrderStatus.CANCELED, OrderStatus.FAILED]:
        customer_refund = charge
    elif order.status == OrderStatus.PARTIAL:
        remains = partial_remains if partial_remains is not None else order.remains
        qty = order.quantity or 1
        if qty > 0 and remains and remains > 0:
            ratio = Decimal(str(remains)) / Decimal(str(qty))
            customer_refund = round(charge * ratio, 2)
    else:
        # If explicitly called with reason indicating cancel
        customer_refund = charge

    # 2. Refund Customer Wallet
    if customer_refund > Decimal("0.00") and order.user_id:
        # Check idempotency: has customer already received a refund for this order?
        existing_cust_rf = await db.execute(
            select(Transaction).where(
                Transaction.order_id == order.id,
                Transaction.user_id == order.user_id,
                Transaction.type == TransactionType.ORDER_REFUND,
            )
        )
        if not existing_cust_rf.scalars().first():
            cust_res = await db.execute(
                select(User).where(User.id == order.user_id).with_for_update()
            )
            customer = cust_res.scalars().first()
            if customer:
                bal_before = Decimal(str(customer.balance or "0.00"))
                bal_after = bal_before + customer_refund
                customer.balance = bal_after
                db.add(customer)

                refund_tx = Transaction(
                    user_id=customer.id,
                    order_id=order.id,
                    tenant_id=order.tenant_id,
                    type=TransactionType.ORDER_REFUND,
                    amount=customer_refund,
                    balance_before=bal_before,
                    balance_after=bal_after,
                    currency=order.currency or "KES",
                    payment_method=PaymentMethod.INTERNAL,
                    payment_reference=f"REFUND-{str(order.id)[:8]}",
                    status=TransactionStatus.COMPLETED,
                    description=f"{reason} - Refund for Order #{order.order_number or str(order.id)[:8]}",
                    metadata_json={
                        "order_id": str(order.id),
                        "order_number": order.order_number,
                        "customer_id": str(customer.id),
                        "refund_amount": str(customer_refund),
                        "reason": reason,
                    },
                )
                db.add(refund_tx)
                results["customer_refunded"] = True
                results["customer_amount"] = customer_refund
                logger.info(
                    f"[+] Customer refund: credited KES {customer_refund} to {customer.username} for Order #{order.order_number or str(order.id)[:8]}"
                )

    # 3. Child Panel Wholesale Refund (if order belongs to a child panel tenant)
    if order.tenant_id:
        panel_res = await db.execute(
            select(ChildPanel).where(ChildPanel.id == order.tenant_id)
        )
        panel = panel_res.scalars().first()

        if panel and panel.user_id and panel.user_id != order.user_id:
            # Check idempotency: has the panel owner already received a wholesale refund for this order?
            existing_owner_rf = await db.execute(
                select(Transaction).where(
                    Transaction.order_id == order.id,
                    Transaction.user_id == panel.user_id,
                    Transaction.type == TransactionType.ORDER_REFUND,
                )
            )
            if not existing_owner_rf.scalars().first():
                # Determine wholesale amount originally deducted
                wholesale_cost = Decimal("0.00")

                # Check if wholesale payment transaction exists in ledger
                owner_tx_res = await db.execute(
                    select(Transaction).where(
                        Transaction.order_id == order.id,
                        Transaction.user_id == panel.user_id,
                        Transaction.type == TransactionType.ORDER_PAYMENT,
                    )
                )
                owner_payment_tx = owner_tx_res.scalars().first()
                if owner_payment_tx:
                    wholesale_cost = abs(owner_payment_tx.amount)
                else:
                    # Calculate from service wholesale rate or fallback
                    srv_res = await db.execute(
                        select(Service).where(Service.id == order.service_id)
                    )
                    service = srv_res.scalars().first()
                    qty = order.quantity or 1
                    if service:
                        w_rate = (
                            service.wholesale_rate
                            if (service.wholesale_rate and service.wholesale_rate > Decimal("0"))
                            else round(service.provider_rate * Decimal("1.30"), 2)
                        )
                        is_package = service.service_type and str(service.service_type).lower() == "package"
                        if is_package:
                            wholesale_cost = round(w_rate * Decimal(qty), 2)
                        else:
                            wholesale_cost = round((w_rate * Decimal(qty)) / Decimal(1000), 2)
                    else:
                        wholesale_cost = Decimal(str(order.provider_cost or 0.00))

                # If partial, scale by unfulfilled ratio
                owner_refund = wholesale_cost
                if order.status == OrderStatus.PARTIAL and order.quantity > 0:
                    remains = partial_remains if partial_remains is not None else order.remains
                    ratio = Decimal(str(remains or 0)) / Decimal(str(order.quantity))
                    owner_refund = round(wholesale_cost * ratio, 2)

                if owner_refund > Decimal("0.00"):
                    owner_res = await db.execute(
                        select(User).where(User.id == panel.user_id).with_for_update()
                    )
                    panel_owner = owner_res.scalars().first()
                    if panel_owner:
                        owner_bal_before = Decimal(str(panel_owner.balance or "0.00"))
                        owner_bal_after = owner_bal_before + owner_refund
                        panel_owner.balance = owner_bal_after
                        db.add(panel_owner)

                        owner_tx = Transaction(
                            user_id=panel_owner.id,
                            order_id=order.id,
                            tenant_id=panel.id,
                            type=TransactionType.ORDER_REFUND,
                            amount=owner_refund,
                            balance_before=owner_bal_before,
                            balance_after=owner_bal_after,
                            currency="KES",
                            payment_method=PaymentMethod.INTERNAL,
                            payment_reference=f"WHOLESALE-REFUND-{str(order.id)[:8]}",
                            status=TransactionStatus.COMPLETED,
                            description=f"Wholesale refund for canceled Order #{order.order_number or str(order.id)[:8]} on {panel.domain}",
                            metadata_json={
                                "order_id": str(order.id),
                                "order_number": order.order_number,
                                "panel_id": str(panel.id),
                                "panel_domain": panel.domain,
                                "wholesale_amount": str(owner_refund),
                                "reason": reason,
                            },
                        )
                        db.add(owner_tx)
                        results["owner_refunded"] = True
                        results["owner_amount"] = owner_refund
                        logger.info(
                            f"[+] Panel Owner wholesale refund: credited KES {owner_refund} to {panel_owner.username} for Order #{order.order_number or str(order.id)[:8]}"
                        )

                        # Sync Child Panel Admin account balance immediately
                        admin_res = await db.execute(
                            select(User).where(
                                User.tenant_id == panel.id,
                                User.role == UserRole.ADMIN,
                            ).with_for_update()
                        )
                        tenant_admins = admin_res.scalars().all()
                        for admin_u in tenant_admins:
                            admin_u.balance = panel_owner.balance
                            db.add(admin_u)

    return results
