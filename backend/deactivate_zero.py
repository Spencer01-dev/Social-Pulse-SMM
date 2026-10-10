import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:%40Oscar599@localhost:5433/socialpulse_db')
    async with engine.begin() as conn:
        await conn.execute(text("""
            UPDATE services 
            SET is_active = false 
            WHERE provider_service_id IN ('5108', '7813', '10439', '5093')
               OR provider_rate <= 0.001
        """))
        print("Updated 0-rate services to inactive.")
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
