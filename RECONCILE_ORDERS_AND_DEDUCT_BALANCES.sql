-- =====================================================================
-- SOCIALPULSE PRODUCTION: RETROACTIVE CHILD PANEL & CUSTOMER ORDER RECONCILIATION
-- Run this in your Supabase SQL Editor (Paste & Click Run)
-- =====================================================================
-- This script:
-- 0. Backfills wholesale_cost on historical child panel orders where it was 0/NULL.
-- 1. Deducts retail charges from customers for any orders placed without deduction.
-- 2. Deducts wholesale costs from child panel owners (e.g. skakegains) for fulfillment.
-- 3. Synchronizes child panel admin balances with the parent wholesale account balance.
-- 4. Records double-entry audit records in the transactions table.
-- 5. Is completely IDEMPOTENT (will not deduct twice).
-- =====================================================================

BEGIN;

-- =====================================================================
-- STEP 0: Backfill wholesale_cost for historical child panel orders
-- where wholesale_cost is 0 or NULL but the order belongs to a child panel
-- Uses provider_cost as the wholesale rate (what SocialPulse pays upstream)
-- =====================================================================
UPDATE orders
SET wholesale_cost = provider_cost,
    updated_at = NOW()
WHERE tenant_id IS NOT NULL
  AND (wholesale_cost IS NULL OR wholesale_cost = 0)
  AND provider_cost > 0
  AND status NOT IN ('canceled', 'failed');


-- =====================================================================
-- STEP 1: Deduct Customer Balance for any Undeducted Orders
-- =====================================================================
WITH undeducted_customer_orders AS (
    SELECT 
        o.id AS order_id,
        o.order_number,
        o.user_id,
        o.tenant_id,
        o.charge,
        u.balance AS current_balance,
        (u.balance - o.charge) AS new_balance
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.charge > 0
      AND o.status NOT IN ('canceled', 'failed')
      AND NOT EXISTS (
          SELECT 1 
          FROM transactions t 
          WHERE t.order_id = o.id 
            AND t.user_id = o.user_id 
            AND t.type = 'order_payment'
      )
),
updated_customers AS (
    UPDATE users u
    SET balance = u.balance - sub.charge,
        updated_at = NOW()
    FROM (
        SELECT user_id, SUM(charge) AS charge
        FROM undeducted_customer_orders
        GROUP BY user_id
    ) sub
    WHERE u.id = sub.user_id
    RETURNING u.id
)
-- Record Transaction entries for customer deductions
INSERT INTO transactions (
    id,
    user_id,
    order_id,
    tenant_id,
    type,
    amount,
    balance_before,
    balance_after,
    currency,
    payment_method,
    payment_reference,
    status,
    description,
    created_at,
    updated_at
)
SELECT 
    gen_random_uuid(),
    uco.user_id,
    uco.order_id,
    uco.tenant_id,
    'order_payment',
    -uco.charge,
    uco.current_balance,
    uco.new_balance,
    'KES',
    'internal',
    CONCAT('RECON-CUST-', COALESCE(uco.order_number::text, SUBSTRING(uco.order_id::text, 1, 8))),
    'completed',
    CONCAT('Reconciled order payment for Order #', COALESCE(uco.order_number::text, SUBSTRING(uco.order_id::text, 1, 8))),
    NOW(),
    NOW()
FROM undeducted_customer_orders uco;


-- =====================================================================
-- STEP 2: Deduct Child Panel Owner Balance for Wholesale Fulfillment
-- =====================================================================
WITH undeducted_wholesale_orders AS (
    SELECT 
        o.id AS order_id,
        o.order_number,
        o.tenant_id,
        cp.domain AS panel_domain,
        cp.user_id AS owner_user_id,
        COALESCE(NULLIF(o.wholesale_cost, 0), NULLIF(o.provider_cost, 0)) AS wholesale_cost,
        owner.balance AS current_owner_balance,
        (owner.balance - COALESCE(NULLIF(o.wholesale_cost, 0), NULLIF(o.provider_cost, 0))) AS new_owner_balance
    FROM orders o
    JOIN child_panels cp ON cp.id = o.tenant_id
    JOIN users owner ON owner.id = cp.user_id
    WHERE o.status NOT IN ('canceled', 'failed')
      AND cp.user_id != o.user_id -- End-customer order, not owner ordering as customer
      AND COALESCE(NULLIF(o.wholesale_cost, 0), NULLIF(o.provider_cost, 0)) > 0
      AND NOT EXISTS (
          SELECT 1 
          FROM transactions t 
          WHERE t.order_id = o.id 
            AND t.user_id = cp.user_id 
            AND t.type = 'order_payment'
      )
),
updated_panel_owners AS (
    UPDATE users u
    SET balance = u.balance - sub.wholesale_total,
        updated_at = NOW()
    FROM (
        SELECT owner_user_id, SUM(wholesale_cost) AS wholesale_total
        FROM undeducted_wholesale_orders
        GROUP BY owner_user_id
    ) sub
    WHERE u.id = sub.owner_user_id
    RETURNING u.id
)
-- Record Transaction entries for wholesale deductions
INSERT INTO transactions (
    id,
    user_id,
    order_id,
    tenant_id,
    type,
    amount,
    balance_before,
    balance_after,
    currency,
    payment_method,
    payment_reference,
    status,
    description,
    created_at,
    updated_at
)
SELECT 
    gen_random_uuid(),
    uwo.owner_user_id,
    uwo.order_id,
    uwo.tenant_id,
    'order_payment',
    -uwo.wholesale_cost,
    uwo.current_owner_balance,
    uwo.new_owner_balance,
    'KES',
    'internal',
    CONCAT('RECON-WHOLESALE-', COALESCE(uwo.order_number::text, SUBSTRING(uwo.order_id::text, 1, 8))),
    'completed',
    CONCAT('Wholesale fulfillment for Order #', COALESCE(uwo.order_number::text, SUBSTRING(uwo.order_id::text, 1, 8)), ' on ', uwo.panel_domain),
    NOW(),
    NOW()
FROM undeducted_wholesale_orders uwo;


-- =====================================================================
-- STEP 3: Synchronize Child Panel Admin Balances with Panel Owner Balance
-- =====================================================================
UPDATE users admin_u
SET balance = owner_u.balance,
    updated_at = NOW()
FROM child_panels cp
JOIN users owner_u ON owner_u.id = cp.user_id
WHERE admin_u.tenant_id = cp.id
  AND admin_u.role = 'admin';

COMMIT;

-- =====================================================================
-- VERIFICATION QUERIES (run after COMMIT to check results)
-- =====================================================================

-- 1. Verify Child Panel Balances are in sync
SELECT 
    cp.domain AS child_panel_domain,
    owner_u.username AS owner_username,
    owner_u.balance AS parent_wholesale_balance,
    admin_u.username AS panel_admin_username,
    admin_u.balance AS panel_admin_balance,
    CASE WHEN owner_u.balance = admin_u.balance THEN '✓ IN SYNC' ELSE '✗ OUT OF SYNC' END AS sync_status
FROM child_panels cp
JOIN users owner_u ON owner_u.id = cp.user_id
LEFT JOIN users admin_u ON admin_u.tenant_id = cp.id AND admin_u.role = 'admin';

-- 2. Verify no undeducted customer orders remain
SELECT COUNT(*) AS undeducted_customer_orders
FROM orders o
WHERE o.charge > 0
  AND o.status NOT IN ('canceled', 'failed')
  AND NOT EXISTS (
      SELECT 1 FROM transactions t 
      WHERE t.order_id = o.id AND t.user_id = o.user_id AND t.type = 'order_payment'
  );

-- 3. Verify no undeducted wholesale orders remain
SELECT COUNT(*) AS undeducted_wholesale_orders
FROM orders o
JOIN child_panels cp ON cp.id = o.tenant_id
WHERE o.status NOT IN ('canceled', 'failed')
  AND cp.user_id != o.user_id
  AND COALESCE(NULLIF(o.wholesale_cost, 0), NULLIF(o.provider_cost, 0)) > 0
  AND NOT EXISTS (
      SELECT 1 FROM transactions t 
      WHERE t.order_id = o.id AND t.user_id = cp.user_id AND t.type = 'order_payment'
  );

-- 4. Verify wholesale_cost is now populated for all child panel orders
SELECT COUNT(*) AS orders_missing_wholesale_cost
FROM orders
WHERE tenant_id IS NOT NULL
  AND (wholesale_cost IS NULL OR wholesale_cost = 0)
  AND provider_cost > 0
  AND status NOT IN ('canceled', 'failed');
