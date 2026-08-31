from typing import Optional
from app.core.config import settings
from app.providers.base import ProviderInterface
from app.providers.delix import DelixGainsProvider
from app.providers.generic_smm import GenericSMMProvider
from app.providers.mock import MockProvider


def get_provider(slug: str = "delix", api_url: Optional[str] = None, api_key: Optional[str] = None) -> ProviderInterface:
    """
    Provider Factory function.
    Returns the appropriate ProviderInterface implementation.
    """
    slug_clean = slug.lower()

    if settings.USE_MOCK_PROVIDERS:
        return MockProvider()

    if slug_clean in ["delix", "delixgains", "delixgainske", "default", "primary"]:
        effective_key = api_key or settings.DELIX_API_KEY
        return DelixGainsProvider(api_url=api_url or settings.DELIX_API_URL, api_key=effective_key)

    # Generic SMM v2 Provider fallback
    if api_url and (api_key or settings.DELIX_API_KEY):
        return GenericSMMProvider(
            name=slug.capitalize(),
            api_url=api_url,
            api_key=api_key or settings.DELIX_API_KEY
        )

    # Default fallback to Delix Gains
    return DelixGainsProvider(
        api_url=settings.DELIX_API_URL,
        api_key=settings.DELIX_API_KEY
    )
