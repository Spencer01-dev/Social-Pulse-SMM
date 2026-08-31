from typing import Any, Dict
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import require_roles
from app.core.config import settings
from app.models.user import User, UserRole

router = APIRouter(prefix="/admin/settings", tags=["Admin Settings & Config"])


@router.get("")
async def get_platform_settings(
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Dict[str, Any]:
    """
    Get current platform configuration and provider connectivity status.
    """
    return {
        "project_name": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "primary_currency": settings.PRIMARY_CURRENCY,
        "debug_mode": settings.DEBUG,
        "use_mock_providers": settings.USE_MOCK_PROVIDERS,
        "providers": {
            "delix": {
                "name": "Delix Gains KE",
                "api_url": settings.DELIX_API_URL,
                "has_api_key": bool(settings.DELIX_API_KEY and settings.DELIX_API_KEY != "YOUR_DELIX_API_KEY_HERE"),
            }
        },
        "payments": {
            "mpesa": {
                "environment": settings.MPESA_ENVIRONMENT,
                "shortcode": settings.MPESA_SHORTCODE,
                "has_consumer_key": bool(settings.MPESA_CONSUMER_KEY),
                "callback_url": settings.MPESA_CALLBACK_URL,
            },
            "okx": {
                "has_api_key": bool(settings.OKX_API_KEY),
                "supported_chains": ["TRC20", "TON", "POLYGON"],
            },
            "binance": {
                "has_api_key": bool(settings.BINANCE_API_KEY or settings.BINANCE_PAY_API_KEY),
                "base_url": settings.BINANCE_BASE_URL,
            }
        },
        "exchange_rates": {
            "default_usd_to_kes": settings.DEFAULT_USD_TO_KES,
            "default_usdt_to_kes": settings.DEFAULT_USDT_TO_KES,
            "markup_percent": settings.EXCHANGE_RATE_MARKUP_PERCENT,
        }
    }
