import uuid
from decimal import Decimal
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.provider import Provider
from app.models.service import MarkupType, Platform, Service
from app.models.user import User, UserRole
from app.providers.manager import get_provider
from app.schemas.service import (
    AdminServiceResponse,
    BulkMarkupRequest,
    ServiceUpdate,
    SyncServicesResponse,
)
from app.workers.service_sync import calculate_selling_rate, sync_services_from_provider

router = APIRouter(prefix="/admin/services", tags=["Admin Services Management"])


@router.get("", response_model=List[AdminServiceResponse])
async def list_admin_services(
    platform: Optional[Platform] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    List all services with provider rate, selling rate, and calculated profit margins.
    """
    query = select(Service).order_by(Service.platform, Service.sort_order).offset(skip).limit(limit)

    if platform:
        query = query.where(Service.platform == platform)
    if is_active is not None:
        query = query.where(Service.is_active == is_active)
    if search:
        pattern = f"%{search.lower()}%"
        query = query.where(
            (Service.name.ilike(pattern)) |
            (Service.category.ilike(pattern)) |
            (Service.provider_service_id.ilike(pattern))
        )

    result = await db.execute(query)
    services = result.scalars().all()

    return [
        AdminServiceResponse(
            id=s.id,
            provider_id=s.provider_id,
            provider_service_id=s.provider_service_id,
            platform=s.platform,
            name=s.name,
            description=s.description,
            service_type=s.service_type,
            category=s.category,
            provider_rate=s.provider_rate,
            selling_rate=s.selling_rate,
            profit_margin=round(s.selling_rate - s.provider_rate, 2),
            markup_type=s.markup_type,
            markup_value=s.markup_value,
            min_quantity=s.min_quantity,
            max_quantity=s.max_quantity,
            refill_available=s.refill_available,
            cancel_available=s.cancel_available,
            is_active=s.is_active,
            sort_order=s.sort_order,
            created_at=s.created_at,
            updated_at=s.updated_at
        )
        for s in services
    ]


@router.post("/sync", response_model=SyncServicesResponse)
async def sync_services(
    provider_slug: str = "delix",
    default_markup: Decimal = Query(Decimal("80.00"), ge=0, description="Default markup % for new services"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Synchronize services from external provider (Delix Gains / Mock).
    """
    try:
        total, created, updated = await sync_services_from_provider(
            db=db,
            provider_slug=provider_slug,
            default_markup_percent=default_markup
        )
        return SyncServicesResponse(
            provider_slug=provider_slug,
            total_fetched=total,
            created=created,
            updated=updated,
            message=f"Successfully synced {total} services from {provider_slug} ({created} added, {updated} updated)."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Service synchronization failed: {str(e)}"
        )


@router.patch("/{service_id}", response_model=AdminServiceResponse)
async def update_service(
    service_id: uuid.UUID,
    service_in: ServiceUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Update service details, selling price, active status, or markup rule.
    """
    result = await db.execute(select(Service).where(Service.id == service_id))
    service = result.scalars().first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    if service_in.name is not None:
        service.name = service_in.name
    if service_in.description is not None:
        service.description = service_in.description
    if service_in.min_quantity is not None:
        service.min_quantity = service_in.min_quantity
    if service_in.max_quantity is not None:
        service.max_quantity = service_in.max_quantity
    if service_in.is_active is not None:
        service.is_active = service_in.is_active
    if service_in.platform is not None:
        service.platform = service_in.platform
    if service_in.category is not None:
        service.category = service_in.category

    # Handle price or markup updates
    if service_in.markup_type is not None:
        service.markup_type = service_in.markup_type
    if service_in.markup_value is not None:
        service.markup_value = service_in.markup_value

    if service_in.selling_rate is not None:
        service.selling_rate = service_in.selling_rate
        service.markup_type = MarkupType.MANUAL
    elif service_in.markup_type or service_in.markup_value:
        service.selling_rate = calculate_selling_rate(
            provider_rate=service.provider_rate,
            markup_type=service.markup_type,
            markup_value=service.markup_value
        )

    db.add(service)
    await db.commit()
    await db.refresh(service)

    return AdminServiceResponse(
        id=service.id,
        provider_id=service.provider_id,
        provider_service_id=service.provider_service_id,
        platform=service.platform,
        name=service.name,
        description=service.description,
        service_type=service.service_type,
        category=service.category,
        provider_rate=service.provider_rate,
        selling_rate=service.selling_rate,
        profit_margin=round(service.selling_rate - service.provider_rate, 2),
        markup_type=service.markup_type,
        markup_value=service.markup_value,
        min_quantity=service.min_quantity,
        max_quantity=service.max_quantity,
        refill_available=service.refill_available,
        cancel_available=service.cancel_available,
        is_active=service.is_active,
        sort_order=service.sort_order,
        created_at=service.created_at,
        updated_at=service.updated_at
    )


@router.post("/bulk-markup")
async def apply_bulk_markup(
    req: BulkMarkupRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Apply a bulk markup percentage or fixed amount across an entire platform or category.
    """
    query = select(Service)
    if req.platform:
        query = query.where(Service.platform == req.platform)
    if req.category:
        query = query.where(Service.category.ilike(f"%{req.category}%"))

    result = await db.execute(query)
    services = result.scalars().all()

    for s in services:
        s.markup_type = req.markup_type
        s.markup_value = req.markup_value
        s.selling_rate = calculate_selling_rate(
            provider_rate=s.provider_rate,
            markup_type=req.markup_type,
            markup_value=req.markup_value
        )
        db.add(s)

    await db.commit()
    return {
        "message": f"Successfully updated markup on {len(services)} services",
        "affected_count": len(services),
        "markup_type": req.markup_type.value,
        "markup_value": float(req.markup_value)
    }


@router.get("/provider-balance")
async def get_provider_live_balance(
    provider_slug: str = "delix",
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Query live balance directly from provider API.
    """
    try:
        provider_client = get_provider(slug=provider_slug)
        balance_info = await provider_client.get_balance()
        return {
            "provider": provider_slug,
            "balance": float(balance_info.balance),
            "currency": balance_info.currency,
            "status": "connected"
        }
    except Exception as e:
        return {
            "provider": provider_slug,
            "balance": 0.0,
            "currency": "KES",
            "status": "offline",
            "error": str(e)
        }
