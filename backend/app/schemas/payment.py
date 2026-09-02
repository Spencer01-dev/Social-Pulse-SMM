import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.models.transaction import PaymentMethod, TransactionStatus, TransactionType


class MpesaSTKPushRequest(BaseModel):
    phone_number: str = Field(..., min_length=9, max_length=15, description="Kenyan mobile number (e.g. 0712345678)")
    amount: Decimal = Field(..., gt=0, le=300000, description="Amount in KES to deposit")


class MpesaSTKPushResponse(BaseModel):
    checkout_request_id: str
    merchant_request_id: str
    customer_message: str
    status: str


class MpesaSTKStatusResponse(BaseModel):
    checkout_request_id: str
    status: TransactionStatus
    result_code: Optional[str] = None
    result_desc: Optional[str] = None
    mpesa_receipt: Optional[str] = None
    amount: Optional[Decimal] = None
    new_balance: Optional[Decimal] = None


class TransactionResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    order_id: Optional[uuid.UUID] = None
    type: TransactionType
    amount: Decimal
    balance_before: Decimal
    balance_after: Decimal
    currency: str
    payment_method: PaymentMethod
    payment_reference: Optional[str] = None
    status: TransactionStatus
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PaystackInitRequest(BaseModel):
    amount: Decimal = Field(..., gt=0, description="Amount in specified currency")
    currency: str = Field(default="NGN", description="Currency code (NGN, GHS, KES, USD, ZAR)")
    callback_url: Optional[str] = Field(default=None, description="Client redirect return URL")


class PaystackInitResponse(BaseModel):
    status: bool
    message: str
    reference: str
    authorization_url: str
    access_code: Optional[str] = None
    is_simulator: bool = False


class PaymentVerifyResponse(BaseModel):
    success: bool
    status: str
    message: str
    tx_ref: Optional[str] = None
    amount_paid: Optional[Decimal] = None
    currency_paid: Optional[str] = None
    credited_kes: Optional[Decimal] = None
    new_balance: Optional[Decimal] = None


class CurrencyMeta(BaseModel):
    code: str
    name: str
    symbol: str
    flag: str
    country: str
    decimals: int
    rate_per_kes: float
    kes_per_unit: float


class CurrenciesResponse(BaseModel):
    base_currency: str = "KES"
    currencies: Dict[str, CurrencyMeta]


class AdminBalanceAdjustRequest(BaseModel):
    user_id: uuid.UUID
    amount: Decimal = Field(..., description="Positive to credit, negative to debit")
    reason: str = Field(..., min_length=3, max_length=255)
