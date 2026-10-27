-- =====================================================================
-- SOCIALPULSE PRODUCTION: REMOVE RESELLER SMM, DELIX, SECSERS & ALL NON-JAP
-- Run this in your Supabase SQL Editor (Paste & Click Run)
-- =====================================================================
-- 1. Audits all orders placed on ResellerSMM, Delix, Secsers, or non-JAP services.
-- 2. Automatically cancels and refunds 100% of the funds back to customers
--    for any pending/failed orders that used non-JAP services.
-- 3. Generates double-entry audit ledger transactions for each refund.
-- 4. Modifies orders constraints (service_id, provider_id) to ON DELETE SET NULL.
-- 5. Deletes all child panel service overrides for non-JAP services.
-- 6. Completely deletes all ResellerSMM, Delix, Secsers, and non-JAP services.
-- 7. Completely deletes all non-JAP provider records from providers table.
-- 8. Updates historical order references to JustAnotherPanel (JAP).
-- 9. Verifies zero non-JAP providers and services remain.
-- =====================================================================

-- STEP 1: Loop through each affected order, credit customer, record ledger, and mark canceled
DO $$
DECLARE
    r RECORD;
    v_bal_before NUMERIC(12, 2);
    v_bal_after NUMERIC(12, 2);
    v_jap_id UUID;
BEGIN
    SELECT id INTO v_jap_id FROM providers WHERE slug = 'jap' LIMIT 1;

    FOR r IN (
        SELECT 
            o.id AS order_id,
            o.order_number,
            o.user_id,
            o.tenant_id,
            COALESCE(o.charge, 0.00) AS charge,
            o.quantity,
            COALESCE(o.currency, 'KES') AS currency,
            u.balance AS user_balance
        FROM orders o
        JOIN users u ON o.user_id = u.id
        LEFT JOIN services s ON o.service_id = s.id
        LEFT JOIN providers p ON o.provider_id = p.id OR s.provider_id = p.id
        WHERE (
            p.slug != 'jap' 
            OR lower(p.name) NOT LIKE '%justanotherpanel%'
            OR s.provider_id IN (SELECT id FROM providers WHERE slug != 'jap')
            OR s.name ILIKE '%reseller%' 
            OR s.name ILIKE '%secsers%'
            OR s.name ILIKE '%delix%'
            OR s.category ILIKE '%delix%'
        )
        AND o.status NOT IN ('canceled', 'completed')
    ) LOOP
        -- Fetch customer balance before refund
        SELECT balance INTO v_bal_before FROM users WHERE id = r.user_id;
        v_bal_after := v_bal_before + r.charge;

        -- 1. Credit retail charge back to customer wallet
        UPDATE users 
        SET balance = v_bal_after, updated_at = NOW() 
        WHERE id = r.user_id;

        -- 2. Insert double-entry ledger transaction entry
        INSERT INTO transactions (
            id, user_id, order_id, tenant_id, type, amount,
            balance_before, balance_after, currency, payment_method,
            payment_reference, status, description, metadata_json,
            created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            r.user_id,
            r.order_id,
            r.tenant_id,
            'order_refund',
            r.charge,
            v_bal_before,
            v_bal_after,
            r.currency,
            'internal',
            CONCAT('REFUND-NON-JAP-', SUBSTRING(r.order_id::text, 1, 8)),
            'completed',
            CONCAT('Refund for decommissioned service - Order #', COALESCE(r.order_number::text, SUBSTRING(r.order_id::text, 1, 8))),
            jsonb_build_object(
                'order_id', r.order_id,
                'order_number', r.order_number,
                'refund_reason', 'Decommissioned non-JAP provider service removed'
            ),
            NOW(),
            NOW()
        );

        -- 3. Set order status to canceled
        UPDATE orders 
        SET status = 'canceled',
            remains = r.quantity,
            provider_id = v_jap_id,
            error_message = 'Order canceled and 100% refunded: Provider decommissioned.',
            updated_at = NOW()
        WHERE id = r.order_id;
    END LOOP;
END $$;


-- STEP 2: Ensure orders constraints allow NULL and cascade SET NULL on service/provider deletion
ALTER TABLE orders ALTER COLUMN service_id DROP NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_service_id_fkey' 
          AND table_name = 'orders'
    ) THEN
        ALTER TABLE orders DROP CONSTRAINT orders_service_id_fkey;
    END IF;
    
    ALTER TABLE orders ADD CONSTRAINT orders_service_id_fkey 
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_provider_id_fkey' 
          AND table_name = 'orders'
    ) THEN
        ALTER TABLE orders DROP CONSTRAINT orders_provider_id_fkey;
    END IF;
    
    ALTER TABLE orders ADD CONSTRAINT orders_provider_id_fkey 
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL;
END $$;


-- STEP 3: Delete child panel overrides for all non-JAP services
DELETE FROM child_panel_service_configs
WHERE service_id IN (
    SELECT s.id FROM services s
    LEFT JOIN providers p ON s.provider_id = p.id
    WHERE p.slug != 'jap'
       OR p.id IS NULL
       OR s.name ILIKE '%reseller%'
       OR s.name ILIKE '%delix%'
       OR s.name ILIKE '%secsers%'
       OR s.category ILIKE '%delix%'
);


-- STEP 4: Delete ALL non-JAP services from the database
DELETE FROM services
WHERE provider_id IN (SELECT id FROM providers WHERE slug != 'jap')
   OR provider_id IS NULL
   OR name ILIKE '%reseller%'
   OR name ILIKE '%delix%'
   OR name ILIKE '%secsers%'
   OR category ILIKE '%delix%';


-- STEP 5: Delete all non-JAP provider records (ResellerSMM, Secsers, etc.)
DELETE FROM providers
WHERE slug != 'jap'
   OR lower(name) NOT LIKE '%justanotherpanel%';


-- STEP 6: Update historical orders to point to JAP
UPDATE orders
SET provider_id = (SELECT id FROM providers WHERE slug = 'jap' LIMIT 1)
WHERE provider_id IS NOT NULL 
  AND provider_id NOT IN (SELECT id FROM providers WHERE slug = 'jap');


-- STEP 7: Verification queries
SELECT 
    COUNT(*) AS remaining_non_jap_providers,
    CASE 
        WHEN COUNT(*) = 0 THEN '✓ PASSED: ZERO NON-JAP PROVIDERS IN DATABASE'
        ELSE '✗ WARNING: PROVIDERS STILL FOUND'
    END AS status
FROM providers
WHERE slug != 'jap';

SELECT 
    COUNT(*) AS remaining_non_jap_services,
    CASE 
        WHEN COUNT(*) = 0 THEN '✓ PASSED: ZERO NON-JAP SERVICES IN DATABASE'
        ELSE '✗ WARNING: SERVICES STILL FOUND'
    END AS status
FROM services s
LEFT JOIN providers p ON s.provider_id = p.id
WHERE p.slug != 'jap' 
   OR s.name ILIKE '%reseller%'
   OR s.name ILIKE '%delix%'
   OR s.name ILIKE '%secsers%';
