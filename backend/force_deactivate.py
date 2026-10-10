import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:%40Oscar599@localhost:5433/socialpulse_db')
    async with engine.begin() as conn:
        # Force deactivate the 4 specific zero-rate services
        r = await conn.execute(text("""
            UPDATE services 
            SET is_active = false 
            WHERE provider_service_id IN ('5108', '7813', '10439', '5093')
        """))
        print(f"Deactivated {r.rowcount} specific zero-rate services.")
        
        # Also catch any remaining services with provider_rate = 0 or NULL
        r2 = await conn.execute(text("""
            UPDATE services 
            SET is_active = false 
            WHERE is_active = true AND (provider_rate IS NULL OR provider_rate = 0 OR provider_rate <= 0.001)
        """))
        print(f"Deactivated {r2.rowcount} additional zero/null-rate services.")
        
        # Verify
        r3 = await conn.execute(text("""
            SELECT provider_service_id, name, provider_rate, is_active 
            FROM services 
            WHERE provider_service_id IN ('5108', '7813', '10439', '5093')
        """))
        for row in r3.fetchall():
            d = dict(row._mapping)
            print(f"  #{d['provider_service_id']} is_active={d['is_active']} provider_rate={d['provider_rate']}")
    
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
