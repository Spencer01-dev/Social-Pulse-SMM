import asyncio
from decimal import Decimal
import uuid
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # Ensures all models and FK tables are loaded
from app.models.user import User
from app.models.transaction import Transaction, TransactionType, PaymentMethod, TransactionStatus

TEST_AMOUNT = Decimal("50000.00")

async def add_test_funds():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        print(f"Found {len(users)} users.")
        
        for u in users:
            old_balance = Decimal(str(u.balance or 0.00))
            new_balance = old_balance + TEST_AMOUNT
            u.balance = new_balance
            
            tx = Transaction(
                user_id=u.id,
                type=TransactionType.MANUAL_ADJUSTMENT,
                amount=TEST_AMOUNT,
                balance_before=old_balance,
                balance_after=new_balance,
                currency="KES",
                payment_method=PaymentMethod.MANUAL,
                payment_reference=f"TEST-FUND-{uuid.uuid4().hex[:8].upper()}",
                status=TransactionStatus.COMPLETED,
                description="Test funds credited for testing child panel & platform services",
                metadata_json={"source": "add_test_funds", "amount": float(TEST_AMOUNT)}
            )
            session.add(u)
            session.add(tx)
            print(f"Credited {u.username} ({u.email}): {old_balance} -> {new_balance} KES")
        
        await session.commit()
        print("Successfully committed test funds to all users!")

if __name__ == "__main__":
    asyncio.run(add_test_funds())
