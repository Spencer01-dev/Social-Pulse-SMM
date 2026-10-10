import asyncio
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:%40Oscar599@localhost:5433/socialpulse_db')
    async with engine.connect() as conn:
        # 1. Verify zero-rate services are deactivated
        print("=" * 80)
        print("1. ZERO-RATE SERVICES STILL ACTIVE")
        print("=" * 80)
        r = await conn.execute(text("""
            SELECT provider_service_id, platform, name, provider_rate, wholesale_rate, selling_rate
            FROM services
            WHERE is_active = true AND (provider_rate IS NULL OR provider_rate <= 0.001)
        """))
        rows = r.fetchall()
        if rows:
            for row in rows:
                d = dict(row._mapping)
                clean_name = d['name'][:60].encode('ascii', 'ignore').decode('ascii')
                print(f"  #{d['provider_service_id']:<6} | {d['platform']:<10} | Prov: {d['provider_rate']} | Sell: {d['selling_rate']} | {clean_name}")
        else:
            print("  NONE - All zero-rate services are deactivated.")

        # 2. Find LOSS-MAKING services (selling_rate <= provider_rate)
        print("\n" + "=" * 80)
        print("2. LOSS-MAKING SERVICES (selling_rate <= provider_rate)")
        print("=" * 80)
        r = await conn.execute(text("""
            SELECT provider_service_id, platform, category, name, 
                   provider_rate, wholesale_rate, selling_rate,
                   (selling_rate - provider_rate) as profit_per_1000,
                   min_quantity, max_quantity
            FROM services
            WHERE is_active = true AND selling_rate <= provider_rate
            ORDER BY (selling_rate - provider_rate) ASC
            LIMIT 50
        """))
        loss_rows = r.fetchall()
        total_loss = 0
        if loss_rows:
            for row in loss_rows:
                d = dict(row._mapping)
                clean_name = d['name'][:50].encode('ascii', 'ignore').decode('ascii')
                profit = float(d['selling_rate']) - float(d['provider_rate'])
                total_loss += profit
                print(f"  #{d['provider_service_id']:<6} | {d['platform']:<10} | Prov: KES {d['provider_rate']:<8} | WS: KES {d['wholesale_rate']:<8} | Sell: KES {d['selling_rate']:<8} | Loss: KES {profit:.2f}/1K | {clean_name}")
            print(f"\n  TOTAL LOSS-MAKING SERVICES: {len(loss_rows)}")
        else:
            print("  NONE - All active services have positive margins.")

        # 3. Find services where wholesale_rate <= provider_rate (child panels losing money)
        print("\n" + "=" * 80)
        print("3. CHILD PANEL LOSS-MAKING (wholesale_rate <= provider_rate)")
        print("=" * 80)
        r = await conn.execute(text("""
            SELECT provider_service_id, platform, name, 
                   provider_rate, wholesale_rate, selling_rate,
                   (wholesale_rate - provider_rate) as ws_profit
            FROM services
            WHERE is_active = true AND wholesale_rate <= provider_rate AND wholesale_rate > 0
            ORDER BY (wholesale_rate - provider_rate) ASC
            LIMIT 30
        """))
        ws_rows = r.fetchall()
        if ws_rows:
            for row in ws_rows:
                d = dict(row._mapping)
                clean_name = d['name'][:50].encode('ascii', 'ignore').decode('ascii')
                ws_profit = float(d['wholesale_rate']) - float(d['provider_rate'])
                print(f"  #{d['provider_service_id']:<6} | {d['platform']:<10} | Prov: KES {d['provider_rate']:<8} | WS: KES {d['wholesale_rate']:<8} | WS Loss: KES {ws_profit:.2f} | {clean_name}")
            print(f"\n  TOTAL CHILD PANEL LOSS-MAKING: {len(ws_rows)}")
        else:
            print("  NONE - All child panel wholesale rates are profitable.")

        # 4. Top 15 lowest priced active services overall
        print("\n" + "=" * 80)
        print("4. TOP 15 LOWEST PRICED ACTIVE SERVICES")
        print("=" * 80)
        r = await conn.execute(text("""
            SELECT provider_service_id, platform, category, name, 
                   provider_rate, wholesale_rate, selling_rate,
                   min_quantity, max_quantity
            FROM services
            WHERE is_active = true
            ORDER BY selling_rate ASC
            LIMIT 15
        """))
        for row in r.fetchall():
            d = dict(row._mapping)
            clean_name = d['name'][:50].encode('ascii', 'ignore').decode('ascii')
            profit = float(d['selling_rate']) - float(d['provider_rate'])
            margin_pct = (profit / float(d['provider_rate'])) * 100 if float(d['provider_rate']) > 0 else 0
            status = "OK" if profit > 0 else "LOSS"
            print(f"  [{status}] #{d['provider_service_id']:<6} | {d['platform']:<10} | Prov: KES {d['provider_rate']:<8} | Sell: KES {d['selling_rate']:<8} | Margin: {margin_pct:.1f}% | Min:{d['min_quantity']} | {clean_name}")

        # 5. Count summary
        print("\n" + "=" * 80)
        print("5. SUMMARY STATISTICS")
        print("=" * 80)
        r = await conn.execute(text("SELECT count(*) FROM services WHERE is_active = true"))
        total_active = r.scalar()
        r = await conn.execute(text("SELECT count(*) FROM services WHERE is_active = false"))
        total_inactive = r.scalar()
        r = await conn.execute(text("SELECT count(*) FROM services WHERE is_active = true AND selling_rate <= provider_rate"))
        loss_count = r.scalar()
        r = await conn.execute(text("SELECT count(*) FROM services WHERE is_active = true AND selling_rate > provider_rate"))
        profit_count = r.scalar()
        
        print(f"  Total Active Services:    {total_active}")
        print(f"  Total Inactive Services:  {total_inactive}")
        print(f"  Profitable Services:      {profit_count}")
        print(f"  Loss-Making Services:     {loss_count}")
        print(f"  Loss Percentage:          {(loss_count/total_active*100):.1f}%")

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
