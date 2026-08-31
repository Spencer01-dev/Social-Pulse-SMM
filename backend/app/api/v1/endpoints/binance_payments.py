import uuid
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user
from app.core.database import get_db
from app.models.transaction import (
    PaymentMethod,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from app.models.user import User
from app.payments.binance import binance_pay_client
from app.schemas.crypto import BinancePayOrderRequest, BinancePayOrderResponse

router = APIRouter(prefix="/payments/binance", tags=["Binance Pay"])


@router.post("/create-order", response_model=BinancePayOrderResponse)
async def create_binance_pay_order(
    req: BinancePayOrderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Create a Binance Pay order and return direct checkout link & QR Code.
    """
    trade_no = f"BPAY-{int(uuid.uuid4().int % 100000000)}"

    order_resp = await binance_pay_client.create_order(
        merchant_trade_no=trade_no,
        amount_kes=req.amount_kes,
        user_id=str(current_user.id),
        product_name=f"SocialPulse Wallet Top Up (KES {req.amount_kes:,.2f})"
    )

    # Record pending transaction in ledger
    transaction = Transaction(
        user_id=current_user.id,
        type=TransactionType.DEPOSIT,
        amount=req.amount_kes,
        balance_before=current_user.balance,
        balance_after=current_user.balance,
        currency="KES",
        payment_method=PaymentMethod.BINANCE,
        payment_reference=order_resp.prepay_id,
        status=TransactionStatus.PENDING,
        description="Binance Pay Instant Deposit",
        metadata_json={
            "merchant_trade_no": trade_no,
            "prepay_id": order_resp.prepay_id,
            "amount_usdt": float(order_resp.amount_usdt),
            "amount_kes": float(order_resp.amount_kes)
        }
    )
    db.add(transaction)
    await db.commit()

    return BinancePayOrderResponse(
        prepay_id=order_resp.prepay_id,
        checkout_url=order_resp.checkout_url,
        qr_content=order_resp.qr_content,
        amount_usdt=order_resp.amount_usdt,
        amount_kes=order_resp.amount_kes,
        currency=order_resp.currency,
        expire_time=order_resp.expire_time
    )


@router.post("/callback")
async def binance_pay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Public webhook receiver for Binance Pay transaction confirmations.
    """
    try:
        payload = await request.json()
    except Exception:
        return {"returnCode": "FAIL", "returnMessage": "Invalid payload"}

    biz_status = payload.get("bizStatus")
    data = payload.get("data", {})
    merchant_trade_no = data.get("merchantTradeNo")
    prepay_id = data.get("prepayId")

    if biz_status == "PAY_SUCCESS":
        # Find transaction
        query = await db.execute(
            select(Transaction)
            .options(selectinload(Transaction.user))
            .where(
                (Transaction.payment_reference == prepay_id) |
                (Transaction.metadata_json["merchant_trade_no"].as_string() == merchant_trade_no)
            )
            .with_for_update()
        )
        transaction = query.scalars().first()

        if transaction and transaction.status == TransactionStatus.PENDING:
            user = transaction.user
            if user:
                balance_before = user.balance
                user.balance += transaction.amount
                balance_after = user.balance

                transaction.balance_before = balance_before
                transaction.balance_after = balance_after
                transaction.status = TransactionStatus.COMPLETED
                transaction.description = f"Binance Pay Deposit (Trade: {merchant_trade_no})"

                db.add(user)
                db.add(transaction)
                await db.commit()

    return {"returnCode": "SUCCESS", "returnMessage": None}
