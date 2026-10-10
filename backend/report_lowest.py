import asyncio
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:%40Oscar599@localhost:5433/socialpulse_db')
    async with engine.connect() as conn:
        print("=== 1. TOP 10 LOWEST PRICED SERVICES OVERALL ===")
        r = await conn.execute(text("""
            SELECT provider_service_id, platform, category, name, provider_rate, wholesale_rate, selling_rate, min_quantity, max_quantity
            FROM services
            WHERE is_active = true
            ORDER BY selling_rate ASC, provider_rate ASC
            LIMIT 10
        """))
        for row in r.fetchall():
            d = dict(row._mapping)
            clean_name = d['name'][:50].encode('ascii', 'ignore').decode('ascii')
            profit = float(d['selling_rate']) - float(d['provider_rate'])
            margin = (profit / float(d['provider_rate'])) * 100 if float(d['provider_rate']) > 0 else 0
            print(f"#{d['provider_service_id']:<6} | {d['platform']:<10} | Prov: KES {d['provider_rate']:<5} | WS: KES {d['wholesale_rate']:<5} | Sell: KES {d['selling_rate']:<5} | Profit: +KES {profit:<4.2f} ({margin:.0f}%) | Min:{d['min_quantity']} | {clean_name}")

        print("\n=== 2. LOWEST PRICED BY PLATFORM ===")
        for plat in ['tiktok', 'instagram', 'facebook', 'telegram', 'whatsapp']:
            r = await conn.execute(text(f"""
                SELECT provider_service_id, platform, category, name, provider_rate, wholesale_rate, selling_rate, min_quantity, max_quantity
                FROM services
                WHERE is_active = true AND platform = '{plat}'
                ORDER BY selling_rate ASC, provider_rate ASC
                LIMIT 5
            """))
            print(f"\n--- {plat.upper()} ---")
            for row in r.fetchall():
                d = dict(row._mapping)
                clean_name = d['name'][:50].encode('ascii', 'ignore').decode('ascii')
                profit = float(d['selling_rate']) - float(d['provider_rate'])
                margin = (profit / float(d['provider_rate'])) * 100 if float(d['provider_rate']) > 0 else 0
                print(f"#{d['provider_service_id']:<6} | Prov: KES {d['provider_rate']:<5} | WS: KES {d['wholesale_rate']:<5} | Sell: KES {d['selling_rate']:<5} | Profit: +KES {profit:<4.2f} ({margin:.0f}%) | Min:{d['min_quantity']} | {clean_name}")

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
