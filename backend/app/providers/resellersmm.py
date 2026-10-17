import logging
from decimal import Decimal
from typing import Any, Dict, List, Optional
import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.providers.base import (
    ProviderBalance,
    ProviderInterface,
    ProviderOrderResponse,
    ProviderOrderStatus,
    ProviderRefillResponse,
    ProviderServiceItem,
)

logger = logging.getLogger("socialpulse.providers.resellersmm")


class ResellerSMMProvider(ProviderInterface):
    """
    ResellerSMM (https://resellersmm.com) Upstream Provider Client.
    Implements the standard SMM Reseller API v2 for catalog sync,
    order placement, balance monitoring, and order lifecycle tracking.

    Key advantages:
    - Extremely cheap TikTok views (KES 0.36/1k vs JAP KES 2.27/1k)
    - Competitive YouTube views (KES 33.46/1k)
    - Cheap Telegram members (KES 14.30/1k)
    - 4,700+ services available
    """

    def __init__(
        self,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.api_url = (api_url or settings.RESELLERSMM_API_URL).rstrip("/")
        self.api_key = api_key or settings.RESELLERSMM_API_KEY
        self.timeout = timeout

    async def _post_request(self, payload: Dict[str, Any]) -> Any:
        """Executes form-encoded POST request with provider API key."""
        data = {
            "key": self.api_key,
            **payload
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SocialPulse-ProviderClient/1.0",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True, verify=False) as client:
            try:
                response = await client.post(self.api_url, data=data, headers=headers)
                response.raise_for_status()
                result = response.json()

                if isinstance(result, dict) and "error" in result:
                    err_msg = result.get("error")
                    logger.warning(f"ResellerSMM API error: {err_msg}")
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"ResellerSMM Provider Error: {err_msg}",
                    )
                return result
            except HTTPException:
                raise
            except httpx.HTTPStatusError as exc:
                logger.error(f"ResellerSMM HTTP status error {exc.response.status_code}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"ResellerSMM HTTP Error {exc.response.status_code}",
                )
            except httpx.RequestError as exc:
                logger.error(f"ResellerSMM connection error: {str(exc)}")
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail=f"Failed to connect to ResellerSMM: {str(exc)}",
                )

    async def get_services(self) -> List[ProviderServiceItem]:
        """Fetch full service catalog from ResellerSMM (~4,700+ services)."""
        data = await self._post_request({"action": "services"})
        services: List[ProviderServiceItem] = []

        if not isinstance(data, list):
            return services

        for item in data:
            try:
                rate_val = Decimal(str(item.get("rate", "0.00")))
                min_q = int(item.get("min", 10))
                max_q = int(item.get("max", 100000))
                is_refill = bool(item.get("refill", False))
                is_cancel = bool(item.get("cancel", False))

                services.append(
                    ProviderServiceItem(
                        service_id=str(item.get("service")),
                        name=str(item.get("name", "")),
                        type=str(item.get("type", "Default")),
                        category=str(item.get("category", "General")),
                        rate=rate_val,
                        min_quantity=min_q,
                        max_quantity=max_q,
                        refill=is_refill,
                        cancel=is_cancel,
                        description=str(item.get("desc", "")) or None,
                    )
                )
            except Exception as e:
                logger.warning(f"Skipping malformed ResellerSMM service item {item}: {e}")
                continue

        logger.info(f"ResellerSMM: Fetched {len(services)} services from catalog")
        return services

    async def get_balance(self) -> ProviderBalance:
        """Query live account balance from ResellerSMM."""
        try:
            data = await self._post_request({"action": "balance"})
            raw_balance = data.get("balance", "0.00")
            currency = data.get("currency", "USD")

            try:
                balance_decimal = Decimal(str(raw_balance).replace(",", ""))
            except Exception:
                balance_decimal = Decimal("0.00")

            return ProviderBalance(
                balance=balance_decimal,
                currency=currency,
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error(f"Failed to query ResellerSMM balance: {exc}")
            return ProviderBalance(balance=Decimal("0.00"), currency="USD")

    async def create_order(
        self,
        service_id: str,
        target: str = "",
        quantity: int = 1,
        **kwargs: Any
    ) -> ProviderOrderResponse:
        """Dispatch a single order to ResellerSMM."""
        target_link = target or kwargs.get("link", "")
        payload: Dict[str, Any] = {
            "action": "add",
            "service": service_id,
            "link": target_link,
            "quantity": quantity,
        }
        # Pass through optional parameters (runs, interval, comments, etc.)
        for k in ["runs", "interval", "comments", "username", "hashtag", "media_url"]:
            if k in kwargs and kwargs[k] is not None:
                payload[k] = kwargs[k]

        data = await self._post_request(payload)

        if not isinstance(data, dict) or "order" not in data:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"ResellerSMM returned unexpected order response: {data}",
            )

        logger.info(f"ResellerSMM order placed: #{data['order']} for service {service_id}")
        return ProviderOrderResponse(
            provider_order_id=str(data["order"]),
            status="Pending",
            raw_response=data,
        )

    async def get_order_status(self, provider_order_id: str) -> ProviderOrderStatus:
        """Poll order status from ResellerSMM."""
        data = await self._post_request({
            "action": "status",
            "order": provider_order_id,
        })

        raw_status = str(data.get("status", "Pending")).lower()
        start_count = None
        remains = None

        if data.get("start_count") is not None:
            try:
                start_count = int(data["start_count"])
            except (ValueError, TypeError):
                pass

        if data.get("remains") is not None:
            try:
                remains = int(data["remains"])
            except (ValueError, TypeError):
                pass

        return ProviderOrderStatus(
            provider_order_id=provider_order_id,
            status=raw_status,
            charge=Decimal(str(data.get("charge", "0.00"))),
            start_count=start_count,
            remains=remains,
            currency=data.get("currency", "USD"),
            raw_response=data,
        )

    async def refill_order(self, provider_order_id: str) -> ProviderRefillResponse:
        """Trigger refill on an eligible order on ResellerSMM."""
        data = await self._post_request({
            "action": "refill",
            "order": provider_order_id,
        })

        if isinstance(data, dict):
            if "refill" in data:
                return ProviderRefillResponse(
                    success=True,
                    refill_id=str(data.get("refill")),
                    raw_response=data
                )
            elif "error" in data:
                return ProviderRefillResponse(
                    success=False,
                    error=str(data.get("error")),
                    raw_response=data
                )

        refill_id = data.get("refill") if isinstance(data, dict) else None
        return ProviderRefillResponse(
            success=bool(refill_id),
            refill_id=str(refill_id) if refill_id else None,
            raw_response=data if isinstance(data, dict) else None,
        )

    async def cancel_order(self, provider_order_id: str) -> Dict[str, Any]:
        """Request cancellation on ResellerSMM."""
        return await self._post_request({
            "action": "cancel",
            "order": provider_order_id
        })

    async def multi_order_status(self, order_ids: List[str]) -> Dict[str, ProviderOrderStatus]:
        """Batch check multiple order statuses (ResellerSMM supports this)."""
        data = await self._post_request({
            "action": "status",
            "orders": ",".join(order_ids),
        })

        results = {}
        if isinstance(data, dict):
            for oid, info in data.items():
                if isinstance(info, dict):
                    results[oid] = ProviderOrderStatus(
                        provider_order_id=oid,
                        status=str(info.get("status", "Pending")).lower(),
                        charge=Decimal(str(info.get("charge", "0.00"))),
                        start_count=int(info["start_count"]) if info.get("start_count") else None,
                        remains=int(info["remains"]) if info.get("remains") else None,
                        currency=info.get("currency", "USD"),
                        raw_response=info,
                    )
        return results
