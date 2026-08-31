import asyncio
from decimal import Decimal
from app.core.database import AsyncSessionLocal
from app.workers.service_sync import sync_services_from_provider


async def run():
    print("[*] Contacting Delix Gains KE API and syncing live services into database...")
    async with AsyncSessionLocal() as session:
        total, created, updated = await sync_services_from_provider(
            session,
            provider_slug="delix",
            default_markup_percent=Decimal("50.00")
        )
        print(f"[+] Successfully synced {total} live services from Delix Gains KE! ({created} created, {updated} updated)")


if __name__ == "__main__":
    asyncio.run(run())
