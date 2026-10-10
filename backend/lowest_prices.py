import asyncio
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:%40Oscar599@localhost:5433/socialpulse_db')
    async with engine.begin() as conn:
        # Check and deactivate any 0-rate rows
        res = await conn.execute(text("UPDATE services SET is_active = false WHERE (provider_rate IS NULL OR provider_rate <= 0.001) AND is_active = true"))
        print(f"Deactivated {res.rowcount} zero-rate rows.")

        print("\n=== DISTINCT ACTIVE PLATFORMS ===")
        r = await conn.execute(text("SELECT platform, count(*) FROM services WHERE is_active = true GROUP BY platform"))
        for row in r.fetchall():
            print(dict(row._mapping))

        print("\n=== CHEAPEST YOUTUBE SERVICES ===")
        r = await conn.execute(text("SELECT provider_service_id, platform, name, provider_rate, wholesale_rate, selling_rate FROM services WHERE is_active = true AND (platform = 'youtube' OR name ILIKE '%youtube%') ORDER BY selling_rate ASC LIMIT 5"))
        for row in r.fetchall():
            d = dict(row._mapping)
            print(f"ID:{d['provider_service_id']:<6} | Prov:{d['provider_rate']:<6} | Sell:{d['selling_rate']:<6} | {d['name'][:50]}")

        print("\n=== CHEAPEST TWITTER / X SERVICES ===")
        r = await conn.execute(text("SELECT provider_service_id, platform, name, provider_rate, wholesale_rate, selling_rate FROM services WHERE is_active = true AND (platform = 'twitter' OR name ILIKE '%twitter%' OR name ILIKE '%tweet%') ORDER BY selling_rate ASC LIMIT 5"))
        for row in r.fetchall():
            d = dict(row._mapping)
            print(f"ID:{d['provider_service_id']:<6} | Prov:{d['provider_rate']:<6} | Sell:{d['selling_rate']:<6} | {d['name'][:50]}")

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
