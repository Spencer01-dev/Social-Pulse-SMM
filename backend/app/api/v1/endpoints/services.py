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
    Security: Strictly hides provider IDs and provider cost rates.
    """
    query = (
        select(Service)
        .where(Service.is_active == True)
        .order_by(Service.platform, Service.sort_order, Service.selling_rate)
    )

    if platform:
        query = query.where(Service.platform == platform)
    if category:
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

    # Map to CustomerServiceResponse (renaming selling_rate to rate for customer clarity)
    return [
        CustomerServiceResponse(
            id=s.id,
            platform=s.platform,
            name=s.name,
            description=s.description,
            service_type=s.service_type,
            category=s.category,
            rate=s.selling_rate,
            min_quantity=s.min_quantity,
            max_quantity=s.max_quantity,
            refill_available=s.refill_available,
            cancel_available=s.cancel_available
        )
        for s in services
    ]


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
