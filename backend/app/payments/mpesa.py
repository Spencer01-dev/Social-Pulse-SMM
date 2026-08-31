import base64
from datetime import datetime
from decimal import Decimal
import random
import re
import time
from typing import Any, Dict, Optional, Tuple
import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.payments.base import PaymentGatewayInterface, STKPushResponse, STKQueryResponse


def normalize_phone_number(phone: str) -> str:
    """
    Format Kenyan mobile numbers to international 254XXXXXXXXX standard.
    Accepts: 0712345678, 0112345678, +254712345678, 254712345678.
    """
    cleaned = re.sub(r"[^\d+]", "", phone.strip())
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]

    if cleaned.startswith("07") and len(cleaned) == 10:
        return "254" + cleaned[1:]
    elif cleaned.startswith("01") and len(cleaned) == 10:
        return "254" + cleaned[1:]
    elif cleaned.startswith("7") and len(cleaned) == 9:
        return "254" + cleaned
    elif cleaned.startswith("1") and len(cleaned) == 9:
        return "254" + cleaned
    elif cleaned.startswith("254") and len(cleaned) == 12:
        return cleaned

    raise ValueError(f"Invalid Kenyan phone number format: {phone}. Use 07XXXXXXXX or 01XXXXXXXX.")


class MpesaDarajaClient(PaymentGatewayInterface):
    """
    Safaricom Daraja 2.0 API Integration for Lipa Na M-Pesa Online (STK Push).
    """

    def __init__(self):
        self.env = settings.MPESA_ENVIRONMENT.lower()
        self.base_url = (
            "https://sandbox.safaricom.co.ke"
            if self.env == "sandbox"
            else "https://api.safaricom.co.ke"
        )
        self.consumer_key = settings.MPESA_CONSUMER_KEY
        self.consumer_secret = settings.MPESA_CONSUMER_SECRET
        self.shortcode = settings.MPESA_SHORTCODE
        self.passkey = settings.MPESA_PASSKEY
        self.callback_url = settings.MPESA_CALLBACK_URL
        self.timeout = httpx.Timeout(30.0, connect=10.0)

        # In-memory mock tracking for sandbox testing
        self._mock_requests: Dict[str, Dict[str, Any]] = {}

    def _is_mock_mode(self) -> bool:
        return (
            settings.USE_MOCK_PROVIDERS
            or not self.consumer_key
            or "YOUR_MPESA" in self.consumer_key
        )

    async def _get_access_token(self) -> str:
        """Fetch OAuth2 Bearer Token from Daraja."""
        auth_url = f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                auth_url,
                auth=httpx.BasicAuth(self.consumer_key, self.consumer_secret)
            )
            response.raise_for_status()
            data = response.json()
            return data.get("access_token")

    def _generate_password_and_timestamp(self) -> Tuple[str, str]:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        data_to_encode = f"{self.shortcode}{self.passkey}{timestamp}"
        encoded_password = base64.b64encode(data_to_encode.encode()).decode("utf-8")
        return encoded_password, timestamp

    async def initiate_deposit(
        self,
        phone_or_wallet: str,
        amount: Decimal,
        account_reference: str = "SocialPulse",
        transaction_desc: str = "Wallet Top Up",
        **kwargs: Any
    ) -> STKPushResponse:
        """
        Trigger Lipa Na M-Pesa STK Push to the user's mobile handset.
        """
        formatted_phone = normalize_phone_number(phone_or_wallet)
        int_amount = int(amount)

        # Check for Sandbox / Mock simulation mode
        if self._is_mock_mode():
            checkout_id = f"ws_CO_MOCK_{int(time.time())}_{random.randint(1000, 9999)}"
            merchant_id = f"MOCK_MERCHANT_{random.randint(10000, 99999)}"
            self._mock_requests[checkout_id] = {
                "phone": formatted_phone,
                "amount": amount,
                "created_at": time.time(),
                "receipt": f"QHJ{random.randint(10000000, 99999999)}",
            }
            return STKPushResponse(
                checkout_request_id=checkout_id,
                merchant_request_id=merchant_id,
                response_code="0",
                response_description="Success. Request accepted for processing",
                customer_message=f"Success! Mock STK Push sent to {formatted_phone}. Enter your M-Pesa PIN."
            )

        # Live Safaricom Daraja STK Push Request
        token = await self._get_access_token()
        password, timestamp = self._generate_password_and_timestamp()

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": int_amount,
            "PartyA": formatted_phone,
            "PartyB": self.shortcode,
            "PhoneNumber": formatted_phone,
            "CallBackURL": self.callback_url,
            "AccountReference": account_reference[:12],
            "TransactionDesc": transaction_desc[:13],
        }

        url = f"{self.base_url}/mpesa/stkpush/v1/processrequest"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()

                if data.get("ResponseCode") != "0":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=data.get("ResponseDescription", "STK Push failed to initiate")
                    )

                return STKPushResponse(
                    checkout_request_id=data.get("CheckoutRequestID"),
                    merchant_request_id=data.get("MerchantRequestID"),
                    response_code=data.get("ResponseCode"),
                    response_description=data.get("ResponseDescription"),
                    customer_message=data.get("CustomerMessage"),
                    raw_response=data
                )
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Safaricom STK error: {exc.response.text}"
                )

    async def verify_payment(self, checkout_request_id: str) -> STKQueryResponse:
        """
        Query status of an initiated STK push.
        """
        # Mock mode response
        if self._is_mock_mode() or checkout_request_id.startswith("ws_CO_MOCK_"):
            item = self._mock_requests.get(checkout_request_id, {})
            return STKQueryResponse(
                checkout_request_id=checkout_request_id,
                result_code="0",
                result_desc="The service request is processed successfully.",
                mpesa_receipt=item.get("receipt", f"QHJ{random.randint(10000000, 99999999)}"),
                amount=item.get("amount", Decimal("1000.00")),
                phone_number=item.get("phone", "254712345678"),
                transaction_date=datetime.now().strftime("%Y%m%d%H%M%S")
            )

        token = await self._get_access_token()
        password, timestamp = self._generate_password_and_timestamp()

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "CheckoutRequestID": checkout_request_id,
        }

        url = f"{self.base_url}/mpesa/stkpushquery/v1/query"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

            return STKQueryResponse(
                checkout_request_id=checkout_request_id,
                result_code=str(data.get("ResultCode")),
                result_desc=data.get("ResultDesc"),
                raw_response=data
            )


# Singleton Daraja Client Instance
mpesa_client = MpesaDarajaClient()
