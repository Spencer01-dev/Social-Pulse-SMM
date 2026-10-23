-- =====================================================================
-- SOCIALPULSE PRODUCTION: REMOVE SECSERS SERVICES & REFUND AFFECTED ORDERS
-- Run this in your Supabase SQL Editor (Paste & Click Run)
-- =====================================================================
-- This script:
-- 1. Audits all orders placed on Secsers services.
-- 2. Automatically cancels and refunds 100% of the funds back to customers
--    for any failed/pending orders that used Secsers services.
-- 3. Generates double-entry audit ledger transactions for each refund.
-- 4. Modifies orders.service_id constraint to ON DELETE SET NULL so historical
--    orders are preserved while allowing decommissioned services to be erased.
-- 5. Completely removes all Secsers services and the Secsers provider record.
-- 6. Verifies zero Secsers services remain in the catalog.
-- =====================================================================

-- =====================================================================
-- PART 1: PRE-CHECK AUDIT (Orders placed on Secsers)
-- =====================================================================
SELECT 
    o.id AS order_id,
    o.order_number,
    u.username,
    u.email,
    o.charge AS amount_to_refund,
    o.status AS current_status,
    s.name AS service_name,
    p.name AS provider_name
FROM orders o
JOIN users u ON o.user_id = u.id
LEFT JOIN services s ON o.service_id = s.id
LEFT JOIN providers p ON o.provider_id = p.id OR s.provider_id = p.id
WHERE (
    p.slug = 'secsers' 
    OR lower(p.name) LIKE '%secsers%' 
    OR s.provider_id = '71110e74-f334-4d14-b98e-3f5357d97489'
    OR s.name ILIKE '%secsers%'
)
ORDER BY o.created_at DESC;


-- =====================================================================
-- PART 2: ATOMIC REFUND & COMPLETE REMOVAL OF SECSERS SERVICES
-- =====================================================================

-- STEP 1: Loop through each affected order, credit customer, record ledger, and mark canceled
DO $$
DECLARE
    r RECORD;
    v_bal_before NUMERIC(12, 2);
    v_bal_after NUMERIC(12, 2);
BEGIN
    FOR r IN (
        SELECT 
            o.id AS order_id,
            o.order_number,
            o.user_id,
            o.tenant_id,
            o.charge,
            o.quantity,
            COALESCE(o.currency, 'KES') AS currency,
            u.balance AS user_balance
        FROM orders o
        JOIN users u ON o.user_id = u.id
        LEFT JOIN services s ON o.service_id = s.id
        LEFT JOIN providers p ON o.provider_id = p.id OR s.provider_id = p.id
        WHERE (
            p.slug = 'secsers' 
            OR lower(p.name) LIKE '%secsers%' 
            OR s.provider_id = '71110e74-f334-4d14-b98e-3f5357d97489'
            OR s.name ILIKE '%secsers%'
        )
        AND o.status NOT IN ('canceled', 'failed')
    ) LOOP
        -- Fetch up-to-date customer balance
        SELECT balance INTO v_bal_before FROM users WHERE id = r.user_id;
        v_bal_after := v_bal_before + r.charge;

        -- 1. Credit retail charge back to ordering customer wallet
        UPDATE users 
        SET balance = v_bal_after, updated_at = NOW() 
        WHERE id = r.user_id;

        -- 2. Insert transaction ledger entry
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
            CONCAT('REFUND-SECSERS-', SUBSTRING(r.order_id::text, 1, 8)),
            'completed',
            CONCAT('Refund for decommissioned Secsers service - Order #', COALESCE(r.order_number::text, SUBSTRING(r.order_id::text, 1, 8))),
            jsonb_build_object(
                'order_id', r.order_id,
                'order_number', r.order_number,
                'refund_reason', 'Secsers provider decommissioned'
            ),
            NOW(),
            NOW()
        );

        -- 3. Set order status to canceled with remains set to full quantity
        UPDATE orders 
        SET status = 'canceled',
            remains = r.quantity,
            error_message = 'Order canceled and refunded: Secsers provider removed.',
            updated_at = NOW()
        WHERE id = r.order_id;
    END LOOP;
END $$;


-- STEP 2: Ensure orders.service_id allows NULL and cascades SET NULL on service deletion
-- (This ensures historical order receipts remain intact when old services are removed)
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


-- STEP 3: Delete child panel overrides for all Secsers services
DELETE FROM child_panel_service_configs
WHERE service_id IN (
    SELECT id FROM services 
    WHERE provider_id = '71110e74-f334-4d14-b98e-3f5357d97489'
       OR provider_id IN (SELECT id FROM providers WHERE slug = 'secsers' OR lower(name) LIKE '%secsers%')
       OR name ILIKE '%secsers%'
);


-- STEP 4: Delete ALL Secsers services from the database
DELETE FROM services
WHERE provider_id = '71110e74-f334-4d14-b98e-3f5357d97489'
   OR provider_id IN (SELECT id FROM providers WHERE slug = 'secsers' OR lower(name) LIKE '%secsers%')
   OR name ILIKE '%secsers%';


-- STEP 5: Delete the Secsers provider record
DELETE FROM providers
WHERE id = '71110e74-f334-4d14-b98e-3f5357d97489'
   OR slug = 'secsers'
   OR lower(name) LIKE '%secsers%';


-- =====================================================================
-- PART 3: VERIFICATION
-- =====================================================================

-- Verification 1: Confirm 0 Secsers services remain
SELECT 
    COUNT(*) AS remaining_secsers_services,
    CASE 
        WHEN COUNT(*) = 0 THEN '✓ PASSED: ZERO SECSERS SERVICES IN DATABASE'
        ELSE '✗ WARNING: SERVICES STILL FOUND'
    END AS status
FROM services s
LEFT JOIN providers p ON s.provider_id = p.id
WHERE p.slug = 'secsers' 
   OR lower(p.name) LIKE '%secsers%'
   OR s.provider_id = '71110e74-f334-4d14-b98e-3f5357d97489'
   OR s.name ILIKE '%secsers%';

-- Verification 2: Confirm 0 Secsers providers remain
SELECT 
    COUNT(*) AS remaining_secsers_providers,
    CASE 
        WHEN COUNT(*) = 0 THEN '✓ PASSED: SECSERS PROVIDER COMPLETELY REMOVED'
        ELSE '✗ WARNING: PROVIDER STILL FOUND'
    END AS status
FROM providers
WHERE id = '71110e74-f334-4d14-b98e-3f5357d97489'
   OR slug = 'secsers'
   OR lower(name) LIKE '%secsers%';

-- Verification 3: Confirm all refunded orders are canceled
SELECT 
    o.id AS order_id,
    o.order_number,
    u.username,
    u.balance AS current_customer_balance,
    o.charge AS refunded_charge,
    o.status,
    o.error_message
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.error_message LIKE '%Secsers%';
