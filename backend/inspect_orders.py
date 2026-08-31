import asyncio
from app.core.database import AsyncSessionLocal
from app.models.order import Order
from app.workers.order_tasks import sync_active_orders
from sqlalchemy import select


async def inspect_latest_orders():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Order).order_by(Order.created_at.desc()).limit(5))
        orders = result.scalars().all()
        print(f"[*] Found {len(orders)} recent order(s):")
        for o in orders:
            print(f"Order #{str(o.id)[:8]} | Status: {o.status.value} | Target: {o.target_link} | Qty: {o.quantity} | Provider Order ID: {o.provider_order_id} | Start: {o.start_count} | Remains: {o.remains}")

        print("\n[*] Polling live provider for status update...")
        processed, updated = await sync_active_orders(session)
        print(f"[+] Provider Polling Result: {processed} processed, {updated} updated to latest state.")


if __name__ == "__main__":
    asyncio.run(inspect_latest_orders())
