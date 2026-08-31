import uuid
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user
from app.core.database import get_db
from app.models.transaction import (
    PaymentMethod,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from app.models.user import User
from app.payments.exchange_rate import exchange_rate_service
from app.payments.okx import okx_client
from app.schemas.crypto import (
    CryptoDepositRequest,
    CryptoDepositResponse,
    CryptoVerifyRequest,
    CryptoVerifyResponse,
)

router = APIRouter(prefix="/payments/crypto", tags=["OKX Crypto & Web3 Payments"])


@router.post("/create-deposit", response_model=CryptoDepositResponse)
async def create_crypto_deposit_intent(
    req: CryptoDepositRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Generate OKX Web3 multi-chain deposit address & QR code payload.
    """
    deposit_info = await okx_client.create_deposit_intent(
        user_id=str(current_user.id),
        network=req.network,
        amount_kes=req.amount_kes,
        amount_usdt=req.amount_usdt
    )

    # Pre-record pending transaction in ledger
    transaction = Transaction(
        user_id=current_user.id,
        type=TransactionType.DEPOSIT,
        amount=deposit_info.amount_kes,
        balance_before=current_user.balance,
        balance_after=current_user.balance,
        currency="KES",
        payment_method=PaymentMethod.OKX,
        payment_reference=deposit_info.deposit_id,
        status=TransactionStatus.PENDING,
        description=f"OKX Web3 ({deposit_info.network}) USDT Deposit",
        metadata_json={
            "deposit_id": deposit_info.deposit_id,
            "network": deposit_info.network,
            "amount_usdt": float(deposit_info.amount_usdt),
            "exchange_rate": float(deposit_info.exchange_rate),
            "deposit_address": deposit_info.deposit_address,
            "memo_tag": deposit_info.memo_or_tag
        }
    )
    db.add(transaction)
    await db.commit()

    return CryptoDepositResponse(
        deposit_id=deposit_info.deposit_id,
        network=deposit_info.network,
        currency=deposit_info.currency,
        deposit_address=deposit_info.deposit_address,
        memo_or_tag=deposit_info.memo_or_tag,
        amount_usdt=deposit_info.amount_usdt,
        amount_kes=deposit_info.amount_kes,
        exchange_rate=deposit_info.exchange_rate,
        qr_code_uri=deposit_info.qr_code_uri,
        expires_at_timestamp=deposit_info.expires_at_timestamp
    )


@router.post("/verify", response_model=CryptoVerifyResponse)
async def verify_crypto_transaction(
    req: CryptoVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Verify on-chain deposit transaction hash and credit user wallet.
    """
    verification = await okx_client.verify_transaction_hash(
        tx_hash=req.tx_hash,
        expected_usdt=req.amount_usdt,
        network=req.network
    )

    if not verification.is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction hash could not be verified on the blockchain network."
        )

    # Check if transaction hash was already claimed
    hash_query = await db.execute(
        select(Transaction).where(
            Transaction.payment_reference == req.tx_hash,
            Transaction.status == TransactionStatus.COMPLETED
        )
    )
    if hash_query.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This transaction hash has already been credited."
        )

    # Locate pending deposit record or create new
    query = await db.execute(
        select(Transaction).where(
            Transaction.payment_reference == req.deposit_id,
            Transaction.user_id == current_user.id
        )
    )
    transaction = query.scalars().first()

    balance_before = current_user.balance
    current_user.balance += verification.amount_kes
    balance_after = current_user.balance

    if transaction:
        transaction.balance_before = balance_before
        transaction.balance_after = balance_after
        transaction.amount = verification.amount_kes
        transaction.payment_reference = req.tx_hash
        transaction.status = TransactionStatus.COMPLETED
        transaction.description = f"OKX ({req.network}) USDT Deposit (TX: {req.tx_hash[:12]}...)"
        db.add(transaction)
    else:
        new_tx = Transaction(
            user_id=current_user.id,
            type=TransactionType.DEPOSIT,
            amount=verification.amount_kes,
            balance_before=balance_before,
            balance_after=balance_after,
            currency="KES",
            payment_method=PaymentMethod.OKX,
            payment_reference=req.tx_hash,
            status=TransactionStatus.COMPLETED,
            description=f"OKX ({req.network}) USDT Deposit (TX: {req.tx_hash[:12]}...)",
            metadata_json={"amount_usdt": float(req.amount_usdt), "tx_hash": req.tx_hash}
        )
        db.add(new_tx)

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return CryptoVerifyResponse(
        is_valid=True,
        tx_hash=req.tx_hash,
        amount_kes=verification.amount_kes,
        new_balance=current_user.balance,
        message=f"Success! {req.amount_usdt} USDT (KES {verification.amount_kes:,.2f}) has been credited to your wallet."
    )
