import asyncio
import uuid
from app.core.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from sqlalchemy import select, delete

async def setup_users():
    async with AsyncSessionLocal() as db:
        try:
            # Query and print existing users
            res = await db.execute(select(User))
            existing = res.scalars().all()
            print("Existing users:")
            for u in existing:
                print(f"  - Username: {u.username}, Email: {u.email}, Role: {u.role.value}")

            # Upsert muneneoscar599@gmail.com
            res = await db.execute(select(User).where(User.email == "muneneoscar599@gmail.com"))
            user_oscar = res.scalars().first()
            if user_oscar:
                user_oscar.hashed_password = get_password_hash("@Oscar599")
                user_oscar.role = UserRole.SUPER_ADMIN
                user_oscar.is_active = True
                user_oscar.is_verified = True
                print("Updated existing user muneneoscar599@gmail.com")
            else:
                user_oscar = User(
                    id=uuid.uuid4(),
                    email="muneneoscar599@gmail.com",
                    username="oscar",
                    hashed_password=get_password_hash("@Oscar599"),
                    role=UserRole.SUPER_ADMIN,
                    is_active=True,
                    is_verified=True,
                    currency="KES",
                    api_key="oscar_admin_api_key"
                )
                db.add(user_oscar)
                print("Created new user muneneoscar599@gmail.com")

            # Also ensure admin username exists with @Oscar599 password
            res_admin = await db.execute(select(User).where(User.username == "admin"))
            user_admin = res_admin.scalars().first()
            if user_admin:
                user_admin.hashed_password = get_password_hash("@Oscar599")
                user_admin.role = UserRole.SUPER_ADMIN
                user_admin.is_active = True
                user_admin.is_verified = True
                print("Updated admin password to @Oscar599")

            await db.commit()
            print("Successfully configured admin accounts!")
        except Exception as e:
            print("ERROR DETAILS:")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(setup_users())

