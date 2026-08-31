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
    ProviderServiceItem,
)


class DelixGainsProvider(ProviderInterface):
    """
    Dedicated Delix Gains KE SMM Provider Integration.
    API Specs:
    - Base URL: https://delixgainske.com/api/v2
    - HTTP Method: POST
    - Content-Type: application/x-www-form-urlencoded
    - Parameters: key, action (services, balance, add, status)
    """

    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        self.api_url = (api_url or settings.DELIX_API_URL).rstrip("/")
        self.api_key = api_key or settings.DELIX_API_KEY
        self.timeout = httpx.Timeout(15.0, connect=5.0)

    async def _post_request(self, data: Dict[str, Any]) -> Any:
        payload = {
            "key": self.api_key,
            **data
        }
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "SocialPulse-SMM-Engine/1.0",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(self.api_url, data=payload, headers=headers)
                try:
                    result = response.json()
                except Exception:
                    result = None

                # Check for Provider API error responses e.g. {"error": "invalid_quantity"}
                if isinstance(result, dict) and "error" in result:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST if response.status_code == 400 else status.HTTP_502_BAD_GATEWAY,
                        detail=f"Delix Gains Provider Error: {result.get('error')}"
                    )

                response.raise_for_status()
                return result
            except HTTPException:
                raise
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Delix Gains HTTP error {exc.response.status_code}: {exc.response.text}"
                )
            except httpx.RequestError as exc:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail=f"Failed to connect to Delix Gains provider: {str(exc)}"
                )

    async def get_services(self) -> List[ProviderServiceItem]:
        """Fetch all services from Delix Gains KE."""
        data = await self._post_request({"action": "services"})
        services_list: List[ProviderServiceItem] = []

        if not isinstance(data, list):
            return services_list

        for item in data:
            try:
                service_id = str(item.get("service", ""))
                name = item.get("name", "")
                stype = item.get("type", "Default")
                category = item.get("category", "General")
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
        """Fetch current balance from Delix Gains KE."""
        try:
            data = await self._post_request({"action": "balance"})
            balance_val = Decimal(str(data.get("balance", "0.00")))
            currency_val = data.get("currency", "KES")
            return ProviderBalance(balance=balance_val, currency=currency_val)
        except Exception:
            return ProviderBalance(balance=Decimal("0.00"), currency="KES")

    async def create_order(
        self,
        service_id: str,
        target: str,
        quantity: int,
        **kwargs: Any
    ) -> ProviderOrderResponse:
        """
        Create a new order on Delix Gains KE.
        action=add&service={id}&link={target}&quantity={quantity}
        """
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

        # Provider response format: {"order": 23501}
        order_id = str(data.get("order", ""))
        if not order_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Delix Gains order creation response missing order ID: {data}"
            )

        return ProviderOrderResponse(
            provider_order_id=order_id,
            status="Pending",
            raw_response=data
        )

    async def get_order_status(self, provider_order_id: str) -> ProviderOrderStatus:
        """Check order status on Delix Gains KE."""
        data = await self._post_request({
            "action": "status",
            "order": provider_order_id
        })

        status_val = data.get("status", "Pending")
        charge_val = Decimal(str(data.get("charge"))) if data.get("charge") is not None else None
        start_count_val = int(data.get("start_count")) if data.get("start_count") is not None else None
        remains_val = int(data.get("remains")) if data.get("remains") is not None else None
        currency_val = data.get("currency", "KES")

        return ProviderOrderStatus(
            provider_order_id=provider_order_id,
            status=status_val,
            charge=charge_val,
            start_count=start_count_val,
            remains=remains_val,
            currency=currency_val,
            raw_response=data
        )
