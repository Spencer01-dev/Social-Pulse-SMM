import asyncio
import sys
sys.path.insert(0, r"c:\Users\SPENCER\Desktop\SMM\backend")

from sqlalchemy import text
from app.core.database import engine

async def check():
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='services';"))
        cols = [r[0] for r in res.fetchall()]
        print("Services columns in local DB:", cols)
        if "wholesale_rate" not in cols:
            print("[+] Adding wholesale_rate to services table...")
            await conn.execute(text("ALTER TABLE services ADD COLUMN wholesale_rate NUMERIC(12, 2) DEFAULT 0.00;"))
            print("[✓] wholesale_rate column added successfully.")
        else:
            print("[✓] wholesale_rate already present in local DB.")

if __name__ == "__main__":
    asyncio.run(check())
