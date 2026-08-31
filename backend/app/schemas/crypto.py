from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


class CryptoDepositRequest(BaseModel):
    network: str = Field(default="TRC20", description="TRC20, TON, or POLYGON")
    amount_kes: Optional[Decimal] = Field(None, gt=0, description="Amount in KES to deposit")
    amount_usdt: Optional[Decimal] = Field(None, gt=0, description="Amount in USDT to deposit")


class CryptoDepositResponse(BaseModel):
    deposit_id: str
    network: str
    currency: str
    deposit_address: str
    memo_or_tag: Optional[str] = None
    amount_usdt: Decimal
    amount_kes: Decimal
    exchange_rate: Decimal
    qr_code_uri: str
    expires_at_timestamp: int


class CryptoVerifyRequest(BaseModel):
    deposit_id: str
    tx_hash: str
    network: str = "TRC20"
    amount_usdt: Decimal


class CryptoVerifyResponse(BaseModel):
    is_valid: bool
    tx_hash: str
    amount_kes: Decimal
    new_balance: Decimal
    message: str


class BinancePayOrderRequest(BaseModel):
    amount_kes: Decimal = Field(..., gt=0, le=500000, description="Amount in KES to deposit via Binance Pay")


class BinancePayOrderResponse(BaseModel):
    prepay_id: str
    checkout_url: str
    qr_content: str
    amount_usdt: Decimal
    amount_kes: Decimal
    currency: str
    expire_time: int
