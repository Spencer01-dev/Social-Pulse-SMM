import asyncio
from app.core.database import AsyncSessionLocal
from sqlalchemy import text
import sys

def escape_sql(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    # String or other
    val_str = str(val)
    val_str = val_str.replace("'", "''")
    return f"'{val_str}'"

async def export_services():
    async with AsyncSessionLocal() as session:
        res = await session.execute(text("SELECT * FROM services ORDER BY created_at ASC;"))
        rows = [dict(r._mapping) for r in res.fetchall()]
        print(f"Exporting {len(rows)} services...")
        
        with open("supabase_services_seed.sql", "w", encoding="utf-8") as f:
            f.write("-- =====================================================================\n")
            f.write(f"-- OPTIONAL SERVICES SEED DATA ({len(rows)} live services)\n")
            f.write("-- Run this if you wish to pre-load all provider services directly\n")
            f.write("-- Note: You can also sync services automatically using sync_live_services.py\n")
            f.write("-- =====================================================================\n\n")
            
            # Batch in chunks of 500 rows for fast insertion and avoidance of max query packet size
            batch_size = 500
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                f.write("INSERT INTO public.services (\n")
                f.write("    id, provider_id, provider_service_id, platform, name, description,\n")
                f.write("    service_type, category, provider_rate, selling_rate, markup_type,\n")
                f.write("    markup_value, min_quantity, max_quantity, refill_available, cancel_available,\n")
                f.write("    is_active, sort_order, created_at, updated_at, fallback_provider_id,\n")
                f.write("    fallback_service_id, wholesale_rate\n")
                f.write(") VALUES\n")
                
                val_lines = []
                for r in batch:
                    line = f"({escape_sql(r['id'])}, {escape_sql(r['provider_id'])}, {escape_sql(r['provider_service_id'])}, {escape_sql(r['platform'])}, {escape_sql(r['name'])}, {escape_sql(r['description'])}, {escape_sql(r['service_type'])}, {escape_sql(r['category'])}, {escape_sql(r['provider_rate'])}, {escape_sql(r['selling_rate'])}, {escape_sql(r['markup_type'])}, {escape_sql(r['markup_value'])}, {escape_sql(r['min_quantity'])}, {escape_sql(r['max_quantity'])}, {escape_sql(r['refill_available'])}, {escape_sql(r['cancel_available'])}, {escape_sql(r['is_active'])}, {escape_sql(r['sort_order'])}, {escape_sql(r['created_at'])}, {escape_sql(r['updated_at'])}, {escape_sql(r['fallback_provider_id'])}, {escape_sql(r['fallback_service_id'])}, {escape_sql(r['wholesale_rate'])})"
                    val_lines.append("  " + line)
                f.write(",\n".join(val_lines))
                f.write("\nON CONFLICT (id) DO NOTHING;\n\n")
                
    print("Services exported to supabase_services_seed.sql successfully!")

if __name__ == "__main__":
    asyncio.run(export_services())
