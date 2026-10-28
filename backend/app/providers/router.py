import logging
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.provider import Provider
from app.models.service import Service
from app.providers.base import ProviderInterface, ProviderOrderResponse
from app.providers.jap import JustAnotherPanelProvider
from app.providers.mock import MockProvider
from app.core.config import settings

logger = logging.getLogger("socialpulse.router")


class SmartProviderRouter:
    """
    Dedicated Provider Router for JustAnotherPanel (JAP).
    Ensures orders are reliably dispatched to the platform's sole upstream wholesale provider.
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
        Dispatches an order exclusively to JustAnotherPanel (JAP).
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

        # 1. Fetch the active JustAnotherPanel provider record
        query = await db.execute(
            select(Provider).where(Provider.slug == "jap", Provider.is_active == True).limit(1)
        )
        jap_provider = query.scalars().first()

        if not jap_provider:
            # Query any provider with jap in slug or name
            query_fallback = await db.execute(
                select(Provider).where(Provider.slug.ilike("%jap%")).limit(1)
            )
            jap_provider = query_fallback.scalars().first()

        p_url = getattr(jap_provider, "api_url", None) or settings.JAP_API_URL
        p_key = getattr(jap_provider, "api_key_encrypted", None) or settings.JAP_API_KEY
        p_id_str = str(jap_provider.id) if jap_provider else None

        logger.info(f"[*] Dispatching order to JustAnotherPanel (JAP)...")

        # 2. Instantiate JAP client and dispatch order
        client = JustAnotherPanelProvider(
            api_url=p_url,
            api_key=p_key
        )

        provider_srv_id = str(service.provider_service_id or "1")
        resp: ProviderOrderResponse = await client.create_order(
            service_id=provider_srv_id,
            target=target_link,
            quantity=quantity,
            **kwargs
        )

        logger.info(f"[+] Order successfully dispatched! Provider Order ID: {resp.provider_order_id}")
        return p_id_str, resp.provider_order_id, "Dispatched to fulfillment server"

