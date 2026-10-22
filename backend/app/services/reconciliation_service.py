"""
SocialPulse Order & Balance Reconciliation Service
Reconciles past orders where balances were not deducted:
1. Deducts retail charge from customers where ORDER_PAYMENT transaction is missing.
2. Deducts wholesale cost from child panel owners where wholesale fulfillment was not deducted.
3. Synchronizes child panel admin balances with the parent wholesale account balance.
4. Creates double-entry audit records in transactions ledger.
"""

import logging
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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

logger = logging.getLogger("socialpulse.reconciliation")


async def reconcile_panel_orders(
    db: AsyncSession,
    panel_id: Optional[uuid.UUID] = None,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Reconciles undeducted orders for a specific child panel or across all child panels.
    Guarantees strict idempotency by inspecting the transactions ledger.
    """
    # 1. Fetch relevant child panels
    panel_query = select(ChildPanel)
    if panel_id:
        panel_query = panel_query.where(ChildPanel.id == panel_id)
    
    panels_res = await db.execute(panel_query)
    panels = {p.id: p for p in panels_res.scalars().all()}
    
    if panel_id and panel_id not in panels:
        return {
            "success": False,
            "message": f"Child panel {panel_id} not found",
            "orders_processed": 0,
            "customer_deductions_count": 0,
            "customer_deductions_total": "0.00",
            "owner_deductions_count": 0,
            "owner_deductions_total": "0.00",
            "details": []
        }

    # 2. Fetch orders
    orders_query = (
        select(Order)
        .options(selectinload(Order.service), selectinload(Order.user))
        .order_by(Order.created_at.asc())
    )
    if panel_id:
        orders_query = orders_query.where(
            or_(
                Order.tenant_id == panel_id,
                Order.user.has(User.tenant_id == panel_id)
            )
        )
    else:
        orders_query = orders_query.where(
            or_(
                Order.tenant_id.is_not(None),
                Order.user.has(User.tenant_id.is_not(None))
            )
        )

    orders_res = await db.execute(orders_query)
    orders = orders_res.scalars().all()

    customer_deductions_count = 0
    customer_deductions_total = Decimal("0.00")
    owner_deductions_count = 0
    owner_deductions_total = Decimal("0.00")
    details = []

    for order in orders:
        if not order.tenant_id and order.user and order.user.tenant_id:
            order.tenant_id = order.user.tenant_id
            if not dry_run:
                db.add(order)

        panel = panels.get(order.tenant_id)
        if not panel:
            continue

        charge = Decimal(str(order.charge or Decimal("0.00")))
        wholesale = Decimal(str(order.wholesale_cost or order.provider_cost or Decimal("0.00")))
        
        # If order is canceled/refunded, do not retroactively deduct
        if order.status in [OrderStatus.CANCELED, OrderStatus.FAILED]:
            continue

        # ----------------------------------------------------------------------
        # A. Customer Balance Check & Deduction
        # ----------------------------------------------------------------------
        if order.user_id and charge > Decimal("0.00"):
            # Check if an ORDER_PAYMENT transaction already exists for customer on this order
            cust_tx_q = await db.execute(
                select(Transaction).where(
                    Transaction.order_id == order.id,
                    Transaction.user_id == order.user_id,
                    Transaction.type == TransactionType.ORDER_PAYMENT
                )
            )
            cust_has_tx = cust_tx_q.scalars().first() is not None

            if not cust_has_tx:
                cust_res = await db.execute(
                    select(User).where(User.id == order.user_id).with_for_update()
                )
                customer = cust_res.scalars().first()
                if customer:
                    bal_before = customer.balance
                    bal_after = bal_before - charge
                    if not dry_run:
                        customer.balance = bal_after
                        db.add(customer)

                        tx = Transaction(
                            user_id=customer.id,
                            order_id=order.id,
                            tenant_id=order.tenant_id,
                            type=TransactionType.ORDER_PAYMENT,
                            amount=-charge,
                            balance_before=bal_before,
                            balance_after=bal_after,
                            currency="KES",
                            payment_method=PaymentMethod.INTERNAL,
                            payment_reference=f"RECON-CUST-{order.order_number or str(order.id)[:8]}",
                            status=TransactionStatus.COMPLETED,
                            description=f"Reconciled order payment for Order #{order.order_number or str(order.id)[:8]} ({order.service.name if order.service else 'Service'})"
                        )
                        db.add(tx)

                    customer_deductions_count += 1
                    customer_deductions_total += charge
                    details.append(
                        f"Customer @{customer.username}: deducted KES {charge:,.2f} for Order #{order.order_number or str(order.id)[:8]} (Balance: {bal_before} -> {bal_after})"
                    )

        # ----------------------------------------------------------------------
        # B. Panel Owner Wholesale Balance Check & Deduction
        # ----------------------------------------------------------------------
        # If order was placed by an end-customer (not the panel owner themselves)
        if panel.user_id and panel.user_id != order.user_id and wholesale > Decimal("0.00"):
            owner_tx_q = await db.execute(
                select(Transaction).where(
                    Transaction.order_id == order.id,
                    Transaction.user_id == panel.user_id,
                    Transaction.type == TransactionType.ORDER_PAYMENT
                )
            )
            owner_has_tx = owner_tx_q.scalars().first() is not None

            if not owner_has_tx:
                owner_res = await db.execute(
                    select(User).where(User.id == panel.user_id).with_for_update()
                )
                panel_owner = owner_res.scalars().first()
                if panel_owner:
                    owner_bal_before = panel_owner.balance
                    owner_bal_after = owner_bal_before - wholesale
                    if not dry_run:
                        panel_owner.balance = owner_bal_after
                        db.add(panel_owner)

                        owner_tx = Transaction(
                            user_id=panel_owner.id,
                            order_id=order.id,
                            tenant_id=panel.id,
                            type=TransactionType.ORDER_PAYMENT,
                            amount=-wholesale,
                            balance_before=owner_bal_before,
                            balance_after=owner_bal_after,
                            currency="KES",
                            payment_method=PaymentMethod.INTERNAL,
                            payment_reference=f"RECON-WHOLESALE-{order.order_number or str(order.id)[:8]}",
                            status=TransactionStatus.COMPLETED,
                            description=f"Reconciled wholesale fulfillment for Order #{order.order_number or str(order.id)[:8]} on {panel.domain}"
                        )
                        db.add(owner_tx)

                    owner_deductions_count += 1
                    owner_deductions_total += wholesale
                    details.append(
                        f"Panel Owner @{panel_owner.username} ({panel.domain}): deducted wholesale KES {wholesale:,.2f} for Order #{order.order_number or str(order.id)[:8]} (Balance: {owner_bal_before} -> {owner_bal_after})"
                    )

    # ----------------------------------------------------------------------
    # C. Synchronize Child Panel Admin Balance(s) with Panel Owner Balance
    # ----------------------------------------------------------------------
    if not dry_run:
        for p in panels.values():
            if p.user_id:
                owner_res = await db.execute(select(User).where(User.id == p.user_id))
                p_owner = owner_res.scalars().first()
                if p_owner:
                    admin_res = await db.execute(
                        select(User).where(
                            User.tenant_id == p.id,
                            User.role == UserRole.ADMIN,
                        ).with_for_update()
                    )
                    for admin_u in admin_res.scalars().all():
                        admin_u.balance = p_owner.balance
                        db.add(admin_u)

        await db.commit()

    return {
        "success": True,
        "message": f"Reconciliation complete. Processed {len(orders)} orders.",
        "orders_processed": len(orders),
        "customer_deductions_count": customer_deductions_count,
        "customer_deductions_total": str(customer_deductions_total),
        "owner_deductions_count": owner_deductions_count,
        "owner_deductions_total": str(owner_deductions_total),
        "details": details
    }
