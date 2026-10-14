import uuid
from decimal import Decimal
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.tenant import MAIN_PLATFORM_DOMAINS
from app.core.cache import get_cache, set_cache
from app.core.database import get_db
from app.models.child_panel import ChildPanel
from app.models.child_panel_service import ChildPanelServiceConfig
from app.models.service import Platform, Service
from app.schemas.service import CustomerServiceResponse, PlatformSummary

router = APIRouter(prefix="/services", tags=["Services Catalog"])

ALLOWED_PUBLIC_PLATFORMS = [
    Platform.TIKTOK,
    Platform.FACEBOOK,
    Platform.INSTAGRAM,
    Platform.WHATSAPP,
    Platform.TELEGRAM,
]


@router.get("", response_model=List[CustomerServiceResponse])
async def list_public_services(
    request: Request,
    platform: Optional[Platform] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    x_tenant_domain: Optional[str] = Header(None, alias="X-Tenant-Domain"),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    List active services for customers strictly for allowed platforms:
    TikTok, Facebook, Instagram, WhatsApp, and Telegram.
    Security: Strictly hides provider IDs and provider cost rates.
    High performance: in-memory cached responses for instant retrieval.
    Child panels display the same retail price as the parent panel.
    Their profit comes from wholesale gap (wholesale_rate vs selling_rate).
    """
    # Resolve child panel context for caching purposes
    tenant_domain = None
    raw_domain = x_tenant_domain or request.headers.get("x-tenant-domain") or request.headers.get("X-Tenant-Domain")
    if raw_domain:
        clean_domain = (
            raw_domain.split(":")[0]
            .strip()
            .lower()
            .replace("https://", "")
            .replace("http://", "")
            .rstrip("/")
        )
        is_main = any(clean_domain == d or clean_domain.endswith(f".{d}") for d in MAIN_PLATFORM_DOMAINS)
        if not is_main:
            tenant_domain = clean_domain

    # Check cache for non-search requests
    cache_key = None
    if not search:
        p_str = platform.value if platform else "all"
        c_str = category if category else "all"
        t_str = tenant_domain if tenant_domain else "main"
        cache_key = f"pub_services_{t_str}_{p_str}_{c_str}"
        cached_result = get_cache(cache_key)
        if cached_result is not None:
            return cached_result

    query = (
        select(Service)
        .where(
            Service.is_active == True,
            Service.platform.in_(ALLOWED_PUBLIC_PLATFORMS),
            Service.provider_rate > Decimal("0.00"),
            Service.selling_rate > Service.provider_rate
        )
        .order_by(Service.platform, Service.sort_order, Service.selling_rate)
    )

    if platform:
        query = query.where(Service.platform == platform)
    if category and category != "all":
        query = query.where(Service.category.ilike(f"%{category}%"))
    if search:
        pattern = f"%{search.lower()}%"
        query = query.where(
            (Service.name.ilike(pattern)) |
            (Service.category.ilike(pattern)) |
            (Service.description.ilike(pattern))
        )

    result = await db.execute(query)
    services = result.scalars().all()

    clean_services = []
    tenant_markup_percent = Decimal("0")
    panel_record = None
    if tenant_domain:
        panel_q = await db.execute(
            select(ChildPanel).where(ChildPanel.domain == tenant_domain)
        )
        panel_record = panel_q.scalars().first()
        if panel_record and panel_record.branding_json:
            try:
                tenant_markup_percent = Decimal(str(panel_record.branding_json.get("default_markup_percent", 0)))
            except Exception:
                tenant_markup_percent = Decimal("0")

    # Fetch per-panel disabled service IDs (only for tenant contexts)
    disabled_service_ids: set = set()
    if panel_record and services:
        svc_ids = [s.id for s in services]
        cfg_q = await db.execute(
            select(ChildPanelServiceConfig.service_id).where(
                ChildPanelServiceConfig.panel_id == panel_record.id,
                ChildPanelServiceConfig.service_id.in_(svc_ids),
                ChildPanelServiceConfig.is_enabled == False
            )
        )
        disabled_service_ids = {str(row[0]) for row in cfg_q.all()}

    # Fetch per-service custom markups for this panel
    custom_markups: dict = {}
    if panel_record and services:
        svc_ids = [s.id for s in services]
        markup_q = await db.execute(
            select(ChildPanelServiceConfig.service_id, ChildPanelServiceConfig.custom_markup_percent).where(
                ChildPanelServiceConfig.panel_id == panel_record.id,
                ChildPanelServiceConfig.service_id.in_(svc_ids),
                ChildPanelServiceConfig.custom_markup_percent.isnot(None)
            )
        )
        custom_markups = {str(row[0]): Decimal(str(row[1])) for row in markup_q.all()}

    for s in services:
        # Skip disabled services for this panel
        if str(s.id) in disabled_service_ids:
            continue

        ws = s.wholesale_rate if (s.wholesale_rate and s.wholesale_rate > Decimal("0")) else round(s.provider_rate * Decimal("1.30"), 2)

        # Apply per-service custom markup if set, else fall back to panel default
        svc_custom = custom_markups.get(str(s.id))
        if svc_custom is not None:
            effective_rate = round(ws * (Decimal("1") + (svc_custom / Decimal("100"))), 2)
        elif tenant_markup_percent > Decimal("0"):
            # Child panel client price: wholesale_rate marked up by tenant's configured margin
            effective_rate = round(ws * (Decimal("1") + (tenant_markup_percent / Decimal("100"))), 2)
        else:
            effective_rate = s.selling_rate

        clean_services.append(
            CustomerServiceResponse(
                id=s.id,
                provider_service_id=s.provider_service_id,
                platform=s.platform,
                name=s.name,
                description=s.description if s.description else None,
                service_type=s.service_type,
                category=s.category,
                rate=effective_rate,
                wholesale_rate=ws,
                min_quantity=s.min_quantity,
                max_quantity=s.max_quantity,
                refill_available=s.refill_available,
                cancel_available=s.cancel_available
            )
        )

    if cache_key:
        set_cache(cache_key, clean_services, ttl_seconds=60)

    return clean_services


@router.get("/categories", response_model=List[str])
async def list_available_categories(
    platform: Optional[Platform] = None,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Get distinct categories, optionally filtered by platform.
    Ensures platform-relevance.
    """
    cache_key = f"pub_cats_{platform.value if platform else 'all'}"
    cached = get_cache(cache_key)
    if cached is not None:
        return cached

    query = (
        select(Service.category)
        .where(
            Service.is_active == True,
            Service.platform.in_(ALLOWED_PUBLIC_PLATFORMS)
        )
    )
    if platform:
        query = query.where(Service.platform == platform)

    query = query.distinct().order_by(Service.category)
    result = await db.execute(query)
    cats = [row[0] for row in result.all() if row[0]]

    # Ensure categories for specific platforms only contain relevant keywords
    other_platform_keywords = {
        Platform.TIKTOK: ["facebook", "fb ", "instagram", "ig ", "youtube", "telegram", "twitter"],
        Platform.INSTAGRAM: ["facebook", "fb ", "tiktok", "youtube", "telegram", "twitter"],
        Platform.FACEBOOK: ["instagram", "ig ", "tiktok", "youtube", "telegram", "twitter"],
        Platform.TELEGRAM: ["instagram", "ig ", "tiktok", "facebook", "youtube", "twitter"],
        Platform.WHATSAPP: ["instagram", "ig ", "tiktok", "facebook", "youtube", "telegram"],
    }
    if platform and platform in other_platform_keywords:
        forbidden = other_platform_keywords.get(platform, [])
        if forbidden:
            cats = [
                c for c in cats
                if not any(f in c.lower() for f in forbidden)
            ]

    def category_sort_key(cat: str):
        c = cat.lower()
        if "like" in c:
            return (0, cat)
        elif "follower" in c:
            return (1, cat)
        elif "view" in c:
            return (2, cat)
        elif "comment" in c:
            return (3, cat)
        elif "share" in c or "repost" in c:
            return (4, cat)
        return (5, cat)

    cats.sort(key=category_sort_key)
    set_cache(cache_key, cats, ttl_seconds=300)
    return cats


@router.get("/platforms", response_model=List[PlatformSummary])
async def list_available_platforms(db: AsyncSession = Depends(get_db)) -> Any:
    """
    Get summary of supported platforms (TikTok, Facebook, Instagram, WhatsApp, Telegram) and service counts.
    """
    cache_key = "pub_platforms"
    cached = get_cache(cache_key)
    if cached is not None:
        return cached

    platform_icons = {
        Platform.TIKTOK: "music-2",
        Platform.FACEBOOK: "facebook",
        Platform.INSTAGRAM: "instagram",
        Platform.WHATSAPP: "message-square",
        Platform.TELEGRAM: "send",
    }

    # Count active services per platform
    query = (
        select(Service.platform, func.count(Service.id))
        .where(
            Service.is_active == True,
            Service.platform.in_(ALLOWED_PUBLIC_PLATFORMS)
        )
        .group_by(Service.platform)
    )
    result = await db.execute(query)
    counts = dict(result.all())

    summaries = []
    for p in ALLOWED_PUBLIC_PLATFORMS:
        count = counts.get(p, 0)
        summaries.append(
            PlatformSummary(
                platform=p,
                name="WhatsApp" if p == Platform.WHATSAPP else p.value.capitalize(),
                icon=platform_icons.get(p, "globe"),
                service_count=count
            )
        )

    set_cache(cache_key, summaries, ttl_seconds=300)
    return summaries


@router.get("/{service_id}", response_model=CustomerServiceResponse)
async def get_service_details(
    service_id: uuid.UUID,
    request: Request,
    x_tenant_domain: Optional[str] = Header(None, alias="X-Tenant-Domain"),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Fetch a single service by ID. Child panels see the same retail price as the parent panel.
    """
    tenant_domain = None
    raw_domain = x_tenant_domain or request.headers.get("x-tenant-domain") or request.headers.get("X-Tenant-Domain")
    if raw_domain:
        clean_domain = (
            raw_domain.split(":")[0]
            .strip()
            .lower()
            .replace("https://", "")
            .replace("http://", "")
            .rstrip("/")
        )
        is_main = any(clean_domain == d or clean_domain.endswith(f".{d}") for d in MAIN_PLATFORM_DOMAINS)
        if not is_main:
            tenant_domain = clean_domain

    cache_key = f"pub_service_{tenant_domain or 'main'}_{service_id}"
    cached = get_cache(cache_key)
    if cached is not None:
        return cached

    result = await db.execute(
        select(Service).where(Service.id == service_id, Service.is_active == True)
    )
    service = result.scalars().first()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found or inactive"
        )

    # Same retail price for child panels — no markup inflation
    effective_rate = service.selling_rate

    res = CustomerServiceResponse(
        id=service.id,
        provider_service_id=service.provider_service_id,
        platform=service.platform,
        name=service.name,
        description=service.description,
        service_type=service.service_type,
        category=service.category,
        rate=effective_rate,
        wholesale_rate=service.wholesale_rate,
        min_quantity=service.min_quantity,
        max_quantity=service.max_quantity,
        refill_available=service.refill_available,
        cancel_available=service.cancel_available
    )
    set_cache(cache_key, res, ttl_seconds=60)
    return res
