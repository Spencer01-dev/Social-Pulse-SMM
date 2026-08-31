import asyncio
import uuid
from app.core.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from sqlalchemy import select, delete

async def test_reg():
    async with AsyncSessionLocal() as db:
        try:
            # Clean test user if exists
            await db.execute(delete(User).where(User.email == "admin@socialpulse.io"))
            await db.commit()

            u = User(
                id=uuid.uuid4(),
                email="admin@socialpulse.io",
                username="admin",
                hashed_password=get_password_hash("Admin@123456"),
                role=UserRole.SUPER_ADMIN,
                is_active=True,
                is_verified=True,
                currency="KES",
                api_key="demo_admin_api_key_socialpulse"
            )
            db.add(u)
            await db.commit()
            await db.refresh(u)
            print(f"🎉 Created user successfully! ID: {u.id}, Role: {u.role.value}")
        except Exception as e:
            print("\n❌ ERROR DETAILS:")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_reg())
