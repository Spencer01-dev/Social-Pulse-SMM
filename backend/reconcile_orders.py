"""
SocialPulse Standalone Order & Balance Reconciliation CLI
Run via:
    python reconcile_orders.py

Scans all orders, deducts retail charges from customers who were never charged,
deducts wholesale costs from child panel owners, and synchronizes child panel admin balances.
"""

import asyncio
import sys
from app.core.database import AsyncSessionLocal
from app.services.reconciliation_service import reconcile_panel_orders


async def main():
    print("=" * 60)
    print("SOCIALPULSE ORDER & BALANCE RECONCILIATION")
    print("=" * 60)
    
    async with AsyncSessionLocal() as session:
        print("[*] Running reconciliation across all child panels...")
        report = await reconcile_panel_orders(session, panel_id=None, dry_run=False)
        
        print("\n=== RECONCILIATION REPORT ===")
        print(f"Success: {report['success']}")
        print(f"Orders Processed: {report['orders_processed']}")
        print(f"Customer Deductions Made: {report['customer_deductions_count']} (Total: KES {report['customer_deductions_total']})")
        print(f"Panel Owner Wholesale Deductions Made: {report['owner_deductions_count']} (Total: KES {report['owner_deductions_total']})")
        
        if report['details']:
            print("\n=== DEDUCTION DETAILS ===")
            for d in report['details']:
                print(f"  - {d}")
        else:
            print("\n[+] No undeducted orders found. All balances are already fully reconciled!")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
