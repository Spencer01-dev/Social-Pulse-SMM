-- =====================================================================
-- SOCIALPULSE PRODUCTION: REMOVE RESELLER SMM, DELIX & ALL NON-JAP SERVICES
-- Run this in your Supabase SQL Editor (Paste & Click Run)
-- =====================================================================
-- This script:
-- 1. Audits all orders placed on ResellerSMM, Delix, or any non-JAP service.
-- 2. Automatically cancels and refunds 100% of the funds back to customers
--    for any pending/failed orders that used ResellerSMM / Delix / non-JAP services.
-- 3. Inserts double-entry transaction ledger records for all refunds.
-- 4. Modifies foreign key constraints (service_id, provider_id) to ON DELETE SET NULL
--    so order history is preserved cleanly without constraint errors.
-- 5. Deletes all child panel service configs for non-JAP services.
-- 6. Completely deletes all ResellerSMM, Delix, and non-JAP services from the database.
-- 7. Completely deletes the ResellerSMM and any non-JAP provider records from providers.
-- 8. Updates any historical orders to point their provider reference to JustAnotherPanel (JAP).
-- 9. Verifies that 0 non-JAP providers and 0 non-JAP services remain.
-- =====================================================================

-- =====================================================================
-- PART 1: PRE-CHECK AUDIT OF NON-JAP SERVICES & ORDERS
-- =====================================================================
SELECT 
    'AFFECTED ORDERS' AS audit_type,
    o.id AS order_id,
    o.order_number,
    u.username,
    u.email,
    o.charge AS amount,
    o.status,
    s.name AS service_name,
    COALESCE(p.name, 'Unknown Provider') AS provider_name
FROM orders o
JOIN users u ON o.user_id = u.id
LEFT JOIN services s ON o.service_id = s.id
LEFT JOIN providers p ON o.provider_id = p.id OR s.provider_id = p.id
WHERE (
    p.slug != 'jap'
    OR lower(p.name) NOT LIKE '%justanotherpanel%'
    OR s.provider_id IN (SELECT id FROM providers WHERE slug != 'jap')
    OR s.name ILIKE '%reseller%'
    OR s.name ILIKE '%delix%'
    OR s.name ILIKE '%secsers%'
    OR s.category ILIKE '%delix%'
)
ORDER BY o.created_at DESC;


-- =====================================================================
-- PART 2: ATOMIC REFUND OF PENDING/FAILED NON-JAP ORDERS
-- =====================================================================
DO $$
DECLARE
    r RECORD;
    v_bal_before NUMERIC(12, 2);
    v_bal_after NUMERIC(12, 2);
    v_jap_id UUID;
BEGIN
    -- Get primary JAP provider id
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
            OR s.name ILIKE '%delix%'
            OR s.name ILIKE '%secsers%'
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


-- =====================================================================
-- PART 3: PRESERVE ORDER INTEGRITY (SET NULL ON DELETE)
-- =====================================================================
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


-- =====================================================================
-- PART 4: DELETE CHILD PANEL CONFIGS FOR NON-JAP SERVICES
-- =====================================================================
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


-- =====================================================================
-- PART 5: DELETE ALL NON-JAP SERVICES (RESELLER SMM, DELIX, ETC.)
-- =====================================================================
DELETE FROM services
WHERE provider_id IN (SELECT id FROM providers WHERE slug != 'jap')
   OR provider_id IS NULL
   OR name ILIKE '%reseller%'
   OR name ILIKE '%delix%'
   OR name ILIKE '%secsers%'
   OR category ILIKE '%delix%';


-- =====================================================================
-- PART 6: DELETE ALL NON-JAP PROVIDERS FROM DATABASE
-- =====================================================================
DELETE FROM providers
WHERE slug != 'jap'
   OR lower(name) NOT LIKE '%justanotherpanel%';


-- =====================================================================
-- PART 7: UPDATE HISTORICAL ORDERS TO POINT TO JAP PROVIDER
-- =====================================================================
UPDATE orders
SET provider_id = (SELECT id FROM providers WHERE slug = 'jap' LIMIT 1)
WHERE provider_id IS NOT NULL 
  AND provider_id NOT IN (SELECT id FROM providers WHERE slug = 'jap');


-- =====================================================================
-- PART 8: VERIFICATION
-- =====================================================================

-- Verification 1: Remaining non-JAP providers (Must be 0)
SELECT 
    COUNT(*) AS non_jap_providers_count,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASSED: ONLY JUSTANOTHERPANEL (JAP) EXISTS'
        ELSE 'WARNING: NON-JAP PROVIDERS STILL PRESENT'
    END AS status
FROM providers
WHERE slug != 'jap';

-- Verification 2: Active providers list
SELECT id, name, slug, api_url, is_active, currency, balance
FROM providers;

-- Verification 3: Remaining non-JAP services (Must be 0)
SELECT 
    COUNT(*) AS non_jap_services_count,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASSED: ZERO NON-JAP SERVICES IN CATALOG'
        ELSE 'WARNING: NON-JAP SERVICES STILL PRESENT'
    END AS status
FROM services s
LEFT JOIN providers p ON s.provider_id = p.id
WHERE p.slug != 'jap' 
   OR s.name ILIKE '%reseller%'
   OR s.name ILIKE '%delix%'
   OR s.name ILIKE '%secsers%';

-- Verification 4: Total active JAP services
SELECT 
    p.name AS provider_name,
    COUNT(s.id) AS total_live_services
FROM providers p
LEFT JOIN services s ON s.provider_id = p.id
GROUP BY p.name;

-- Verification 5: Check refunded orders
SELECT 
    o.id AS order_id,
    o.order_number,
    u.username,
    u.balance AS customer_current_balance,
    o.charge AS refunded_amount,
    o.status,
    o.error_message
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.error_message LIKE '%decommissioned%'
ORDER BY o.updated_at DESC;
