import asyncio
import sys
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User


async def reset_balances(target_balance: float = 0.0):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        print(f"[*] Found {len(users)} user(s) in the database.")

        for user in users:
            old_balance = user.balance
            user.balance = target_balance
            print(f"[-] Reset @{user.username} (Role: {user.role}): Ksh {old_balance} -> Ksh {target_balance:.2f}")

        await session.commit()
        print(f"\n[+] Successfully reset all account balances to Ksh {target_balance:.2f}!")


if __name__ == "__main__":
    balance = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0
    asyncio.run(reset_balances(balance))
