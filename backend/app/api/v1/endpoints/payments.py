import uuid
from decimal import Decimal
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import desc, select
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
from app.payments.exchange_rate import exchange_rate_service
from app.payments.mpesa import mpesa_client, normalize_phone_number
from app.payments.palpluss import palpluss_client, normalize_kenyan_phone
from app.payments.paystack import paystack_provider
from app.schemas.payment import (
    CurrenciesResponse,
    MpesaSTKPushRequest,
    MpesaSTKPushResponse,
    MpesaSTKStatusResponse,
    PalPlussBalanceResponse,
    PalPlussSTKRequest,
    PalPlussSTKResponse,
    PaymentVerifyResponse,
    PaystackInitRequest,
    PaystackInitResponse,
)

router = APIRouter(prefix="/payments", tags=["Payments & Mobile Money"])


@router.get("/currencies", response_model=CurrenciesResponse)
async def get_supported_currencies() -> Any:
    """
    Get all supported currencies with live exchange rates relative to KES.
    """
    return {
        "base_currency": "KES",
        "currencies": exchange_rate_service.get_supported_currencies()
    }


# =========================================================================
# SAFARICOM M-PESA DARAJA STK PUSH ENGINE
# =========================================================================

@router.post("/mpesa/stk-push", response_model=MpesaSTKPushResponse)
async def initiate_mpesa_stk_push(
    req: MpesaSTKPushRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Initiate Lipa Na M-Pesa STK Push to the user's mobile device.
    Creates a pending transaction ledger entry and returns CheckoutRequestID.
    """
    if req.amount < 50:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Minimum deposit amount is KES 50.00.")

    try:
        formatted_phone = normalize_phone_number(req.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Trigger STK Push via Daraja
    try:
        stk_resp = await mpesa_client.initiate_deposit(
            phone_or_wallet=formatted_phone,
            amount=req.amount,
            account_reference=f"SP-{current_user.username[:8]}",
            transaction_desc=f"Deposit {req.amount} KES"
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to initiate M-Pesa STK Push: {str(exc)}"
        )

    # Record Pending Transaction in ledger
    transaction = Transaction(
        user_id=current_user.id,
        type=TransactionType.DEPOSIT,
        amount=req.amount,
        balance_before=current_user.balance,
        balance_after=current_user.balance,  # Will update upon confirmation
        currency="KES",
        payment_method=PaymentMethod.MPESA,
        payment_reference=stk_resp.checkout_request_id,
        status=TransactionStatus.PENDING,
        description=f"Lipa Na M-Pesa deposit ({formatted_phone})",
        metadata_json={
            "phone_number": formatted_phone,
            "merchant_request_id": stk_resp.merchant_request_id,
            "checkout_request_id": stk_resp.checkout_request_id,
        }
    )

    db.add(transaction)
    await db.commit()

    return MpesaSTKPushResponse(
        checkout_request_id=stk_resp.checkout_request_id,
        merchant_request_id=stk_resp.merchant_request_id,
        customer_message=stk_resp.customer_message,
        status="pending"
    )


@router.post("/mpesa/callback")
async def mpesa_daraja_callback(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Public Webhook endpoint for Safaricom Daraja Lipa Na M-Pesa STK Push callbacks.
    Guarantees atomic credit and prevents duplicate transactions.
    """
    try:
        data = await request.json()
    except Exception:
        return {"ResultCode": 1, "ResultDesc": "Invalid JSON"}

    body = data.get("Body", {})
    stk_callback = body.get("stkCallback", {})
    checkout_request_id = stk_callback.get("CheckoutRequestID")
    result_code = stk_callback.get("ResultCode")
    result_desc = stk_callback.get("ResultDesc", "No description")

    if not checkout_request_id:
        return {"ResultCode": 1, "ResultDesc": "Missing CheckoutRequestID"}

    # Find matching transaction
    query = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.user))
        .where(Transaction.payment_reference == checkout_request_id)
        .with_for_update()
    )
    transaction = query.scalars().first()

    if not transaction:
        return {"ResultCode": 0, "ResultDesc": "Transaction not found locally, acknowledged."}

    # If already completed or failed, ignore duplicate callback
    if transaction.status != TransactionStatus.PENDING:
        return {"ResultCode": 0, "ResultDesc": "Transaction already processed."}

    user = transaction.user
    if not user:
        return {"ResultCode": 1, "ResultDesc": "User associated with transaction missing."}

    if result_code == 0:
        # Success: extract metadata
        metadata_items = stk_callback.get("CallbackMetadata", {}).get("Item", [])
        extracted = {}
        for item in metadata_items:
            extracted[item.get("Name")] = item.get("Value")

        receipt_number = str(extracted.get("MpesaReceiptNumber", checkout_request_id))
        paid_amount = Decimal(str(extracted.get("Amount", transaction.amount)))

        # Update User Balance atomically
        balance_before = user.balance
        user.balance += paid_amount
        balance_after = user.balance

        # Finalize Transaction Record
        transaction.balance_before = balance_before
        transaction.balance_after = balance_after
        transaction.amount = paid_amount
        transaction.payment_reference = receipt_number
        transaction.status = TransactionStatus.COMPLETED
        transaction.description = f"Lipa Na M-Pesa Deposit (Receipt: {receipt_number})"
        transaction.metadata_json = {
            **(transaction.metadata_json or {}),
            "mpesa_receipt": receipt_number,
            "callback_payload": stk_callback
        }

        db.add(user)
        db.add(transaction)
        await db.commit()
    else:
        # Failed or Canceled by user
        transaction.status = TransactionStatus.FAILED
        transaction.description = f"M-Pesa Failed: {result_desc}"
        transaction.metadata_json = {
            **(transaction.metadata_json or {}),
            "result_code": result_code,
            "result_desc": result_desc
        }
        db.add(transaction)
        await db.commit()

    return {"ResultCode": 0, "ResultDesc": "Callback processed successfully"}


@router.get("/mpesa/status/{checkout_request_id}", response_model=MpesaSTKStatusResponse)
async def query_mpesa_stk_status(
    checkout_request_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Query the status of an ongoing STK Push deposit.
    Enables instant frontend polling and fallback validation.
    """
    query = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.user))
        .where(
            (Transaction.payment_reference == checkout_request_id) |
            (Transaction.metadata_json["checkout_request_id"].as_string() == checkout_request_id),
            Transaction.user_id == current_user.id
        )
    )
    transaction = query.scalars().first()

    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment request not found.")

    # If still pending, query Daraja / Mock directly
    if transaction.status == TransactionStatus.PENDING:
        try:
            status_data = await mpesa_client.verify_payment(checkout_request_id)
            if status_data.result_code == "0":
                # Confirmed! Credit user
                balance_before = current_user.balance
                current_user.balance += transaction.amount
                balance_after = current_user.balance

                receipt = status_data.mpesa_receipt or f"QHJ{checkout_request_id[:8]}"
                transaction.balance_before = balance_before
                transaction.balance_after = balance_after
                transaction.payment_reference = receipt
                transaction.status = TransactionStatus.COMPLETED
                transaction.description = f"Lipa Na M-Pesa Deposit (Receipt: {receipt})"

                db.add(current_user)
                db.add(transaction)
                await db.commit()
                await db.refresh(current_user)
                await db.refresh(transaction)
        except Exception:
            pass

    return MpesaSTKStatusResponse(
        checkout_request_id=checkout_request_id,
        status=transaction.status,
        mpesa_receipt=transaction.payment_reference if transaction.status == TransactionStatus.COMPLETED else None,
        amount=transaction.amount,
        new_balance=current_user.balance
    )


# =========================================================================
# PAYSTACK PAYMENT ENGINE
# =========================================================================

@router.post("/paystack/initialize", response_model=PaystackInitResponse)
async def initialize_paystack_checkout(
    req: PaystackInitRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Initialize a Paystack 1-click checkout session.
    Supports NGN, GHS, KES, USD, ZAR.
    """
    curr = req.currency.upper()
    reference = f"PSTK-{uuid.uuid4().hex[:12].upper()}"
    callback_url = req.callback_url or f"{request.base_url}wallet/deposit"

    kes_equivalent = exchange_rate_service.convert_to_kes(req.amount, curr)

    try:
        pstk_resp = await paystack_provider.initialize_payment(
            user_email=current_user.email,
            amount=req.amount,
            currency=curr,
            callback_url=callback_url,
            custom_ref=reference
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Paystack initialization failed: {str(exc)}"
        )

    # Record Pending Transaction
    transaction = Transaction(
        user_id=current_user.id,
        type=TransactionType.DEPOSIT,
        amount=kes_equivalent,
        balance_before=current_user.balance,
        balance_after=current_user.balance,
        currency="KES",
        payment_method=PaymentMethod.PAYSTACK,
        payment_reference=reference,
        status=TransactionStatus.PENDING,
        description=f"Paystack Deposit ({curr} {req.amount})",
        metadata_json={
            "reference": reference,
            "currency_paid": curr,
            "amount_paid": float(req.amount),
            "kes_equivalent": float(kes_equivalent),
            "is_simulator": pstk_resp.get("is_simulator", False)
        }
    )

    db.add(transaction)
    await db.commit()

    pstk_data = pstk_resp.get("data", {})
    return PaystackInitResponse(
        status=True,
        message=pstk_resp.get("message", "Authorization URL created"),
        reference=reference,
        authorization_url=pstk_data.get("authorization_url", ""),
        access_code=pstk_data.get("access_code"),
        is_simulator=pstk_resp.get("is_simulator", False)
    )


@router.get("/paystack/verify/{reference}", response_model=PaymentVerifyResponse)
async def verify_paystack_payment(
    reference: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Verify a Paystack transaction reference and credit user wallet atomically.
    """
    query = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.user))
        .where(
            Transaction.payment_reference == reference,
            Transaction.payment_method == PaymentMethod.PAYSTACK,
            Transaction.user_id == current_user.id
        )
        .with_for_update()
    )
    transaction = query.scalars().first()

    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paystack transaction reference not found.")

    if transaction.status == TransactionStatus.COMPLETED:
        return PaymentVerifyResponse(
            success=True,
            status="completed",
            message="Transaction already completed.",
            tx_ref=reference,
            amount_paid=Decimal(str(transaction.metadata_json.get("amount_paid", 0))),
            currency_paid=transaction.metadata_json.get("currency_paid", "NGN"),
            credited_kes=transaction.amount,
            new_balance=current_user.balance
        )

    verify_res = await paystack_provider.verify_transaction(reference)
    if verify_res.get("is_verified") or (verify_res.get("status") and verify_res.get("data", {}).get("status") == "success"):
        meta = transaction.metadata_json or {}
        currency_paid = meta.get("currency_paid", "NGN")
        amount_paid = Decimal(str(meta.get("amount_paid", "0"))) or Decimal(str(verify_res.get("amount", 0)))
        credited_kes = exchange_rate_service.convert_to_kes(amount_paid, currency_paid)

        balance_before = current_user.balance
        current_user.balance += credited_kes
        balance_after = current_user.balance

        transaction.balance_before = balance_before
        transaction.balance_after = balance_after
        transaction.amount = credited_kes
        transaction.status = TransactionStatus.COMPLETED
        transaction.description = f"Paystack Verified Deposit ({currency_paid} {amount_paid})"
        transaction.metadata_json = {
            **meta,
            "provider_response": verify_res
        }

        db.add(current_user)
        db.add(transaction)
        await db.commit()
        await db.refresh(current_user)

        return PaymentVerifyResponse(
            success=True,
            status="completed",
            message="Paystack payment verified and wallet balance credited!",
            tx_ref=reference,
            amount_paid=amount_paid,
            currency_paid=currency_paid,
            credited_kes=credited_kes,
            new_balance=current_user.balance
        )

    return PaymentVerifyResponse(
        success=False,
        status="pending",
        message="Paystack payment verification pending or failed.",
        tx_ref=reference
    )


@router.post("/paystack/webhook")
async def paystack_webhook_callback(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Public Webhook endpoint for Paystack event callbacks (e.g. charge.success).
    """
    try:
        payload = await request.json()
    except Exception:
        return {"status": False, "message": "Invalid JSON"}

    event = payload.get("event")
    data = payload.get("data", {})
    reference = data.get("reference")

    if not reference or event != "charge.success":
        return {"status": True, "message": "Ignored non-charge event"}

    query = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.user))
        .where(
            Transaction.payment_reference == reference,
            Transaction.payment_method == PaymentMethod.PAYSTACK
        )
        .with_for_update()
    )
    transaction = query.scalars().first()

    if not transaction or transaction.status != TransactionStatus.PENDING:
        return {"status": True, "message": "Transaction already finalized or not found"}

    user = transaction.user
    meta = transaction.metadata_json or {}
    currency_paid = data.get("currency", meta.get("currency_paid", "NGN")).upper()
    amount_subunits = Decimal(str(data.get("amount", 0)))
    amount_paid = (amount_subunits / Decimal("100")) if amount_subunits > 0 else Decimal(str(meta.get("amount_paid", "0")))
    credited_kes = exchange_rate_service.convert_to_kes(amount_paid, currency_paid)

    balance_before = user.balance
    user.balance += credited_kes
    balance_after = user.balance

    transaction.balance_before = balance_before
    transaction.balance_after = balance_after
    transaction.amount = credited_kes
    transaction.status = TransactionStatus.COMPLETED
    transaction.description = f"Paystack Webhook Deposit ({currency_paid} {amount_paid})"
    transaction.metadata_json = {
        **meta,
        "webhook_payload": data
    }

    db.add(user)
    db.add(transaction)
    await db.commit()

    return {"status": True, "message": "Webhook processed successfully"}


# =========================================================================
# PALPLUSS M-PESA PAYMENT ENGINE (STK PUSH & REAL-TIME WEBHOOKS)
# =========================================================================

@router.post("/palpluss/stk-push", response_model=PalPlussSTKResponse)
async def initiate_palpluss_stk_push(
    req: PalPlussSTKRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Trigger Lipa Na M-Pesa STK Push using PalPluss payment infrastructure.
    Sends prompt to customer's mobile phone and registers a pending transaction ledger.
    """
    if req.amount < 50:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Minimum deposit amount is KES 50.00.")

    try:
        norm_phone = normalize_kenyan_phone(req.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    account_ref = f"SP-{current_user.username[:8]}"
    desc = f"Topup {int(req.amount)}"

    try:
        stk_data = await palpluss_client.initiate_stk_push(
            phone=norm_phone,
            amount=req.amount,
            account_reference=account_ref,
            transaction_desc=desc,
            channel_id=req.channel_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"PalPluss STK Push failed: {str(exc)}"
        )

    tx_id = stk_data.get("transactionId") or str(uuid.uuid4())
    provider_checkout = stk_data.get("providerCheckoutId")

    # Record Pending Transaction in double-entry ledger
    transaction = Transaction(
        user_id=current_user.id,
        type=TransactionType.DEPOSIT,
        amount=req.amount,
        balance_before=current_user.balance,
        balance_after=current_user.balance,
        currency="KES",
        payment_method=PaymentMethod.MPESA,
        payment_reference=tx_id,
        status=TransactionStatus.PENDING,
        description=f"PalPluss M-Pesa deposit ({norm_phone})",
        metadata_json={
            "gateway": "palpluss",
            "phone_number": norm_phone,
            "palpluss_transaction_id": tx_id,
            "provider_request_id": stk_data.get("providerRequestId"),
            "provider_checkout_id": provider_checkout,
            "transaction_fee": stk_data.get("transactionFee", 0),
        }
    )

    db.add(transaction)
    await db.commit()

    return PalPlussSTKResponse(
        transaction_id=tx_id,
        status=stk_data.get("status", "PENDING"),
        amount=Decimal(str(stk_data.get("amount", req.amount))),
        phone=norm_phone,
        account_reference=account_ref,
        provider_checkout_id=provider_checkout,
        message="STK Push prompt sent to phone. Enter your M-Pesa PIN to complete payment."
    )


@router.get("/palpluss/status/{transaction_id}", response_model=MpesaSTKStatusResponse)
async def get_palpluss_transaction_status(
    transaction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Poll the current status of a PalPluss M-Pesa deposit transaction.
    """
    query = await db.execute(
        select(Transaction)
        .where(
            Transaction.user_id == current_user.id,
            Transaction.payment_reference == transaction_id
        )
    )
    tx = query.scalars().first()
    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )

    # If still pending, optionally query PalPluss directly
    if tx.status == TransactionStatus.PENDING:
        try:
            live_data = await palpluss_client.get_transaction(transaction_id)
            live_status = live_data.get("status", "").upper()
            if live_status == "SUCCESS":
                user_q = await db.execute(
                    select(User).where(User.id == current_user.id).with_for_update()
                )
                user = user_q.scalars().first()
                if user and tx.status == TransactionStatus.PENDING:
                    user.balance += tx.amount
                    tx.status = TransactionStatus.COMPLETED
                    tx.balance_after = user.balance
                    if live_data.get("mpesa_receipt"):
                        tx.payment_reference = live_data["mpesa_receipt"]
                    meta = tx.metadata_json or {}
                    tx.metadata_json = {**meta, "poll_sync": live_data}
                    db.add(user)
                    db.add(tx)
                    await db.commit()
                    await db.refresh(user)
                    await db.refresh(tx)
            elif live_status in ("FAILED", "CANCELLED", "EXPIRED"):
                tx.status = TransactionStatus.FAILED
                db.add(tx)
                await db.commit()
                await db.refresh(tx)
        except Exception:
            pass  # Fall back to database status

    meta = tx.metadata_json or {}
    return MpesaSTKStatusResponse(
        checkout_request_id=transaction_id,
        status=tx.status,
        result_code="0" if tx.status == TransactionStatus.COMPLETED else ("1" if tx.status == TransactionStatus.FAILED else None),
        result_desc="Payment completed successfully" if tx.status == TransactionStatus.COMPLETED else None,
        mpesa_receipt=meta.get("mpesa_receipt") or (tx.payment_reference if tx.status == TransactionStatus.COMPLETED else None),
        amount=tx.amount,
        new_balance=current_user.balance if tx.status == TransactionStatus.COMPLETED else None
    )


@router.post("/palpluss/webhook")
async def palpluss_webhook_callback(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Public Webhook listener for PalPluss transaction settlement events.
    Handles 'transaction.success', 'transaction.failed', 'transaction.cancelled', 'transaction.expired'.
    Automatically credits customer balance on confirmed payments.
    """
    try:
        body_json = await request.json()
    except Exception:
        return {"received": True, "error": "Invalid JSON"}

    event_type = body_json.get("event_type")
    tx_payload = body_json.get("transaction", {})
    palpluss_tx_id = tx_payload.get("id")

    if not palpluss_tx_id:
        return {"received": True, "error": "Missing transaction id"}

    # Find the matching transaction by PalPluss ID or external reference
    query = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.user))
        .where(
            (Transaction.payment_reference == palpluss_tx_id) |
            (Transaction.metadata_json["palpluss_transaction_id"].astext == palpluss_tx_id)
        )
        .with_for_update()
    )
    transaction = query.scalars().first()

    if not transaction or transaction.status != TransactionStatus.PENDING:
        # Idempotent response per PalPluss webhook requirements
        return {"received": True, "message": "Transaction already finalized or not found"}

    user = transaction.user
    meta = transaction.metadata_json or {}
    mpesa_receipt = tx_payload.get("mpesa_receipt")

    if event_type == "transaction.success":
        amount_kes = Decimal(str(tx_payload.get("amount", transaction.amount)))
        balance_before = user.balance
        user.balance += amount_kes
        balance_after = user.balance

        transaction.balance_before = balance_before
        transaction.balance_after = balance_after
        transaction.amount = amount_kes
        transaction.status = TransactionStatus.COMPLETED
        if mpesa_receipt:
            transaction.payment_reference = mpesa_receipt
        transaction.description = f"PalPluss M-Pesa Deposit ({mpesa_receipt or palpluss_tx_id})"
        transaction.metadata_json = {
            **meta,
            "mpesa_receipt": mpesa_receipt,
            "webhook_event": body_json
        }
        db.add(user)
        db.add(transaction)
        await db.commit()
        return {"received": True, "status": "credited", "amount": float(amount_kes)}

    elif event_type in ("transaction.failed", "transaction.cancelled", "transaction.expired"):
        transaction.status = TransactionStatus.FAILED
        transaction.metadata_json = {
            **meta,
            "failed_reason": tx_payload.get("result_desc"),
            "webhook_event": body_json
        }
        db.add(transaction)
        await db.commit()
        return {"received": True, "status": "failed"}

    return {"received": True}


@router.get("/palpluss/balance", response_model=PalPlussBalanceResponse)
async def get_palpluss_service_balance(
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Retrieves the merchant's PalPluss service wallet token balance.
    Only accessible by superusers / administrators.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    bal = await palpluss_client.get_service_balance()
    return PalPlussBalanceResponse(
        currency=bal.get("currency", "KES"),
        available_balance=float(bal.get("availableBalance", 0)),
        ledger_balance=float(bal.get("ledgerBalance", 0)),
        error=bal.get("error")
    )

