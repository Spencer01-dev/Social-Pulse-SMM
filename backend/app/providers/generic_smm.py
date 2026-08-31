from decimal import Decimal
from typing import Any, Dict, List, Optional
import httpx
from fastapi import HTTPException, status

from app.providers.base import (
    ProviderBalance,
    ProviderInterface,
    ProviderOrderResponse,
    ProviderOrderStatus,
    ProviderServiceItem,
)


class GenericSMMProvider(ProviderInterface):
    """
    Universal standard SMM API v2 provider client.
    Works seamlessly with ANY SMM panel or supplier worldwide 
    (e.g. JustAnotherPanel, SMMRush, Peakerr, PrimeSMM, Secsers, etc.)
    """

    def __init__(
        self,
        name: str,
        api_url: str,
        api_key: str,
        timeout: float = 15.0,
    ):
        self.name = name
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    async def _post_request(self, payload: Dict[str, Any]) -> Any:
        """Executes form-encoded POST requests with anti-bot User-Agent."""
        payload["key"] = self.api_key
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SocialPulse-ProviderClient/1.0",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(self.api_url, data=payload, headers=headers)
                response.raise_for_status()
                result = response.json()

                if isinstance(result, dict) and "error" in result:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"{self.name} Provider Error: {result.get('error')}",
                    )
                return result
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"{self.name} HTTP error {exc.response.status_code}",
                )
            except httpx.RequestError as exc:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail=f"Failed to connect to {self.name}: {str(exc)}",
                )

    async def get_services(self) -> List[ProviderServiceItem]:
        """Fetch all services from upstream provider."""
        data = await self._post_request({"action": "services"})
        services_list: List[ProviderServiceItem] = []

        if not isinstance(data, list):
            return services_list

        for item in data:
            try:
                service_id = str(item.get("service", ""))
                name = str(item.get("name", "Service"))
                stype = str(item.get("type", "Default"))
                category = item.get("category")
                rate = Decimal(str(item.get("rate", "0.00")))
                min_q = int(item.get("min", 10))
                max_q = int(item.get("max", 100000))
                refill = bool(item.get("refill", False))
                cancel = bool(item.get("cancel", False))

                services_list.append(
                    ProviderServiceItem(
                        service_id=service_id,
                        name=name,
                        type=stype,
                        category=category,
                        rate=rate,
                        min_quantity=min_q,
                        max_quantity=max_q,
                        refill=refill,
                        cancel=cancel,
                    )
                )
            except Exception:
                continue

        return services_list

    async def get_balance(self) -> ProviderBalance:
        """Fetch account balance from upstream provider."""
        data = await self._post_request({"action": "balance"})
        balance_val = Decimal(str(data.get("balance", "0.00")))
        currency_val = data.get("currency", "USD")
        return ProviderBalance(balance=balance_val, currency=currency_val)

    async def create_order(
        self,
        service_id: str,
        target: str,
        quantity: int,
        **kwargs: Any
    ) -> ProviderOrderResponse:
        """Submit new order to upstream provider."""
        payload: Dict[str, Any] = {
            "action": "add",
            "service": service_id,
            "link": target,
            "quantity": quantity,
        }

        for key, value in kwargs.items():
            if value is not None:
                payload[key] = value

        data = await self._post_request(payload)

        if "order" not in data:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Invalid response from {self.name}: {data}",
            )

        return ProviderOrderResponse(
            provider_order_id=str(data["order"]),
            initial_status="Pending",
            start_count=0,
            remains=quantity,
            charge=Decimal("0.00"),
            currency="USD",
        )

    async def get_order_status(self, provider_order_id: str) -> ProviderOrderStatus:
        """Check order status from upstream provider."""
        data = await self._post_request({"action": "status", "order": provider_order_id})

        return ProviderOrderStatus(
            provider_order_id=provider_order_id,
            status=str(data.get("status", "Pending")),
            charge=Decimal(str(data.get("charge", "0.00"))),
            start_count=int(data.get("start_count", 0)),
            remains=int(data.get("remains", 0)),
            currency=str(data.get("currency", "USD")),
        )

    async def get_multiple_order_status(self, order_ids: List[str]) -> Dict[str, ProviderOrderStatus]:
        """Batch query multiple order statuses."""
        if not order_ids:
            return {}

        orders_str = ",".join(order_ids)
        data = await self._post_request({"action": "status", "orders": orders_str})

        result: Dict[str, ProviderOrderStatus] = {}
        if isinstance(data, dict):
            for oid, details in data.items():
                if isinstance(details, dict):
                    result[str(oid)] = ProviderOrderStatus(
                        provider_order_id=str(oid),
                        status=str(details.get("status", "Pending")),
                        charge=Decimal(str(details.get("charge", "0.00"))),
                        start_count=int(details.get("start_count", 0)),
                        remains=int(details.get("remains", 0)),
                        currency=str(details.get("currency", "USD")),
                    )
        return result
