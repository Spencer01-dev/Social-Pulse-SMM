import hashlib
import hmac
import json
import random
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, Optional
import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.payments.exchange_rate import exchange_rate_service


@dataclass
class BinanceOrderResponse:
    prepay_id: str
    checkout_url: str
    qr_content: str
    amount_usdt: Decimal
    amount_kes: Decimal
    currency: str
    expire_time: int
    raw_response: Optional[Dict[str, Any]] = None


class BinancePayClient:
    """
    Binance Pay Merchant API Integration.
    API Specs:
    - Base URL: https://bpay.binanceapi.com
    - Endpoint: /binancepay/openapi/v2/order
    - Auth: BinancePay-Timestamp, BinancePay-Nonce, BinancePay-Certificate-SN, BinancePay-Signature (HMAC-SHA512)
    """

    def __init__(self):
        self.base_url = getattr(settings, "BINANCE_BASE_URL", "https://bpay.binanceapi.com")
        self.api_key = getattr(settings, "BINANCE_PAY_API_KEY", "") or getattr(settings, "BINANCE_API_KEY", "")
        self.secret_key = getattr(settings, "BINANCE_PAY_SECRET_KEY", "") or getattr(settings, "BINANCE_SECRET_KEY", "")

    def _is_mock_mode(self) -> bool:
        return (
            settings.USE_MOCK_PROVIDERS
            or not self.api_key
            or "YOUR_BINANCE" in self.api_key
        )

    def _generate_signature(self, timestamp: str, nonce: str, payload_str: str) -> str:
        data_to_sign = f"{timestamp}\n{nonce}\n{payload_str}\n"
        return hmac.new(
            self.secret_key.encode("utf-8"),
            data_to_sign.encode("utf-8"),
            hashlib.sha512
        ).hexdigest().upper()

    async def create_order(
        self,
        merchant_trade_no: str,
        amount_kes: Decimal,
        user_id: str,
        product_name: str = "SocialPulse Wallet Top Up"
    ) -> BinanceOrderResponse:
        """
        Create a Binance Pay Merchant order.
        """
        amount_usdt = exchange_rate_service.kes_to_usdt(amount_kes)
        expire_time = int(time.time() * 1000) + (3600 * 1000)  # 1 hour

        # Sandbox / Mock Simulation Mode
        if self._is_mock_mode():
            prepay_id = f"BINANCE_PREPAY_{random.randint(10000000, 99999999)}"
            checkout_url = f"https://pay.binance.com/checkout?order={prepay_id}"
            qr_content = f"https://app.binance.com/qr/dplk{prepay_id}"
            return BinanceOrderResponse(
                prepay_id=prepay_id,
                checkout_url=checkout_url,
                qr_content=qr_content,
                amount_usdt=amount_usdt,
                amount_kes=amount_kes,
                currency="USDT",
                expire_time=expire_time,
                raw_response={"mock": True, "prepay_id": prepay_id}
            )

        # Live Binance Pay Request
        payload = {
            "env": {"terminalType": "WEB"},
            "merchantTradeNo": merchant_trade_no,
            "orderAmount": float(amount_usdt),
            "currency": "USDT",
            "goods": {
                "goodsType": "02",
                "goodsCategory": "6000",
                "referenceGoodsId": user_id,
                "goodsName": product_name,
                "goodsDetail": f"Wallet top-up for user {user_id}"
            }
        }

        payload_str = json.dumps(payload)
        timestamp = str(int(time.time() * 1000))
        nonce = "".join(random.choices("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=32))
        signature = self._generate_signature(timestamp, nonce, payload_str)

        headers = {
            "Content-Type": "application/json",
            "BinancePay-Timestamp": timestamp,
            "BinancePay-Nonce": nonce,
            "BinancePay-Certificate-SN": self.api_key,
            "BinancePay-Signature": signature,
        }

        url = f"{self.base_url}/binancepay/openapi/v2/order"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(url, data=payload_str, headers=headers)
                response.raise_for_status()
                data = response.json()

                if data.get("status") != "SUCCESS":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=data.get("errorMessage", "Failed to create Binance Pay order")
                    )

                resp_data = data.get("data", {})
                return BinanceOrderResponse(
                    prepay_id=resp_data.get("prepayId"),
                    checkout_url=resp_data.get("checkoutUrl"),
                    qr_content=resp_data.get("qrContent"),
                    amount_usdt=amount_usdt,
                    amount_kes=amount_kes,
                    currency="USDT",
                    expire_time=resp_data.get("expireTime", expire_time),
                    raw_response=data
                )
            except httpx.HTTPError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Binance Pay connection error: {str(exc)}"
                )


binance_pay_client = BinancePayClient()
