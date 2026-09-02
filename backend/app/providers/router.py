import logging
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.provider import Provider
from app.models.service import Service
from app.providers.base import ProviderInterface, ProviderOrderResponse
from app.providers.generic_smm import GenericSMMProvider
from app.providers.delix import DelixGainsProvider
from app.providers.mock import MockProvider
from app.core.config import settings

logger = logging.getLogger("socialpulse.router")


class SmartProviderRouter:
    """
    Provider Smart Router with Automatic Failover.
    Ensures 99.9% order delivery uptime by routing orders across upstream SMM providers.
    """

    @classmethod
    async def dispatch_with_failover(
        cls,
        service: Service,
        target_link: str,
        quantity: int,
        db: AsyncSession,
        **kwargs: Any
    ) -> Tuple[Optional[str], Optional[str], str]:
        """
        Dispatches an order to the primary provider (Delix Gains KE).
        If the primary provider fails, it automatically failovers to any active fallback in the chain.

        Returns: (provider_id, provider_order_id, status_message)
        """
        # If running in mock mode
        if settings.USE_MOCK_PROVIDERS:
            mock = MockProvider()
            resp = await mock.create_order(
                service_id=str(service.provider_service_id or "101"),
                target=target_link,
                quantity=quantity,
                **kwargs
            )
            return None, resp.provider_order_id, "Dispatched (Mock Sandbox)"

        # 1. Fetch all active providers ordered by priority / creation
        query = await db.execute(
            select(Provider).where(Provider.is_active == True).order_by(Provider.created_at.asc())
        )
        active_providers = query.scalars().all()

        if not active_providers:
            # Fallback to configured Delix Gains provider
            delix_key = settings.DELIX_API_KEY
            if delix_key and delix_key != "YOUR_DELIX_API_KEY_HERE":
                active_providers = [
                    Provider(
                        name="Delix Gains KE",
                        slug="delix",
                        api_url=settings.DELIX_API_URL,
                        is_active=True,
                        currency="KES"
                    )
                ]

        last_error = None

        # 2. Try each provider in priority chain
        for provider_record in active_providers:
            try:
                logger.info(f"[*] Attempting dispatch to Provider: {provider_record.name} ({provider_record.slug})")

                # Instantiate provider client
                if provider_record.slug in ["delix", "delixgains", "delixgainske", "default"]:
                    client = DelixGainsProvider(
                        api_url=provider_record.api_url or settings.DELIX_API_URL,
                        api_key=settings.DELIX_API_KEY
                    )
                elif provider_record.slug in ["exonums", "exonums.com"]:
                    client = GenericSMMProvider(
                        name="Exonums",
                        api_url=provider_record.api_url or settings.EXONUMS_API_URL,
                        api_key=settings.EXONUMS_API_KEY
                    )
                else:
                    client = GenericSMMProvider(
                        name=provider_record.name,
                        api_url=provider_record.api_url,
                        api_key=settings.DELIX_API_KEY
                    )

                # Submit order
                provider_srv_id = str(service.provider_service_id or "1")
                resp: ProviderOrderResponse = await client.create_order(
                    service_id=provider_srv_id,
                    target=target_link,
                    quantity=quantity,
                    **kwargs
                )

                logger.info(f"[+] Order successfully dispatched to {provider_record.name}! Provider Order ID: {resp.provider_order_id}")
                return str(provider_record.id) if hasattr(provider_record, 'id') else None, resp.provider_order_id, f"Dispatched to {provider_record.name}"

            except Exception as err:
                last_error = err
                logger.warning(f"[!] Failover triggered: Provider {provider_record.name} failed: {err}. Routing to next fallback...")
                continue

        # If all live providers fail, raise informative exception
        logger.error(f"[X] All upstream providers in failover chain failed. Last error: {last_error}")
        raise Exception(f"All providers in failover chain failed: {last_error}")
