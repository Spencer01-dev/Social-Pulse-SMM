from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# Initialize slowapi rate limiter keyed by client IP address
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["120/minute"],
    storage_uri=getattr(settings, "REDIS_URL", "memory://") if not getattr(settings, "DEBUG", True) else "memory://",
    headers_enabled=True
)
