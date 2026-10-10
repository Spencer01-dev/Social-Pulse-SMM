import asyncio
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:%40Oscar599@localhost:5433/socialpulse_db')
    async with engine.connect() as conn:
        # Check all orders
        print("=" * 80)
        print("ALL ORDERS (sorted by profit)")
        print("=" * 80)
        r = await conn.execute(text("""
            SELECT o.order_number, o.quantity, o.charge, o.provider_cost, o.profit, 
                   o.status, o.target_link, o.currency,
                   s.provider_service_id, s.name as service_name, s.platform,
                   s.provider_rate, s.wholesale_rate, s.selling_rate
            FROM orders o
            LEFT JOIN services s ON o.service_id = s.id
            ORDER BY o.profit ASC
        """))
        rows = r.fetchall()
        if rows:
            for row in rows:
                d = dict(row._mapping)
                svc_name = (d['service_name'] or '')[:50].encode('ascii', 'ignore').decode('ascii')
                print(f"  Order #{d['order_number']} | Qty: {d['quantity']} | Charge: KES {d['charge']} | Cost: KES {d['provider_cost']} | Profit: KES {d['profit']} | Status: {d['status']}")
                print(f"    Service #{d['provider_service_id']} | {d['platform']} | ProvRate: {d['provider_rate']} | SellRate: {d['selling_rate']} | {svc_name}")
                print()
        else:
            print("  No orders found in the database.")
        
        print(f"\nTotal orders: {len(rows)}")
    
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
