import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine("postgresql+asyncpg://postgres:%40Oscar599@localhost:5433/socialpulse_db")
    async with engine.connect() as conn:
        r = await conn.execute(text(
            "SELECT id, name, provider_rate, selling_rate, wholesale_rate, markup_type, markup_value, provider_service_id "
            "FROM services WHERE provider_service_id = '7481' LIMIT 5"
        ))
        rows = r.fetchall()
        if not rows:
            print("No service found with provider_service_id=7481, trying name search...")
            r = await conn.execute(text(
                "SELECT id, name, provider_rate, selling_rate, wholesale_rate, markup_type, markup_value, provider_service_id "
                "FROM services WHERE name ILIKE '%Super Fast%Max 100M%' LIMIT 5"
            ))
            rows = r.fetchall()
        
        for row in rows:
            d = dict(row._mapping)
            print(f"Service: {d['name']}")
            print(f"  Provider Service ID: {d['provider_service_id']}")
            print(f"  Provider Rate (cost to you): KSh {d['provider_rate']}")
            print(f"  Selling Rate (your price):   KSh {d['selling_rate']}")
            print(f"  Wholesale Rate:              KSh {d['wholesale_rate']}")
            print(f"  Markup Type: {d['markup_type']}")
            print(f"  Markup Value: {d['markup_value']}")
            if d['provider_rate'] and d['selling_rate']:
                profit = float(d['selling_rate']) - float(d['provider_rate'])
                margin = (profit / float(d['provider_rate'])) * 100 if float(d['provider_rate']) > 0 else 0
                print(f"  YOUR PROFIT: KSh {profit:.4f} per 1000 ({margin:.1f}% margin)")
            print()
    await engine.dispose()

asyncio.run(main())
