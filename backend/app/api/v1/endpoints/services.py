import uuid
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache, set_cache
from app.core.database import get_db
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
    platform: Optional[Platform] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    List active services for customers strictly for allowed platforms:
    TikTok, Facebook, Instagram, WhatsApp, and Telegram.
    Security: Strictly hides provider IDs, provider cost rates, and provider branding (Delix Gains).
    High performance: in-memory cached responses for instant retrieval.
    """
    # Check cache for non-search requests
    cache_key = None
    if not search:
        p_str = platform.value if platform else "all"
        c_str = category if category else "all"
        cache_key = f"pub_services_{p_str}_{c_str}"
        cached_result = get_cache(cache_key)
        if cached_result is not None:
            return cached_result

    query = (
        select(Service)
        .where(
            Service.is_active == True,
            Service.platform.in_(ALLOWED_PUBLIC_PLATFORMS),
            ~Service.name.ilike("%delix%"),
            ~Service.category.ilike("%delix%")
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
    for s in services:
        name_clean = s.name.replace("delix gains", "Social Pulse").replace("Delix Gains", "Social Pulse").replace("delix", "Social Pulse").replace("Delix", "Social Pulse")
        desc_clean = (s.description or "").replace("delix gains", "Social Pulse").replace("Delix Gains", "Social Pulse").replace("delix", "Social Pulse").replace("Delix", "Social Pulse")
        clean_services.append(
            CustomerServiceResponse(
                id=s.id,
                provider_service_id=s.provider_service_id,
                platform=s.platform,
                name=name_clean,
                description=desc_clean if desc_clean else None,
                service_type=s.service_type,
                category=s.category,
                rate=s.selling_rate,
                min_quantity=s.min_quantity,
                max_quantity=s.max_quantity,
                refill_available=s.refill_available,
                cancel_available=s.cancel_available
            )
        )

    if cache_key:
        set_cache(cache_key, clean_services, ttl_seconds=300)

    return clean_services


@router.get("/categories", response_model=List[str])
async def list_available_categories(
    platform: Optional[Platform] = None,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Get distinct categories, optionally filtered by platform.
    Strictly filters out provider branding (Delix Gains) and ensures platform-relevance.
    """
    cache_key = f"pub_cats_{platform.value if platform else 'all'}"
    cached = get_cache(cache_key)
    if cached is not None:
        return cached

    query = (
        select(Service.category)
        .where(
            Service.is_active == True,
            Service.platform.in_(ALLOWED_PUBLIC_PLATFORMS),
            ~Service.category.ilike("%delix%"),
            ~Service.name.ilike("%delix%")
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
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Fetch a single service by ID.
    """
    cache_key = f"pub_service_{service_id}"
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

    res = CustomerServiceResponse(
        id=service.id,
        provider_service_id=service.provider_service_id,
        platform=service.platform,
        name=service.name,
        description=service.description,
        service_type=service.service_type,
        category=service.category,
        rate=service.selling_rate,
        min_quantity=service.min_quantity,
        max_quantity=service.max_quantity,
        refill_available=service.refill_available,
        cancel_available=service.cancel_available
    )
    set_cache(cache_key, res, ttl_seconds=300)
    return res
