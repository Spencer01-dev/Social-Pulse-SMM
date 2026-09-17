from typing import Any, Optional
from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.child_panel import ChildPanel, ChildPanelStatus

router = APIRouter(prefix="/tenant", tags=["Tenant Resolution"])

MAIN_PLATFORM_DOMAINS = [
    "socialpulse.io",
    "social-pulse-smm.vercel.app",
    "localhost",
    "127.0.0.1"
]


@router.get("/resolve")
async def resolve_tenant(
    domain: Optional[str] = Query(None, description="Explicit hostname to resolve"),
    host: Optional[str] = Header(None),
    x_tenant_domain: Optional[str] = Header(None, alias="X-Tenant-Domain"),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Domain-based tenant detection endpoint.
    Resolves incoming hostname / custom domain to tenant branding, custom markup, and configuration.
    """
    raw_domain = domain or x_tenant_domain or host or "socialpulse.io"
    # Clean domain (strip port if present, lowercase, strip protocol)
    clean_domain = (
        raw_domain.split(":")[0]
        .strip()
        .lower()
        .replace("https://", "")
        .replace("http://", "")
        .rstrip("/")
    )

    # Check if primary platform
    is_main = any(clean_domain == d or clean_domain.endswith(f".{d}") for d in MAIN_PLATFORM_DOMAINS)
    if is_main and not domain:
        return {
            "is_custom_tenant": False,
            "tenant_id": None,
            "domain": clean_domain,
            "status": "active",
            "site_name": "SocialPulse",
            "tagline": "Wholesale Social Media Marketing Platform",
            "logo_url": None,
            "theme_color": "#f59e0b",
            "currency": "KES",
            "contact_email": "support@socialpulse.io"
        }

    # Query child panels by custom domain
    query = await db.execute(
        select(ChildPanel).where(ChildPanel.domain == clean_domain)
    )
    panel = query.scalars().first()

    if not panel:
        return {
            "is_custom_tenant": False,
            "tenant_id": None,
            "domain": clean_domain,
            "status": "not_found",
            "site_name": "SocialPulse",
            "tagline": "Wholesale Social Media Marketing Platform",
            "logo_url": None,
            "theme_color": "#f59e0b",
            "currency": "KES",
            "contact_email": "support@socialpulse.io"
        }

    branding = panel.branding_json or {}
    brand_name = panel.domain.split(".")[0].capitalize()

    return {
        "is_custom_tenant": True,
        "tenant_id": str(panel.id),
        "domain": panel.domain,
        "status": panel.status,
        "is_active": panel.status == ChildPanelStatus.ACTIVE.value,
        "site_name": branding.get("site_name", f"{brand_name} SMM"),
        "tagline": branding.get("tagline", "Premium Social Media Growth"),
        "logo_url": branding.get("logo_url"),
        "theme_color": branding.get("theme_color", "#f59e0b"),
        "currency": panel.currency,
        "contact_email": branding.get("contact_email", f"support@{panel.domain}"),
        "whatsapp_support": branding.get("whatsapp_support"),
        "default_markup_percent": branding.get("default_markup_percent", 100),
        "nameserver1": panel.nameserver1,
        "nameserver2": panel.nameserver2,
        "expires_at": panel.expires_at.isoformat() if panel.expires_at else None
    }
