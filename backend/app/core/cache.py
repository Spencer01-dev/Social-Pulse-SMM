import time
from typing import Any, Dict, Optional, Tuple

# In-memory TTL cache
_memory_cache: Dict[str, Tuple[float, Any]] = {}


def get_cache(key: str) -> Optional[Any]:
    """Retrieve an item from the in-memory cache if not expired."""
    entry = _memory_cache.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.time() > expires_at:
        _memory_cache.pop(key, None)
        return None
    return value


def set_cache(key: str, value: Any, ttl_seconds: int = 300) -> None:
    """Store an item in the in-memory cache with a TTL (seconds)."""
    _memory_cache[key] = (time.time() + ttl_seconds, value)


def invalidate_cache_prefix(prefix: str) -> None:
    """Invalidate all cache entries matching a prefix."""
    keys_to_del = [k for k in list(_memory_cache.keys()) if k.startswith(prefix)]
    for k in keys_to_del:
        _memory_cache.pop(k, None)


def clear_all_cache() -> None:
    """Clear all entries in the in-memory cache."""
    _memory_cache.clear()
