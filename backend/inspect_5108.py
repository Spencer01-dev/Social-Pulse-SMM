import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:%40Oscar599@localhost:5433/socialpulse_db')
    async with engine.connect() as conn:
        r = await conn.execute(text("SELECT id, provider_service_id, platform, name, provider_rate, is_active FROM services WHERE provider_service_id = '5108'"))
        for row in r.fetchall():
            print(dict(row._mapping))
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
