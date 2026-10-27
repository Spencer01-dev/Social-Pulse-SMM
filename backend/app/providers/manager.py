from typing import Optional
from app.core.config import settings
from app.providers.base import ProviderInterface
from app.providers.jap import JustAnotherPanelProvider
from app.providers.mock import MockProvider


def get_provider(slug: str = "jap", api_url: Optional[str] = None, api_key: Optional[str] = None) -> ProviderInterface:
    """
    Provider Factory function.
    Returns JustAnotherPanelProvider (JAP is the sole upstream provider).
    """
    if settings.USE_MOCK_PROVIDERS:
        return MockProvider()

    # JustAnotherPanel (JAP) is the only active provider supported
    return JustAnotherPanelProvider(
        api_url=api_url or settings.JAP_API_URL,
        api_key=api_key or settings.JAP_API_KEY,
    )

