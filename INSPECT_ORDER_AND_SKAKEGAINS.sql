-- =====================================================================
-- DIAGNOSE & FIX: ORDER 5eab84b7 NOT SHOWING ON SKAKEGAINS ORDERS MONITOR
-- Run in Supabase SQL Editor
-- =====================================================================

-- 1. What tenant_id does Order 5eab84b7 actually have?
SELECT 
    o.id AS order_id,
    o.tenant_id AS order_tenant_id,
    cp_order.domain AS order_tenant_domain,
    o.user_id,
    u.username,
    u.tenant_id AS user_tenant_id,
    cp_user.domain AS user_tenant_domain,
    o.charge,
    o.wholesale_cost,
    o.status
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
LEFT JOIN child_panels cp_order ON cp_order.id = o.tenant_id
LEFT JOIN child_panels cp_user ON cp_user.id = u.tenant_id
WHERE cast(o.id as text) LIKE '5eab84b7%';

-- 2. What is the skakegains panel ID?
SELECT id AS skakegains_panel_id, domain, user_id AS owner_id
FROM child_panels WHERE domain ILIKE '%skakegains%';

-- 3. FIX: If the order tenant_id is NULL but the customer belongs to skakegains,
--    set it to the correct panel ID
UPDATE orders o
SET tenant_id = u.tenant_id,
    updated_at = NOW()
FROM users u
WHERE o.user_id = u.id
  AND u.tenant_id IS NOT NULL
  AND o.tenant_id IS NULL
  AND o.created_at >= NOW() - INTERVAL '1 day';

-- 4. Verify fix
SELECT 
    o.id AS order_id,
    o.tenant_id,
    cp.domain AS now_assigned_to,
    u.username,
    o.status
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
LEFT JOIN child_panels cp ON cp.id = o.tenant_id
WHERE cast(o.id as text) LIKE '5eab84b7%';
