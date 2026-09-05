"""
PalPluss M-Pesa Payment Engine Integration
Supports STK Push collections, B2C payouts, service wallet balance monitoring,
and real-time webhook ingestion for the SocialPulse platform.
"""

import base64
import logging
from decimal import Decimal
from typing import Any, Dict, List, Optional
import httpx

from app.core.config import settings

logger = logging.getLogger("palpluss_payments")


def normalize_kenyan_phone(phone: str) -> str:
    """
    Normalizes Kenyan phone numbers to the 254XXXXXXXXX format required by PalPluss.
    Handles:
      - 07XXXXXXXX -> 2547XXXXXXXX
      - 01XXXXXXXX -> 2541XXXXXXXX
      - +254XXXXXXXXX -> 254XXXXXXXXX
      - 254XXXXXXXXX -> 254XXXXXXXXX
    """
    clean = "".join(filter(str.isdigit, phone))
    if clean.startswith("0") and len(clean) == 10:
        return "254" + clean[1:]
    elif clean.startswith("254") and len(clean) == 12:
        return clean
    elif len(clean) == 9:
        return "254" + clean
    raise ValueError(f"Invalid Kenyan phone number format: '{phone}'. Expected 07XXXXXXXX, 01XXXXXXXX, or 254XXXXXXXXX.")


class PalPlussGateway:
    """
    High-performance Async Client for PalPluss Payment Infrastructure.
    Uses HTTP Basic Auth with API key as username and empty password.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 30.0
    ):
        self.api_key = (api_key or settings.PALPLUSS_API_KEY or "").strip()
        self.base_url = (base_url or settings.PALPLUSS_BASE_URL).rstrip("/")
        self.timeout = timeout

    def _get_headers(self) -> Dict[str, str]:
        if not self.api_key:
            raise RuntimeError(
                "PALPLUSS_API_KEY is not set on the server. "
                "Please add PALPLUSS_API_KEY to your deployment environment variables (e.g. on Render)."
            )
        token = base64.b64encode(f"{self.api_key}:".encode("utf-8")).decode("utf-8")
        return {
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "SocialPulse-SMM/1.0",
        }

    async def get_service_balance(self) -> Dict[str, Any]:
        """
        Retrieves current service wallet token/KES balance.
        GET /v1/wallets/service/balance
        """
        url = f"{self.base_url}/wallets/service/balance"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.get(url, headers=self._get_headers())
                data = resp.json()
                if resp.status_code == 200 and data.get("success"):
                    return data.get("data", {})
                error_info = data.get("error", {})
                logger.error(f"PalPluss get_service_balance failed [{resp.status_code}]: {error_info}")
                return {
                    "availableBalance": 0,
                    "ledgerBalance": 0,
                    "currency": "KES",
                    "error": error_info.get("message", "Unknown error")
                }
            except Exception as e:
                logger.warning(f"Failed to query PalPluss service balance: {e}")
                return {
                    "availableBalance": 0,
                    "ledgerBalance": 0,
                    "currency": "KES",
                    "error": str(e)
                }

    async def initiate_stk_push(
        self,
        phone: str,
        amount: Decimal | float | int,
        account_reference: str,
        transaction_desc: Optional[str] = None,
        callback_url: Optional[str] = None,
        channel_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Initiates Lipa Na M-Pesa STK Push prompt to customer's mobile device.
        POST /v1/payments/stk
        """
        norm_phone = normalize_kenyan_phone(phone)
        cb_url = callback_url or settings.PALPLUSS_CALLBACK_URL
        ch_id = channel_id or settings.PALPLUSS_CHANNEL_ID

        # Constraints per PalPluss documentation:
        # accountReference: max 12 chars
        # transactionDesc: max 13 chars
        safe_ref = (account_reference or "SocialPulse")[:12]
        safe_desc = (transaction_desc or "Top Up")[:13]

        payload: Dict[str, Any] = {
            "amount": float(amount),
            "phone": norm_phone,
            "accountReference": safe_ref,
            "transactionDesc": safe_desc,
            "callbackUrl": cb_url,
        }
        if ch_id:
            payload["channelId"] = ch_id

        url = f"{self.base_url}/payments/stk"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload, headers=self._get_headers())
                data = resp.json()

                if resp.status_code in (200, 201) and data.get("success"):
                    return data.get("data", {})

                error_obj = data.get("error", {})
                err_code = error_obj.get("code", f"HTTP_{resp.status_code}")
                err_msg = error_obj.get("message", "PalPluss STK Push failed")
                logger.error(f"PalPluss STK initiation error [{err_code}]: {err_msg}")
                raise RuntimeError(f"[{err_code}] {err_msg}")
        except httpx.TimeoutException:
            logger.error("PalPluss API request timed out after 15s")
            raise RuntimeError("PalPluss API gateway timed out. The upstream server may be temporarily busy.")
        except httpx.ConnectError:
            logger.error("Failed to connect to PalPluss API gateway")
            raise RuntimeError("Unable to reach PalPluss gateway server. Please try again or use the Safaricom Direct route.")

    async def get_transaction(self, transaction_id: str) -> Dict[str, Any]:
        """
        Retrieves full details and real-time state of a single transaction by ID.
        GET /v1/transactions/{id}
        """
        url = f"{self.base_url}/transactions/{transaction_id}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._get_headers())
            data = resp.json()
            if resp.status_code == 200 and data.get("success"):
                return data.get("data", {})
            error_obj = data.get("error", {})
            raise RuntimeError(f"PalPluss Transaction query failed: {error_obj.get('message', resp.text)}")

    async def list_transactions(
        self,
        limit: int = 20,
        status: Optional[str] = None,
        tx_type: Optional[str] = None,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Retrieves paginated transactions from PalPluss.
        GET /v1/transactions
        """
        params: Dict[str, Any] = {"limit": limit}
        if status:
            params["status"] = status
        if tx_type:
            params["type"] = tx_type
        if cursor:
            params["cursor"] = cursor

        url = f"{self.base_url}/transactions"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, params=params, headers=self._get_headers())
            data = resp.json()
            if resp.status_code == 200 and data.get("success"):
                return data.get("data", {})
            return {"items": [], "next_cursor": None}

    async def initiate_b2c_payout(
        self,
        phone: str,
        amount: Decimal | float | int,
        reference: str,
        description: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        callback_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Sends money directly to customer's M-Pesa phone (B2C disbursement).
        POST /v1/payments/b2c
        """
        norm_phone = normalize_kenyan_phone(phone)
        cb_url = callback_url or settings.PALPLUSS_CALLBACK_URL

        payload: Dict[str, Any] = {
            "amount": float(amount),
            "phone": norm_phone,
            "reference": reference[:12],
            "description": (description or "Payout")[:13],
            "callbackUrl": cb_url,
        }
        if idempotency_key:
            payload["idempotencyKey"] = idempotency_key

        url = f"{self.base_url}/payments/b2c"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload, headers=self._get_headers())
            data = resp.json()
            if resp.status_code in (200, 201) and data.get("success"):
                return data.get("data", {})
            error_obj = data.get("error", {})
            raise RuntimeError(f"PalPluss B2C Payout failed: {error_obj.get('message', resp.text)}")


# Singleton instance
palpluss_client = PalPlussGateway()
