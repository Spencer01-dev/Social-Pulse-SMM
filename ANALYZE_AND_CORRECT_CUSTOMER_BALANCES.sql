-- =====================================================================
-- SOCIALPULSE PRODUCTION: CUSTOMER BALANCE ANALYSIS & CORRECTION
-- Run this in your Supabase SQL Editor (Paste & Click Run)
-- =====================================================================
-- This script:
-- 1. Analyzes all registered customers, deposits, orders, refunds, and true balances.
-- 2. Removes any duplicate phantom deductions from prior reconciliation runs.
-- 3. Sets every registered customer's balance to their exact remaining balance:
--    True Balance = GREATEST(0.00, Deposits + Refunds - Valid Order Charges).
-- 4. Guarantees NO customer has a negative balance (clamps to 0.00 minimum).
-- 5. Adds a PostgreSQL CHECK (balance >= 0) constraint to prevent negative balances forever.
-- 6. Synchronizes child panel admin balances with panel owner balances.
-- =====================================================================

-- =====================================================================
-- PART 1: READ-ONLY AUDIT & ANALYSIS OF ALL CUSTOMERS
-- (You can run this SELECT alone to inspect customer balances before applying)
-- =====================================================================
SELECT 
    u.id AS user_id,
    u.username,
    u.email,
    u.role,
    COALESCE(cp.domain, 'SocialPulse Main Platform') AS panel_platform,
    u.balance AS current_balance,
    COALESCE(dep.total_deposits, 0.00) AS total_deposits,
    COALESCE(ref.total_refunds, 0.00) AS total_refunds_and_bonuses,
    COALESCE(ord.total_orders, 0.00) AS total_order_charges,
    GREATEST(
        0.00,
        ROUND(
            (COALESCE(dep.total_deposits, 0.00) + COALESCE(ref.total_refunds, 0.00) - COALESCE(ord.total_orders, 0.00))::numeric,
            2
        )
    ) AS calculated_true_balance,
    ROUND(
        (u.balance - GREATEST(0.00, (COALESCE(dep.total_deposits, 0.00) + COALESCE(ref.total_refunds, 0.00) - COALESCE(ord.total_orders, 0.00))))::numeric,
        2
    ) AS discrepancy,
    CASE 
        WHEN u.balance < 0 THEN '⚠️ NEGATIVE BALANCE'
        WHEN u.balance = GREATEST(0.00, (COALESCE(dep.total_deposits, 0.00) + COALESCE(ref.total_refunds, 0.00) - COALESCE(ord.total_orders, 0.00))) THEN '✓ ACCURATE'
        ELSE '⚠️ DISCREPANCY DETECTED'
    END AS audit_status
FROM users u
LEFT JOIN child_panels cp ON cp.id = u.tenant_id
LEFT JOIN (
    SELECT user_id, SUM(amount) AS total_deposits
    FROM transactions
    WHERE type = 'deposit' AND status = 'completed'
    GROUP BY user_id
) dep ON dep.user_id = u.id
LEFT JOIN (
    SELECT user_id, SUM(amount) AS total_refunds
    FROM transactions
    WHERE type IN ('order_refund', 'manual_adjustment', 'bonus') 
      AND status = 'completed' 
      AND amount > 0
    GROUP BY user_id
) ref ON ref.user_id = u.id
LEFT JOIN (
    SELECT user_id, SUM(charge) AS total_orders
    FROM orders
    WHERE status NOT IN ('canceled', 'failed')
    GROUP BY user_id
) ord ON ord.user_id = u.id
WHERE u.role = 'customer'
  AND NOT EXISTS (SELECT 1 FROM child_panels owner_cp WHERE owner_cp.user_id = u.id)
ORDER BY u.balance ASC;


-- =====================================================================
-- PART 2: ATOMIC CORRECTION (Runs inside a safe transaction)
-- =====================================================================
BEGIN;

-- STEP 1: Remove any duplicate phantom RECON-CUST transactions from previous scripts
DELETE FROM transactions
WHERE payment_reference LIKE 'RECON-CUST-%';

-- STEP 2: Correct every registered customer's balance to their exact ledger remaining balance
-- True Balance = GREATEST(0.00, Total Completed Deposits + Refunds - Valid Order Charges)
WITH customer_ledger AS (
    SELECT 
        u.id AS user_id,
        GREATEST(
            0.00,
            ROUND(
                (
                    COALESCE((
                        SELECT SUM(t.amount) 
                        FROM transactions t 
                        WHERE t.user_id = u.id 
                          AND t.type = 'deposit' 
                          AND t.status = 'completed'
                    ), 0.00)
                    +
                    COALESCE((
                        SELECT SUM(t.amount) 
                        FROM transactions t 
                        WHERE t.user_id = u.id 
                          AND t.type IN ('order_refund', 'manual_adjustment', 'bonus') 
                          AND t.status = 'completed'
                          AND t.amount > 0
                    ), 0.00)
                    -
                    COALESCE((
                        SELECT SUM(o.charge) 
                        FROM orders o 
                        WHERE o.user_id = u.id 
                          AND o.status NOT IN ('canceled', 'failed')
                    ), 0.00)
                )::numeric, 
                2
            )
        ) AS true_remaining_balance
    FROM users u
    WHERE u.role = 'customer'
      -- Do not overwrite panel owners whose balance is parent wholesale balance
      AND NOT EXISTS (
          SELECT 1 FROM child_panels cp WHERE cp.user_id = u.id
      )
)
UPDATE users u
SET balance = cl.true_remaining_balance,
    updated_at = NOW()
FROM customer_ledger cl
WHERE u.id = cl.user_id;

-- STEP 3: Ensure ZERO negative balances anywhere in the users table
UPDATE users
SET balance = 0.00,
    updated_at = NOW()
WHERE balance < 0;

-- STEP 4: Synchronize Child Panel Admin Accounts with Panel Owner Wholesale Balance
UPDATE users admin_u
SET balance = GREATEST(0.00, owner_u.balance),
    updated_at = NOW()
FROM child_panels cp
JOIN users owner_u ON owner_u.id = cp.user_id
WHERE admin_u.tenant_id = cp.id
  AND admin_u.role = 'admin';

-- STEP 5: Add Database Engine Constraint to PERMANENTLY FORBID Negative Balances
-- If any code or query tries to make a balance negative in the future, PostgreSQL will reject it!
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_user_balance_non_negative'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT check_user_balance_non_negative CHECK (balance >= 0);
    END IF;
END $$;

COMMIT;


-- =====================================================================
-- PART 3: VERIFICATION QUERIES (Confirming results)
-- =====================================================================

-- Verification 1: Confirm count of negative balances is exactly 0
SELECT 
    COUNT(*) AS total_negative_balances,
    CASE 
        WHEN COUNT(*) = 0 THEN '✓ PASSED: ZERO NEGATIVE BALANCES IN DATABASE'
        ELSE '✗ FAILED: STILL NEGATIVE'
    END AS status
FROM users
WHERE balance < 0;

-- Verification 2: View all corrected customer balances
SELECT 
    u.username,
    u.email,
    COALESCE(cp.domain, 'SocialPulse Main') AS platform,
    u.balance AS corrected_remaining_balance,
    CASE 
        WHEN u.balance > 0 THEN '✓ Active Funds Available'
        ELSE '⏸ 0.00 Balance (Must Top Up to Order)'
    END AS customer_state
FROM users u
LEFT JOIN child_panels cp ON cp.id = u.tenant_id
WHERE u.role = 'customer'
  AND NOT EXISTS (SELECT 1 FROM child_panels owner_cp WHERE owner_cp.user_id = u.id)
ORDER BY u.balance DESC;

-- Verification 3: Confirm Child Panel Admin Balance Sync
SELECT 
    cp.domain AS child_panel_domain,
    owner_u.username AS owner_username,
    owner_u.balance AS owner_wholesale_balance,
    admin_u.username AS admin_username,
    admin_u.balance AS child_panel_admin_balance,
    CASE WHEN owner_u.balance = admin_u.balance THEN '✓ IN SYNC' ELSE '✗ OUT OF SYNC' END AS sync_status
FROM child_panels cp
JOIN users owner_u ON owner_u.id = cp.user_id
LEFT JOIN users admin_u ON admin_u.tenant_id = cp.id AND admin_u.role = 'admin';
