# Decommissioned: Non-JAP providers are disabled. JustAnotherPanel is the sole supported provider.
from app.providers.jap import JustAnotherPanelProvider


class GenericSMMProvider(JustAnotherPanelProvider):
    """
    Deprecated and disabled. All requests route to JustAnotherPanel.
    """
    def __init__(self, *args, **kwargs):
        raise NotImplementedError("Generic/non-JAP providers have been removed. Use JustAnotherPanel exclusively.")
