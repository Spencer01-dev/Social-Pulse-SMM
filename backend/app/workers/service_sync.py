import re
import uuid
from decimal import Decimal
from typing import Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.provider import Provider
from app.models.service import MarkupType, Platform, Service
from app.providers.manager import get_provider


def detect_platform(name: str, category: str) -> Platform:
    """
    Intelligently infer social media platform from service name or category string.
    Ensures extensibility without hardcoded application logic.
    """
    text = f"{name} {category}".lower()
    
    if "instagram" in text or "ig " in text:
        return Platform.INSTAGRAM
    elif "facebook" in text or "fb " in text:
        return Platform.FACEBOOK
    elif "youtube" in text or "yt " in text:
        return Platform.YOUTUBE
    elif "tiktok" in text:
        return Platform.TIKTOK
    elif "twitter" in text or " x " in text or "tweet" in text:
        return Platform.TWITTER
    elif "telegram" in text:
        return Platform.TELEGRAM
    elif "spotify" in text:
        return Platform.SPOTIFY
    elif "discord" in text:
        return Platform.DISCORD
    elif "twitch" in text:
        return Platform.TWITCH
    return Platform.OTHER


def calculate_selling_rate(
    provider_rate: Decimal,
    markup_type: MarkupType,
    markup_value: Decimal,
    min_selling_rate: Decimal = Decimal("5.00")
) -> Decimal:
    """
    Compute customer selling rate based on provider rate and markup rules.
    Example:
    Provider cost: KSh 100
    Markup: 100% -> Customer price: KSh 200
    """
    if markup_type == MarkupType.PERCENTAGE:
        calculated = provider_rate * (Decimal("1.00") + (markup_value / Decimal("100.00")))
    elif markup_type == MarkupType.FIXED_AMOUNT:
        calculated = provider_rate + markup_value
    else:  # MANUAL
        calculated = provider_rate

    # Enforce minimum threshold and round to 2 decimal places
    final_price = max(calculated, min_selling_rate)
    return round(final_price, 2)


async def sync_services_from_provider(
    db: AsyncSession,
    provider_slug: str = "delix",
    default_markup_percent: Decimal = Decimal("80.00")
) -> Tuple[int, int, int]:
    """
    Fetch services from provider and atomic upsert into PostgreSQL.
    Returns: (total_fetched, created_count, updated_count)
    """
    # 1. Get or create Provider record in database
    provider_query = await db.execute(select(Provider).where(Provider.slug == provider_slug))
    provider_record = provider_query.scalars().first()

    if not provider_record:
        provider_record = Provider(
            name="Delix Gains KE" if provider_slug in ["delix", "delixgains"] else "Sandbox Mock Provider",
            slug=provider_slug,
            api_url=settings.DELIX_API_URL,
            is_active=True,
            currency="KES",
            balance=Decimal("0.00")
        )
        db.add(provider_record)
        await db.commit()
        await db.refresh(provider_record)

    # 2. Fetch live services from provider
    provider_client = get_provider(slug=provider_slug)
    remote_services = await provider_client.get_services()

    # Also update provider live balance in background
    try:
        live_balance = await provider_client.get_balance()
        provider_record.balance = live_balance.balance
        provider_record.currency = live_balance.currency
    except Exception as err:
        print(f"Could not fetch provider balance: {err}")

    created_count = 0
    updated_count = 0
    active_provider_ids = set()

    for item in remote_services:
        active_provider_ids.add(item.service_id)

        # Check if service already exists locally for this provider
        query = await db.execute(
            select(Service).where(
                Service.provider_id == provider_record.id,
                Service.provider_service_id == item.service_id
            )
        )
        existing_service = query.scalars().first()
        platform_detected = detect_platform(item.name, item.category)

        category_clean = item.category or f"{platform_detected.value.capitalize()} Services"

        # Enforce platform minimum floor of 100
        platform_min = max(item.min_quantity, 100)

        if existing_service:
            # Update provider rates and limits, keep customized selling prices if set to manual
            existing_service.name = item.name
            existing_service.category = category_clean
            existing_service.service_type = item.type
            existing_service.provider_rate = item.rate
            existing_service.min_quantity = platform_min
            existing_service.max_quantity = item.max_quantity
            existing_service.refill_available = item.refill
            existing_service.cancel_available = item.cancel
            existing_service.is_active = True  # Re-enable if it came back
            if item.description and not existing_service.description:
                existing_service.description = item.description

            if existing_service.markup_type != MarkupType.MANUAL:
                existing_service.selling_rate = calculate_selling_rate(
                    provider_rate=item.rate,
                    markup_type=existing_service.markup_type,
                    markup_value=existing_service.markup_value
                )

            db.add(existing_service)
            updated_count += 1
        else:
            # Create new service with default markup
            selling_rate = calculate_selling_rate(
                provider_rate=item.rate,
                markup_type=MarkupType.PERCENTAGE,
                markup_value=default_markup_percent
            )

            new_service = Service(
                provider_id=provider_record.id,
                provider_service_id=item.service_id,
                platform=platform_detected,
                name=item.name,
                description=item.description,
                service_type=item.type,
                category=category_clean,
                provider_rate=item.rate,
                selling_rate=selling_rate,
                markup_type=MarkupType.PERCENTAGE,
                markup_value=default_markup_percent,
                min_quantity=platform_min,
                max_quantity=item.max_quantity,
                refill_available=item.refill,
                cancel_available=item.cancel,
                is_active=True,
            )
            db.add(new_service)
            created_count += 1

    # Auto-disable services that no longer exist on Delix Gains
    disabled_count = 0
    all_local = await db.execute(
        select(Service).where(
            Service.provider_id == provider_record.id,
            Service.is_active == True
        )
    )
    for svc in all_local.scalars().all():
        if svc.provider_service_id not in active_provider_ids:
            svc.is_active = False
            db.add(svc)
            disabled_count += 1

    await db.commit()
    return len(remote_services), created_count, updated_count
