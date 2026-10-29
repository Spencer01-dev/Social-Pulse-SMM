-- ==============================================================================
-- SQL MIGRATION / CORRECTION: Real JAP Wholesale Prices & 50% Markup Platform-wide
-- ==============================================================================

BEGIN;

-- 1. Update Service 10262 (TikTok Likes [BR BR]) to live JAP provider rate (0.60 USD * 130 = 78.00 KES)
UPDATE services
SET provider_rate = 78.00,
    wholesale_rate = 78.00,
    selling_rate = 117.00, -- 78.00 * 1.50 (50% markup)
    markup_type = 'percentage',
    markup_value = 50.00,
    updated_at = NOW()
WHERE provider_service_id = '10262' OR name ILIKE '%TikTok Likes%BR%10262%';

-- 2. Update all active services to have wholesale_rate = provider_rate and selling_rate = 50% markup
UPDATE services
SET wholesale_rate = provider_rate,
    markup_type = 'percentage',
    markup_value = 50.00,
    selling_rate = ROUND(provider_rate * 1.50, 2),
    updated_at = NOW()
WHERE provider_rate > 0;

-- 3. Correct all existing orders of Service 10262 with quantity 100 (e.g. #1031198001, #1031197654, #1031236513)
-- Live JAP charge: $0.06 USD * 130 = KES 7.80
-- 50% markup selling price: 7.80 * 1.50 = KES 11.70
-- Profit: 11.70 - 7.80 = KES 3.90
UPDATE orders
SET provider_cost = 7.80,
    wholesale_cost = 7.80,
    charge = 11.70,
    profit = 3.90,
    updated_at = NOW()
WHERE provider_order_id IN ('1031198001', '1031197654', '1031236513')
   OR (quantity = 100 AND service_id IN (SELECT id FROM services WHERE provider_service_id = '10262'));

-- 4. Correct Order #1031182310 (quantity 1,000, JAP cost 0.2174 USD * 130 = 28.26 KES)
-- Wholesale: 28.26
-- 50% markup selling price: 28.26 * 1.50 = KES 42.39
-- Profit: 42.39 - 28.26 = KES 14.13
UPDATE orders
SET provider_cost = 28.26,
    wholesale_cost = 28.26,
    charge = 42.39,
    profit = 14.13,
    updated_at = NOW()
WHERE provider_order_id = '1031182310';

-- 5. Correct all other recent orders from the last 30 days to reflect 50% markup over live wholesale cost
UPDATE orders
SET wholesale_cost = COALESCE(NULLIF(provider_cost, 0.00), wholesale_cost),
    charge = ROUND(COALESCE(NULLIF(provider_cost, 0.00), wholesale_cost) * 1.50, 2),
    profit = ROUND(ROUND(COALESCE(NULLIF(provider_cost, 0.00), wholesale_cost) * 1.50, 2) - COALESCE(NULLIF(provider_cost, 0.00), wholesale_cost), 2),
    updated_at = NOW()
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND COALESCE(NULLIF(provider_cost, 0.00), wholesale_cost) > 0;

-- 6. Reconcile Child Panel Owner order_payment transactions to match updated wholesale cost
UPDATE transactions t
SET amount = -o.wholesale_cost,
    description = 'Wholesale fulfillment for Order #' || COALESCE(o.order_number::text, SUBSTRING(o.id::text, 1, 8)) || ' (Synced JAP Rate)'
FROM orders o
WHERE t.order_id = o.id
  AND t.type = 'order_payment'
  AND t.amount < 0
  AND o.wholesale_cost > 0
  AND ABS(t.amount) != o.wholesale_cost;

COMMIT;

-- Verify results
SELECT id, order_number, provider_order_id, quantity, wholesale_cost, provider_cost, charge, profit
FROM orders
WHERE created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 10;
