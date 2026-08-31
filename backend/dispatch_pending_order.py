import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.order import Order, OrderStatus
from app.models.service import Service, Platform
from app.providers.manager import get_provider


async def dispatch_order():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Order).where(Order.status == OrderStatus.PENDING).order_by(Order.created_at.desc())
        )
        order = result.scalars().first()

        if not order:
            print("[!] No pending orders found.")
            return

        print(f"[*] Found Pending Order #{str(order.id)[:8]}:")
        print(f"    Target Link: {order.target_link}")
        print(f"    Quantity: {order.quantity}")

        real_service_id = str(order.service.provider_service_id) if order.service else "1"
        print(f"[*] Submitting to Delix Gains Live Service ID: {real_service_id}...")

        delix = get_provider(slug="delix")
        provider_resp = await delix.create_order(
            service_id=real_service_id,
            target=order.target_link,
            quantity=order.quantity
        )

        print(f"[+] Delix Gains Live API Success! Provider Order ID = {provider_resp.provider_order_id}")

        # Update order in DB
        order.provider_order_id = str(provider_resp.provider_order_id)
        order.status = OrderStatus.IN_PROGRESS
        await session.commit()
        print(f"[+] Successfully dispatched to Delix Gains! Status is now IN_PROGRESS with Provider ID #{order.provider_order_id}.")


if __name__ == "__main__":
    asyncio.run(dispatch_order())
