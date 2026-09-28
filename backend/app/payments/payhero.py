import base64
import logging
import random
import uuid
from decimal import Decimal
from typing import Any, Dict, Optional
import httpx

from app.core.config import settings
from app.payments.mpesa import normalize_phone_number

logger = logging.getLogger(__name__)


class PayHeroClient:
    """
    PayHero Kenya Payment Client (payhero.co.ke).
    Enables instant Lipa Na M-Pesa STK Push directly to any connected:
    - Safaricom Buy Goods Till Number
    - Paybill Number
    - Pochi la Biashara
    
    Can be dynamically instantiated with custom credentials per Child Panel
    or default to platform settings.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        channel_id: Optional[str] = None,
        base_url: Optional[str] = None,
        callback_url: Optional[str] = None,
    ):
        self.api_key = api_key if api_key is not None else settings.PAYHERO_API_KEY
        self.api_secret = api_secret if api_secret is not None else settings.PAYHERO_API_SECRET
        self.channel_id = channel_id if channel_id is not None else settings.PAYHERO_CHANNEL_ID
        self.base_url = (base_url or settings.PAYHERO_BASE_URL).rstrip("/")
        self.callback_url = callback_url or settings.PAYHERO_CALLBACK_URL
        self.timeout = httpx.Timeout(30.0, connect=10.0)

    @property
    def is_simulator(self) -> bool:
        return (
            getattr(settings, "USE_MOCK_PROVIDERS", False)
            or not self.api_key
            or self.api_key.startswith("YOUR_")
            or self.api_key.startswith("test_")
            or self.api_key.startswith("mock_")
            or not self.channel_id
        )

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key and self.api_secret:
            credentials = f"{self.api_key}:{self.api_secret}"
            encoded = base64.b64encode(credentials.encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"
        elif self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def initiate_stk_push(
        self,
        phone: str,
        amount: Decimal,
        external_reference: Optional[str] = None,
        callback_url: Optional[str] = None,
        account_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Trigger an automated Lipa Na M-Pesa STK push via PayHero to the recipient Till/Paybill channel.
        """
        formatted_phone = normalize_phone_number(phone)
        ref = external_reference or f"PH-{uuid.uuid4().hex[:12].upper()}"
        cb_url = callback_url or self.callback_url

        if self.is_simulator:
            checkout_id = f"ws_CO_{uuid.uuid4().hex[:16]}"
            logger.info(
                f"[SIMULATOR] PayHero STK Push triggered to {formatted_phone}: KES {amount} "
                f"(Channel: {self.channel_id or 'DEFAULT_TILL'}, Ref: {ref})"
            )
            return {
                "success": True,
                "status": "Queued",
                "reference": ref,
                "checkout_request_id": checkout_id,
                "channel_id": self.channel_id or "MOCK_TILL",
                "phone": formatted_phone,
                "amount": float(amount),
                "is_simulator": True,
                "message": "STK Push prompt sent to user mobile (Simulator)",
            }

        payload: Dict[str, Any] = {
            "amount": float(amount),
            "phone_number": formatted_phone,
            "channel_id": int(self.channel_id) if str(self.channel_id).isdigit() else self.channel_id,
            "provider": "m-pesa",
            "external_reference": ref,
            "callback_url": cb_url,
        }
        if account_name:
            payload["account_name"] = account_name

        async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
            response = await client.post(
                f"{self.base_url}/payments",
                json=payload,
                headers=self._get_headers(),
            )
            data = response.json()
            if response.status_code not in (200, 201) or (isinstance(data, dict) and data.get("status") == "Failed"):
                err_msg = data.get("message") or data.get("error") or str(data)
                raise Exception(f"PayHero STK Push failed: {err_msg}")

            return {
                "success": True,
                "status": data.get("status", "Queued"),
                "reference": ref,
                "checkout_request_id": data.get("checkout_request_id") or data.get("reference") or ref,
                "channel_id": self.channel_id,
                "phone": formatted_phone,
                "amount": float(amount),
                "raw_response": data,
                "is_simulator": False,
            }

    async def check_payment_status(self, reference: str) -> Dict[str, Any]:
        """
        Query PayHero for transaction completion status.
        """
        if self.is_simulator or "SIMULATOR" in reference:
            mock_receipt = f"SHG{random.randint(10000000, 99999999)}"
            return {
                "status": "Success",
                "reference": reference,
                "receipt": mock_receipt,
                "is_simulator": True,
            }

        async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
            response = await client.get(
                f"{self.base_url}/payments/{reference}",
                headers=self._get_headers(),
            )
            return response.json()


# Global default PayHero client instance
payhero_client = PayHeroClient()
