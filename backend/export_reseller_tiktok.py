import asyncio
from app.core.database import AsyncSessionLocal
from app.models.provider import Provider
from app.models.service import Service
from sqlalchemy import select

def escape_sql(val):
    if val is None:
        return 'NULL'
    if isinstance(val, bool):
        return 'TRUE' if val else 'FALSE'
    if isinstance(val, (int, float)):
        return str(val)
    val_str = str(val).replace("'", "''")
    return f"'{val_str}'"

async def export_tiktok_services():
    async with AsyncSessionLocal() as session:
        p_res = await session.execute(select(Provider).where(Provider.slug == 'resellersmm'))
        p = p_res.scalars().first()
        if not p:
            print('Provider not found')
            return
            
        q = select(Service).where(Service.provider_id == p.id, Service.platform == 'tiktok')
        services = (await session.execute(q)).scalars().all()
        print(f'Found {len(services)} ResellerSMM TikTok services.')
        
        with open('SEED_RESELLERSMM_TIKTOK_SERVICES.sql', 'w', encoding='utf-8') as f:
            f.write('-- =====================================================================\n')
            f.write('-- RESELLERSMM TIKTOK SERVICES SEED SCRIPT (Views, Likes, Followers)\n')
            f.write('-- Paste this into Supabase SQL Editor and click RUN\n')
            f.write('-- =====================================================================\n\n')
            
            f.write("""DO $$
DECLARE
    v_reseller_id UUID;
BEGIN
    -- 1. Ensure ResellerSMM provider exists and fetch its ID
    SELECT id INTO v_reseller_id FROM public.providers WHERE slug = 'resellersmm' LIMIT 1;
    IF v_reseller_id IS NULL THEN
        INSERT INTO public.providers (id, name, slug, api_url, api_key_encrypted, is_active, currency, balance, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'ResellerSMM',
            'resellersmm',
            'https://resellersmm.com/api/v2',
            'f6f545ec5a398c1ba36edb4495962bd8',
            TRUE,
            'USD',
            0.00,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_reseller_id;
    ELSE
        UPDATE public.providers
        SET is_active = TRUE,
            api_url = 'https://resellersmm.com/api/v2',
            api_key_encrypted = 'f6f545ec5a398c1ba36edb4495962bd8'
        WHERE id = v_reseller_id;
    END IF;

    -- 2. Clear old ResellerSMM TikTok services to avoid duplicates
    DELETE FROM public.services WHERE provider_id = v_reseller_id AND platform = 'tiktok';

    -- 3. Insert all ResellerSMM TikTok services
""")

            # Insert services in batches
            batch_size = 50
            for i in range(0, len(services), batch_size):
                batch = services[i:i+batch_size]
                f.write('    INSERT INTO public.services (\n')
                f.write('        provider_id, provider_service_id, platform, name, description,\n')
                f.write('        service_type, category, provider_rate, selling_rate, markup_type,\n')
                f.write('        markup_value, min_quantity, max_quantity, refill_available, cancel_available,\n')
                f.write('        is_active, sort_order, created_at, updated_at, fallback_provider_id,\n')
                f.write('        fallback_service_id, wholesale_rate\n')
                f.write('    ) VALUES\n')
                
                rows_sql = []
                for s in batch:
                    markup_type_val = s.markup_type.value if hasattr(s.markup_type, 'value') else str(s.markup_type)
                    row = f"(v_reseller_id, {escape_sql(s.provider_service_id)}, 'tiktok', {escape_sql(s.name)}, {escape_sql(s.description)}, {escape_sql(s.service_type)}, {escape_sql(s.category)}, {escape_sql(s.provider_rate)}, {escape_sql(s.selling_rate)}, {escape_sql(markup_type_val)}, {escape_sql(s.markup_value)}, {escape_sql(s.min_quantity)}, {escape_sql(s.max_quantity)}, {escape_sql(s.refill_available)}, {escape_sql(s.cancel_available)}, TRUE, {escape_sql(s.sort_order)}, NOW(), NOW(), NULL, NULL, {escape_sql(s.wholesale_rate)})"
                    rows_sql.append('      ' + row)
                f.write(',\n'.join(rows_sql))
                f.write(';\n\n')

            f.write("""    -- 4. Ensure all ResellerSMM TikTok Views, Likes, and Followers are ACTIVE
    UPDATE public.services
    SET is_active = TRUE
    WHERE provider_id = v_reseller_id AND platform = 'tiktok';

    RAISE NOTICE 'Successfully seeded % TikTok services for ResellerSMM!', (SELECT count(*) FROM public.services WHERE provider_id = v_reseller_id AND platform = 'tiktok');
END $$;
""")

        print('SEED_RESELLERSMM_TIKTOK_SERVICES.sql generated successfully!')

if __name__ == '__main__':
    asyncio.run(export_tiktok_services())
