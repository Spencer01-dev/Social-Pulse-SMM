import uuid
from decimal import Decimal
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user
from app.api.v1.endpoints.tenant import MAIN_PLATFORM_DOMAINS
from app.core.config import settings
from app.core.database import get_db
from app.models.child_panel import ChildPanel
from app.models.transaction import (
    PaymentMethod,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from app.models.user import User
from app.payments.exchange_rate import exchange_rate_service
from app.payments.mpesa import mpesa_client, normalize_phone_number
from app.payments.payhero import PayHeroClient, payhero_client
from app.payments.paystack import paystack_provider
from app.schemas.payment import (
    CurrenciesResponse,
    MpesaSTKPushRequest,
    MpesaSTKPushResponse,
    MpesaSTKStatusResponse,
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


async def resolve_tenant_panel(
    request: Request,
    x_tenant_domain: Optional[str],
    current_user: User,
    db: AsyncSession
) -> Optional[ChildPanel]:
    """Helper to detect if request originated from a Child Panel domain."""
    raw_domain = x_tenant_domain or request.headers.get("x-tenant-domain") or request.headers.get("X-Tenant-Domain")
    if raw_domain:
        clean = raw_domain.strip().lower().replace("https://", "").replace("http://", "").rstrip("/")
        if not any(clean == d or clean.endswith(f".{d}") for d in MAIN_PLATFORM_DOMAINS):
            q = await db.execute(select(ChildPanel).where(ChildPanel.domain == clean))
            panel = q.scalars().first()
            if panel:
                return panel

    if current_user.tenant_id:
        q = await db.execute(select(ChildPanel).where(ChildPanel.id == current_user.tenant_id))
        return q.scalars().first()

    return None


# =========================================================================
# SAFARICOM M-PESA & PAYHERO TILL STK PUSH ENGINE
# =========================================================================

@router.post("/mpesa/stk-push", response_model=MpesaSTKPushResponse)
async def initiate_mpesa_stk_push(
    req: MpesaSTKPushRequest,
    request: Request,
    x_tenant_domain: Optional[str] = Header(None, alias="X-Tenant-Domain"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Initiate Lipa Na M-Pesa STK Push to the user's mobile device.
    If the request is from a Child Panel with a configured PayHero Till/Paybill,
    it automatically routes the customer payment directly into the Child Panel's Till!
    """
    if req.amount < 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Minimum deposit amount is KES 10.00.")

    try:
        formatted_phone = normalize_phone_number(req.phone_number)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect phone number. Please enter a valid M-Pesa number (e.g. 0712345678 or 254712345678)."
        )

    panel = await resolve_tenant_panel(request, x_tenant_domain, current_user, db)
    gw = (panel.metadata_json or {}).get("payment_gateway", {}) if panel else {}
    use_child_payhero = (
        panel is not None
        and gw.get("is_active", True)
        and gw.get("gateway_provider") == "payhero"
        and bool(gw.get("payhero_channel_id"))
    )
    use_platform_payhero = (
        not use_child_payhero
        and bool(settings.PAYHERO_API_KEY)
        and bool(settings.PAYHERO_CHANNEL_ID)
    )

    if use_child_payhero or use_platform_payhero:
        if use_child_payhero:
            channel_id = str(gw.get("payhero_channel_id"))
            api_key = gw.get("payhero_api_key")
            api_secret = gw.get("payhero_api_secret")
            account_name = gw.get("payhero_account_name") or (panel.domain if panel else "SocialPulse")
        else:
            channel_id = str(settings.PAYHERO_CHANNEL_ID)
            api_key = settings.PAYHERO_API_KEY
            api_secret = settings.PAYHERO_API_SECRET
            account_name = "PICNIC TECHNOLOGIES"

        ph_client = PayHeroClient(
            api_key=api_key,
            api_secret=api_secret,
            channel_id=channel_id,
        )
        external_ref = f"PH-{uuid.uuid4().hex[:12].upper()}"

        try:
            ph_resp = await ph_client.initiate_stk_push(
                phone=formatted_phone,
                amount=req.amount,
                external_reference=external_ref,
                account_name=account_name
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to initiate Till STK Push via PayHero: {str(exc)}"
            )

        checkout_id = ph_resp.get("checkout_request_id") or external_ref
        transaction = Transaction(
            user_id=current_user.id,
            tenant_id=panel.id if panel else None,
            type=TransactionType.DEPOSIT,
            amount=req.amount,
            balance_before=current_user.balance,
            balance_after=current_user.balance,
            currency="KES",
            payment_method=PaymentMethod.MPESA,
            payment_reference=external_ref,
            status=TransactionStatus.PENDING,
            description=f"Till Deposit ({account_name} Till {channel_id} - {formatted_phone})",
            metadata_json={
                "phone_number": formatted_phone,
                "channel_id": channel_id,
                "external_reference": external_ref,
                "checkout_request_id": checkout_id,
                "gateway": "payhero",
                "panel_id": str(panel.id) if panel else None,
            }
        )
        db.add(transaction)
        await db.commit()

        return MpesaSTKPushResponse(
            checkout_request_id=checkout_id,
            merchant_request_id=external_ref,
            customer_message=f"STK Push prompt sent to {formatted_phone}. Pay directly to {account_name}.",
            status="pending"
        )

    # Standard Platform M-Pesa Daraja STK Push
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
        tenant_id=panel.id if panel else None,
        type=TransactionType.DEPOSIT,
        amount=req.amount,
        balance_before=current_user.balance,
        balance_after=current_user.balance,
        currency="KES",
        payment_method=PaymentMethod.MPESA,
        payment_reference=stk_resp.checkout_request_id,
        status=TransactionStatus.PENDING,
        description=f"Lipa Na M-Pesa deposit ({formatted_phone})",
        metadata_json={
            "phone_number": formatted_phone,
            "merchant_request_id": stk_resp.merchant_request_id,
            "checkout_request_id": stk_resp.checkout_request_id,
            "gateway": "daraja",
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


# =========================================================================
# PAYHERO WEBHOOK CALLBACK (Till / Paybill Direct Payments)
# =========================================================================

@router.post("/payhero/callback")
async def payhero_webhook_callback(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Public Webhook endpoint for PayHero Kenya STK Push callbacks.
    Handles responses for direct Till and Paybill payments.
    """
    try:
        data = await request.json()
    except Exception:
        return {"status": "error", "message": "Invalid JSON"}

    response_data = data.get("response", data) if isinstance(data, dict) else {}
    status_str = str(response_data.get("Status", data.get("status", ""))).lower()
    external_ref = response_data.get("ExternalReference") or data.get("external_reference") or response_data.get("reference")
    receipt_no = response_data.get("MpesaReceiptNumber") or response_data.get("receipt") or external_ref

    if not external_ref:
        return {"status": "acknowledged", "message": "Missing reference"}

    query = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.user))
        .where(
            or_(
                Transaction.payment_reference == external_ref,
                Transaction.metadata_json["external_reference"].as_string() == external_ref,
                Transaction.metadata_json["checkout_request_id"].as_string() == external_ref,
            )
        )
        .with_for_update()
    )
    transaction = query.scalars().first()

    if not transaction:
        return {"status": "acknowledged", "message": "Transaction not found locally"}

    if transaction.status != TransactionStatus.PENDING:
        return {"status": "acknowledged", "message": "Already processed"}

    user = transaction.user
    if not user:
        return {"status": "error", "message": "User missing"}

    if status_str in ["success", "successful", "0", "queued"]:
        amount = Decimal(str(response_data.get("Amount", transaction.amount)))
        balance_before = user.balance
        user.balance += amount
        balance_after = user.balance

        transaction.balance_before = balance_before
        transaction.balance_after = balance_after
        transaction.amount = amount
        transaction.payment_reference = receipt_no
        transaction.status = TransactionStatus.COMPLETED
        transaction.description = f"PayHero Till Deposit (Receipt: {receipt_no})"
        transaction.metadata_json = {
            **(transaction.metadata_json or {}),
            "mpesa_receipt": receipt_no,
            "payhero_callback": data
        }

        db.add(user)
        db.add(transaction)
        await db.commit()
    else:
        transaction.status = TransactionStatus.FAILED
        transaction.description = f"PayHero M-Pesa Failed: {response_data.get('Description', 'Cancelled')}"
        db.add(transaction)
        await db.commit()

    return {"status": "success", "message": "PayHero callback processed"}


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

    # If still pending, query PayHero or Daraja directly
    if transaction.status == TransactionStatus.PENDING:
        gw_type = (transaction.metadata_json or {}).get("gateway", "daraja")
        if gw_type == "payhero":
            try:
                ext_ref = (transaction.metadata_json or {}).get("external_reference") or checkout_request_id
                client_to_use = payhero_client
                panel_id = (transaction.metadata_json or {}).get("panel_id")
                if panel_id:
                    try:
                        q_p = await db.execute(select(ChildPanel).where(ChildPanel.id == uuid.UUID(panel_id)))
                        cp = q_p.scalars().first()
                        if cp:
                            cp_gw = (cp.metadata_json or {}).get("payment_gateway", {})
                            if cp_gw.get("payhero_api_key"):
                                client_to_use = PayHeroClient(
                                    api_key=cp_gw.get("payhero_api_key"),
                                    api_secret=cp_gw.get("payhero_api_secret"),
                                    channel_id=str(cp_gw.get("payhero_channel_id")),
                                )
                    except Exception:
                        pass
                ph_status = await client_to_use.check_payment_status(ext_ref)
                if str(ph_status.get("status", "")).lower() in ["success", "successful"]:
                    balance_before = current_user.balance
                    current_user.balance += transaction.amount
                    balance_after = current_user.balance

                    receipt = ph_status.get("receipt") or ext_ref
                    transaction.balance_before = balance_before
                    transaction.balance_after = balance_after
                    transaction.payment_reference = receipt
                    transaction.status = TransactionStatus.COMPLETED
                    transaction.description = f"PayHero Till Deposit (Receipt: {receipt})"
                    transaction.metadata_json = {
                        **(transaction.metadata_json or {}),
                        "mpesa_receipt": receipt
                    }

                    db.add(current_user)
                    db.add(transaction)
                    await db.commit()
                    await db.refresh(current_user)
                    await db.refresh(transaction)
            except Exception:
                pass
        else:
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
