import uuid
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.service import Platform, Service
from app.schemas.service import CustomerServiceResponse, PlatformSummary

router = APIRouter(prefix="/services", tags=["Services Catalog"])


@router.get("", response_model=List[CustomerServiceResponse])
async def list_public_services(
    platform: Optional[Platform] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    List all active services for customers.
    Security: Strictly hides provider IDs, provider cost rates, and provider branding (Delix Gains).
    """
    query = (
        select(Service)
        .where(
            Service.is_active == True,
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
    query = (
        select(Service.category)
        .where(
            Service.is_active == True,
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
    if platform and platform != Platform.OTHER:
        other_platform_keywords = {
            Platform.TIKTOK: ["facebook", "fb ", "instagram", "ig ", "youtube", "telegram", "twitter"],
            Platform.INSTAGRAM: ["facebook", "fb ", "tiktok", "youtube", "telegram", "twitter"],
            Platform.FACEBOOK: ["instagram", "ig ", "tiktok", "youtube", "telegram", "twitter"],
            Platform.YOUTUBE: ["instagram", "ig ", "tiktok", "facebook", "telegram", "twitter"],
            Platform.TELEGRAM: ["instagram", "ig ", "tiktok", "facebook", "youtube", "twitter"],
            Platform.TWITTER: ["instagram", "ig ", "tiktok", "facebook", "youtube", "telegram"],
        }
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
    return cats


@router.get("/platforms", response_model=List[PlatformSummary])
async def list_available_platforms(db: AsyncSession = Depends(get_db)) -> Any:
    """
    Get summary of all supported platforms and their active service counts.
    """
    platform_icons = {
        Platform.INSTAGRAM: "instagram",
        Platform.FACEBOOK: "facebook",
        Platform.YOUTUBE: "youtube",
        Platform.TIKTOK: "music-2",
        Platform.TWITTER: "twitter",
        Platform.TELEGRAM: "send",
        Platform.SPOTIFY: "headphones",
        Platform.DISCORD: "message-square",
        Platform.TWITCH: "tv",
        Platform.OTHER: "globe",
    }

    # Count active services per platform
    query = (
        select(Service.platform, func.count(Service.id))
        .where(Service.is_active == True)
        .group_by(Service.platform)
    )
    result = await db.execute(query)
    counts = dict(result.all())

    summaries = []
    for p in Platform:
        count = counts.get(p, 0)
        # Always include popular platforms or platforms with services
        if count > 0 or p in [Platform.INSTAGRAM, Platform.FACEBOOK, Platform.YOUTUBE, Platform.TIKTOK]:
            summaries.append(
                PlatformSummary(
                    platform=p,
                    name=p.value.capitalize() if p != Platform.OTHER else "Other Services",
                    icon=platform_icons.get(p, "globe"),
                    service_count=count
                )
            )

    return summaries


@router.get("/{service_id}", response_model=CustomerServiceResponse)
async def get_service_details(
    service_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Fetch a single service by ID.
    """
    result = await db.execute(
        select(Service).where(Service.id == service_id, Service.is_active == True)
    )
    service = result.scalars().first()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found or inactive"
        )

    return CustomerServiceResponse(
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
