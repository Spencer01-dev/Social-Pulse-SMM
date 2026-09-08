import uuid
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


class SMMAfricaProvider(ProviderInterface):
    """
    Dedicated SMM Africa Reseller API v3 Integration.
    API Specs:
    - Base URL: https://smm.africa/api/v3
    - HTTP Method: POST
    - Content-Type: application/json
    - Auth: Bearer Token in Authorization header & 'key' field in JSON payload
    - Actions: balance, services, add, status, refill, cancel
    - Currency: USD
    - Supports idempotency keys for zero double-charging
    """

    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        self.api_url = (api_url or settings.SMM_AFRICA_API_URL).rstrip("/")
        self.api_key = api_key or settings.SMM_AFRICA_API_KEY
        self.timeout = httpx.Timeout(45.0, connect=10.0)

    async def _post_request(
        self,
        payload: Dict[str, Any],
        idempotency_key: Optional[str] = None
    ) -> Any:
        data = {
            "key": self.api_key,
            **payload
        }

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": "SocialPulse-ProviderClient/1.0",
        }

        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
            data["idempotency_key"] = idempotency_key

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(self.api_url, json=data, headers=headers)
                try:
                    result = response.json()
                except Exception:
                    result = None

                if isinstance(result, dict) and "error" in result:
                    error_msg = result.get("error", "Unknown provider error")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST if response.status_code == 400 else status.HTTP_502_BAD_GATEWAY,
                        detail=f"SMM Africa Provider Error: {error_msg}"
                    )

                response.raise_for_status()
                return result
            except HTTPException:
                raise
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"SMM Africa HTTP error {exc.response.status_code}: {exc.response.text}"
                )
            except httpx.RequestError as exc:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail=f"Failed to connect to SMM Africa provider: {str(exc)}"
                )

    async def get_services(self) -> List[ProviderServiceItem]:
        """Fetch all services from SMM Africa catalog."""
        data = await self._post_request({"action": "services"})
        services_list: List[ProviderServiceItem] = []

        if not isinstance(data, list):
            return services_list

        for item in data:
            try:
                service_id = str(item.get("service", ""))
                name = str(item.get("name", "Service"))
                stype = str(item.get("type", "Default"))
                category = str(item.get("category", "General"))
                rate = Decimal(str(item.get("rate", "0.00")))
                min_q = int(item.get("min", 10))
                max_q = int(item.get("max", 100000))
                refill = bool(item.get("refill", False))
                cancel = bool(item.get("cancel", False))
                description = item.get("description")

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
                        description=description,
                    )
                )
            except Exception:
                continue

        return services_list

    async def get_balance(self) -> ProviderBalance:
        """Fetch current wallet balance from SMM Africa (returned in USD)."""
        try:
            data = await self._post_request({"action": "balance"})
            balance_val = Decimal(str(data.get("balance", "0.00")))
            currency_val = str(data.get("currency", "USD"))
            return ProviderBalance(balance=balance_val, currency=currency_val)
        except Exception:
            return ProviderBalance(balance=Decimal("0.00"), currency="USD")

    async def create_order(
        self,
        service_id: str,
        target: str,
        quantity: int,
        **kwargs: Any
    ) -> ProviderOrderResponse:
        """
        Create a new order on SMM Africa with idempotency protection.
        Payload: action=add, service={id}, link={target}, quantity={quantity}
        """
        idempotency_key = kwargs.pop("idempotency_key", None) or str(uuid.uuid4())

        payload: Dict[str, Any] = {
            "action": "add",
            "service": service_id,
            "link": target,
            "quantity": quantity,
        }

        for key, value in kwargs.items():
            if value is not None:
                payload[key] = value

        data = await self._post_request(payload, idempotency_key=idempotency_key)

        order_id = str(data.get("order", ""))
        if not order_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"SMM Africa order creation response missing order ID: {data}"
            )

        charged = None
        if "charged" in data and data["charged"] is not None:
            charged = Decimal(str(data["charged"]))

        return ProviderOrderResponse(
            provider_order_id=order_id,
            status="Pending",
            charge=charged,
            raw_response=data
        )

    async def get_order_status(self, provider_order_id: str) -> ProviderOrderStatus:
        """Check order status on SMM Africa."""
        data = await self._post_request({
            "action": "status",
            "order": provider_order_id
        })

        status_val = str(data.get("status", "Pending"))
        charge_val = Decimal(str(data.get("charge"))) if data.get("charge") is not None else None
        start_count_val = int(data.get("start_count")) if data.get("start_count") is not None else None
        remains_val = int(data.get("remains")) if data.get("remains") is not None else None

        return ProviderOrderStatus(
            provider_order_id=provider_order_id,
            status=status_val,
            charge=charge_val,
            start_count=start_count_val,
            remains=remains_val,
            currency="USD",
            raw_response=data
        )

    async def refill_order(self, provider_order_id: str) -> ProviderRefillResponse:
        """
        Request refill for an eligible order on SMM Africa.
        action=refill&order={order_id}
        """
        data = await self._post_request({
            "action": "refill",
            "order": provider_order_id
        })

        if isinstance(data, dict):
            if "success" in data:
                return ProviderRefillResponse(
                    success=True,
                    refill_id=str(data.get("order", provider_order_id)),
                    raw_response=data
                )
            elif "error" in data:
                return ProviderRefillResponse(
                    success=False,
                    error=str(data["error"]),
                    raw_response=data
                )

        return ProviderRefillResponse(
            success=False,
            error=f"Unexpected response from SMM Africa: {data}",
            raw_response=data if isinstance(data, dict) else None
        )

    async def cancel_order(self, provider_order_id: str) -> Dict[str, Any]:
        """
        Request cancellation for an eligible order on SMM Africa.
        action=cancel&order={order_id}
        """
        return await self._post_request({
            "action": "cancel",
            "order": provider_order_id
        })
