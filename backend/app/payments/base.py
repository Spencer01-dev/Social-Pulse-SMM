from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, Optional


@dataclass
class STKPushResponse:
    checkout_request_id: str
    merchant_request_id: str
    response_code: str
    response_description: str
    customer_message: str
    raw_response: Optional[Dict[str, Any]] = None


@dataclass
class STKQueryResponse:
    checkout_request_id: str
    result_code: str
    result_desc: str
    mpesa_receipt: Optional[str] = None
    amount: Optional[Decimal] = None
    phone_number: Optional[str] = None
    transaction_date: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None


class PaymentGatewayInterface(ABC):
    """Abstract interface for payment gateways (M-Pesa, OKX, Binance)."""

    @abstractmethod
    async def initiate_deposit(self, phone_or_wallet: str, amount: Decimal, **kwargs: Any) -> Any:
        pass

    @abstractmethod
    async def verify_payment(self, reference_id: str) -> Any:
        pass
