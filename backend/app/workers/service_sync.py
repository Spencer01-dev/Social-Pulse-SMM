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

ALLOWED_ACTIVE_PLATFORMS = {
    Platform.TIKTOK,
    Platform.FACEBOOK,
    Platform.INSTAGRAM,
    Platform.WHATSAPP,
    Platform.TELEGRAM,
}


import re


def detect_platform(name: str, category: str) -> Platform:
    """
    Intelligently infer social media platform from service name or category string.
    Uses regex word boundaries to prevent false positives (e.g. 'big base' matching 'ig ').
    """
    text = f"{name} {category}".lower()
    
    if re.search(r'\b(whatsapp|wa)\b', text):
        return Platform.WHATSAPP
    elif re.search(r'\b(tiktok|tik tok)\b', text):
        return Platform.TIKTOK
    elif re.search(r'\b(facebook|fb)\b', text):
        return Platform.FACEBOOK
    elif re.search(r'\b(instagram|ig)\b', text) or "reel" in text:
        return Platform.INSTAGRAM
    elif re.search(r'\b(telegram|tg)\b', text):
        return Platform.TELEGRAM
    elif re.search(r'\b(youtube|yt)\b', text):
        return Platform.YOUTUBE
    elif re.search(r'\b(twitter|tweet|threads)\b', text) or " x " in text:
        return Platform.TWITTER
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
    provider_slug: str = "jap",
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
        # Determine provider metadata based on slug
        if provider_slug in ["jap", "justanotherpanel", "just_another_panel", "just-another-panel"]:
            p_name = "JustAnotherPanel"
            p_url = settings.JAP_API_URL
            p_currency = "USD"
        elif provider_slug in ["secsers", "secsers.com", "secser"]:
            p_name = "Secsers"
            p_url = settings.SECSERS_API_URL
            p_currency = "USD"
        else:
            p_name = provider_slug.capitalize()
            p_url = settings.JAP_API_URL
            p_currency = "USD"

        provider_record = Provider(
            name=p_name,
            slug=provider_slug,
            api_url=p_url,
            is_active=True,
            currency=p_currency,
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
    disabled_count = 0
    active_provider_ids = set()

    # Pre-fetch all existing services for this provider in a single query (prevents N+1 DB round-trips)
    existing_query = await db.execute(
        select(Service).where(Service.provider_id == provider_record.id)
    )
    existing_services_map = {
        svc.provider_service_id: svc for svc in existing_query.scalars().all()
    }

    for item in remote_services:

        active_provider_ids.add(item.service_id)
        existing_service = existing_services_map.get(item.service_id)
        platform_detected = detect_platform(item.name, item.category)

        category_clean = item.category or f"{platform_detected.value.capitalize()} Services"

        # Enforce platform minimum floor of 100 only for non-package services
        is_package_service = (item.type and item.type.lower() == "package") or item.max_quantity <= 1 or ("whatsapp" in item.name.lower() and "number" in item.name.lower())
        platform_min = max(item.min_quantity, 1) if is_package_service else max(item.min_quantity, 100)

        # Convert provider rate to platform base currency (KES) if provider is in USD
        effective_rate = item.rate
        if provider_record.currency == "USD":
            effective_rate = round(item.rate * Decimal(str(settings.DEFAULT_USD_TO_KES)), 2)

        if existing_service:
            # Update provider rates, limits, and platform
            existing_service.platform = platform_detected.value if hasattr(platform_detected, 'value') else str(platform_detected)
            existing_service.name = item.name
            existing_service.category = category_clean
            existing_service.service_type = item.type
            existing_service.provider_rate = effective_rate
            existing_service.min_quantity = platform_min
            existing_service.max_quantity = item.max_quantity
            existing_service.refill_available = item.refill
            existing_service.cancel_available = item.cancel
            is_platform_allowed = platform_detected in ALLOWED_ACTIVE_PLATFORMS
            existing_service.is_active = is_platform_allowed
            if item.description and not existing_service.description:
                existing_service.description = item.description

            if existing_service.markup_type != MarkupType.MANUAL:
                existing_service.selling_rate = calculate_selling_rate(
                    provider_rate=effective_rate,
                    markup_type=existing_service.markup_type,
                    markup_value=existing_service.markup_value
                )
            current_wholesale = float(existing_service.wholesale_rate or 0)
            if current_wholesale <= 0 and effective_rate > 0:
                existing_service.wholesale_rate = round(effective_rate * Decimal("1.32625"), 2)

            db.add(existing_service)
            updated_count += 1
        else:
            # Create new service with default markup
            selling_rate = calculate_selling_rate(
                provider_rate=effective_rate,
                markup_type=MarkupType.PERCENTAGE,
                markup_value=default_markup_percent
            )
            wholesale_rate = round(effective_rate * Decimal("1.32625"), 2)

            is_platform_allowed = platform_detected in ALLOWED_ACTIVE_PLATFORMS
            new_service = Service(
                provider_id=provider_record.id,
                provider_service_id=item.service_id,
                platform=platform_detected.value if hasattr(platform_detected, 'value') else str(platform_detected),
                name=item.name,
                description=item.description,
                service_type=item.type,
                category=category_clean,
                provider_rate=effective_rate,
                wholesale_rate=wholesale_rate,
                selling_rate=selling_rate,
                markup_type=MarkupType.PERCENTAGE,
                markup_value=default_markup_percent,
                min_quantity=platform_min,
                max_quantity=item.max_quantity,
                refill_available=item.refill,
                cancel_available=item.cancel,
                is_active=is_platform_allowed,
            )
            db.add(new_service)
            created_count += 1

    # Auto-disable services that no longer exist on provider
    for svc in existing_services_map.values():
        if svc.provider_service_id not in active_provider_ids and svc.is_active:
            svc.is_active = False
            db.add(svc)
            disabled_count += 1

    await db.commit()
    return len(remote_services), created_count, updated_count
