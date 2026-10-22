from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.child_panel import ChildPanel, ChildPanelStatus

router = APIRouter(prefix="/tenant", tags=["Tenant Resolution"])

MAIN_PLATFORM_DOMAINS = [
    "socialpulse.io",
    "www.socialpulse.io",
    "socialpulsesmm.com",
    "www.socialpulsesmm.com",
    "social-pulse-smm.vercel.app",
    "social-pulse-smm.onrender.com",
    "social-pulse-smm-0geu.onrender.com",
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
    clean_no_www = clean_domain[4:] if clean_domain.startswith("www.") else clean_domain
    clean_with_www = f"www.{clean_no_www}"

    # Check if primary platform
    is_main = any(clean_no_www == d or clean_no_www.endswith(f".{d}") for d in MAIN_PLATFORM_DOMAINS)
    if is_main:
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
            "contact_email": "support@socialpulse.io",
            "google_tag_id": None,
            "meta_pixel_id": None
        }

    # Query child panels by custom domain (flexible matching for root vs www)
    query = await db.execute(
        select(ChildPanel).where(
            or_(
                ChildPanel.domain == clean_domain,
                ChildPanel.domain == clean_no_www,
                ChildPanel.domain == clean_with_www
            )
        )
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
            "contact_email": "support@socialpulse.io",
            "payment_account_name": "PICNIC TECHNOLOGIES",
            "payment_paybill": "997960",
            "payment_account_number": "0010529"
        }

    branding = panel.branding_json or {}
    brand_name = panel.domain.split(".")[0].capitalize()
    is_skake = "skakegains" in panel.domain.lower() or "shakegains" in panel.domain.lower()
    gw = (panel.metadata_json or {}).get("payment_gateway", {})

    pay_name = gw.get("payhero_account_name") or ("shakegains" if is_skake else branding.get("site_name", f"{brand_name} SMM"))
    pay_paybill = gw.get("payhero_paybill", "997960")
    pay_acc = gw.get("payhero_account_number") or ("0010542" if is_skake else "0010529")

    # Instant Expiration Check: If monthly rental (KES 3,500) has expired, suspend immediately
    now_utc = datetime.now(timezone.utc)
    is_expired = False
    if panel.expires_at:
        exp_time = panel.expires_at if panel.expires_at.tzinfo else panel.expires_at.replace(tzinfo=timezone.utc)
        if exp_time < now_utc:
            is_expired = True
            if panel.status == ChildPanelStatus.ACTIVE.value:
                panel.status = ChildPanelStatus.EXPIRED.value
                db.add(panel)
                await db.commit()

    return {
        "is_custom_tenant": True,
        "tenant_id": str(panel.id),
        "domain": panel.domain,
        "status": ChildPanelStatus.EXPIRED.value if is_expired else panel.status,
        "is_active": (panel.status == ChildPanelStatus.ACTIVE.value) and not is_expired,
        "is_expired": is_expired,
        "site_name": branding.get("site_name", f"{brand_name} SMM"),
        "tagline": branding.get("tagline", "Premium Social Media Growth"),
        "logo_url": branding.get("logo_url"),
        "theme_color": branding.get("theme_color", "#10b981" if is_skake else "#f59e0b"),
        "currency": panel.currency,
        "contact_email": branding.get("contact_email", f"support@{panel.domain}"),
        "whatsapp_support": branding.get("whatsapp_support"),
        "whatsapp_channel_url": branding.get("whatsapp_channel_url"),
        "default_markup_percent": branding.get("default_markup_percent", 0),
        "google_tag_id": branding.get("google_tag_id"),
        "meta_pixel_id": branding.get("meta_pixel_id"),
        "nameserver1": panel.nameserver1,
        "nameserver2": panel.nameserver2,
        "expires_at": panel.expires_at.isoformat() if panel.expires_at else None,
        "payment_account_name": pay_name,
        "payment_paybill": pay_paybill,
        "payment_account_number": pay_acc,
    }
