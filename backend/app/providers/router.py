import logging
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.provider import Provider
from app.models.service import Service
from app.providers.base import ProviderInterface, ProviderOrderResponse
from app.providers.jap import JustAnotherPanelProvider
from app.providers.generic_smm import GenericSMMProvider
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
        Dispatches an order to the primary provider (JustAnotherPanel).
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
            # Fallback to configured JustAnotherPanel provider
            active_providers = [
                Provider(
                    name="JustAnotherPanel",
                    slug="jap",
                    api_url=settings.JAP_API_URL,
                    is_active=True,
                    currency="USD"
                )
            ]

        # Prioritize the service's designated provider first
        if service.provider_id:
            designated = [p for p in active_providers if p.id == service.provider_id]
            others = [p for p in active_providers if p.id != service.provider_id]
            active_providers = designated + others
        elif hasattr(service, 'provider') and service.provider:
            designated = [p for p in active_providers if p.id == service.provider.id or p.slug == service.provider.slug]
            others = [p for p in active_providers if p not in designated]
            active_providers = designated + others

        last_error = None

        # 2. Try each provider in priority chain
        for provider_record in active_providers:
            try:
                p_slug = getattr(provider_record, "slug", "jap") or "jap"
                p_name = getattr(provider_record, "name", None) or ("JustAnotherPanel (JAP)" if "jap" in str(p_slug).lower() else str(p_slug).capitalize())
                p_url = getattr(provider_record, "api_url", None) or settings.JAP_API_URL
                p_key = getattr(provider_record, "api_key_encrypted", None) or settings.JAP_API_KEY
                logger.info(f"[*] Attempting dispatch to Provider: {p_name} ({p_slug})")

                # Instantiate provider client
                if str(p_slug).lower() in ["jap", "justanotherpanel", "just_another_panel", "just-another-panel", "default"]:
                    client = JustAnotherPanelProvider(
                        api_url=p_url,
                        api_key=p_key
                    )
                else:
                    client = GenericSMMProvider(
                        name=p_name,
                        api_url=p_url,
                        api_key=p_key
                    )

                # Submit order
                provider_srv_id = str(service.provider_service_id or "1")
                resp: ProviderOrderResponse = await client.create_order(
                    service_id=provider_srv_id,
                    target=target_link,
                    quantity=quantity,
                    **kwargs
                )

                logger.info(f"[+] Order successfully dispatched to {p_name}! Provider Order ID: {resp.provider_order_id}")
                prov_id_str = str(getattr(provider_record, 'id', '')) if getattr(provider_record, 'id', None) else None
                return prov_id_str, resp.provider_order_id, f"Dispatched to {p_name}"

            except Exception as err:
                last_error = err
                p_ident = getattr(provider_record, 'name', None) or getattr(provider_record, 'slug', 'unknown')
                logger.warning(f"[!] Failover triggered: Provider {p_ident} failed: {err}. Routing to next fallback...")
                continue

        # If all live providers fail, raise informative exception
        logger.error(f"[X] All upstream providers in failover chain failed. Last error: {last_error}")
        raise Exception(f"All providers in failover chain failed: {last_error}")
