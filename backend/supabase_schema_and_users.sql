-- =====================================================================
-- SOCIALPULSE SMM RESELLER PLATFORM - FULL SUPABASE DATABASE SETUP SCRIPT
-- =====================================================================
-- This SQL script contains:
--   1. PostgreSQL Extensions & Custom Types / Enums
--   2. Order Sequence (order_number_seq starting at 29100001)
--   3. All Application Tables & Relationships (DDL)
--   4. Performance Indexes & Constraints
--   5. All 16 Registered Users with Encrypted Passwords, Roles & Balances
--   6. Configured Upstream Provider (JustAnotherPanel)
--   7. Child Panels & Branded Tenant Data
--   8. Support Tickets & Ticket Messages
--   9. Alembic Migration Head Record (010_add_wholesale_rate)
--
-- How to apply to Supabase:
--   1. Go to your Supabase Project Dashboard -> SQL Editor
--   2. Click "+ New Query"
--   3. Paste this entire script and click "Run" (Ctrl+Enter)
-- =====================================================================

-- Set schema search path
SET search_path TO public;

-- Enable UUID & Crypto Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. ENUMS / CUSTOM TYPES
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
        CREATE TYPE user_role_enum AS ENUM ('customer', 'reseller', 'admin', 'super_admin');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'child_panel_status_enum') THEN
        CREATE TYPE child_panel_status_enum AS ENUM ('pending', 'active', 'suspended', 'expired', 'terminated');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'markup_type_enum') THEN
        CREATE TYPE markup_type_enum AS ENUM ('percentage', 'fixed_amount', 'manual');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_enum') THEN
        CREATE TYPE order_status_enum AS ENUM ('pending', 'processing', 'in_progress', 'completed', 'partial', 'canceled', 'failed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_enum') THEN
        CREATE TYPE payment_method_enum AS ENUM ('mpesa', 'okx', 'binance', 'manual', 'internal');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_enum') THEN
        CREATE TYPE platform_enum AS ENUM ('instagram', 'facebook', 'youtube', 'tiktok', 'twitter', 'telegram', 'spotify', 'discord', 'twitch', 'other', 'whatsapp', 'test_val');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticketpriority') THEN
        CREATE TYPE ticketpriority AS ENUM ('low', 'medium', 'high', 'urgent');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticketstatus') THEN
        CREATE TYPE ticketstatus AS ENUM ('open', 'answered', 'customer_reply', 'closed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status_enum') THEN
        CREATE TYPE transaction_status_enum AS ENUM ('pending', 'completed', 'failed', 'reversed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type_enum') THEN
        CREATE TYPE transaction_type_enum AS ENUM ('deposit', 'order_payment', 'order_refund', 'manual_adjustment', 'bonus');
    END IF;
END $$;

-- =====================================================================
-- 2. SEQUENCES
-- =====================================================================
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 29100001 INCREMENT BY 1;

-- =====================================================================
-- 3. TABLES (DDL)
-- =====================================================================

-- Alembic Version Table
CREATE TABLE IF NOT EXISTS public.alembic_version (
    version_num VARCHAR(32) NOT NULL PRIMARY KEY
);

-- Upstream Providers Table
CREATE TABLE IF NOT EXISTS public.providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    api_url VARCHAR(255) NOT NULL,
    api_key_encrypted VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users Table (created before child_panels to resolve circular dependency)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'customer',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    full_name VARCHAR(150),
    phone_number VARCHAR(50),
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'KES',
    api_key VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tenant_id UUID
);

-- Child SMM Panels Table
CREATE TABLE IF NOT EXISTS public.child_panels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    domain VARCHAR(255) UNIQUE NOT NULL,
    admin_username VARCHAR(100) NOT NULL,
    admin_password_hash VARCHAR(255) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'KES',
    price_per_month NUMERIC(12, 2) NOT NULL DEFAULT 1500.00,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    provisioning_step VARCHAR(50) DEFAULT 'pending',
    last_error TEXT,
    branding_json JSONB,
    nameserver1 VARCHAR(255) NOT NULL DEFAULT 'ns1.socialpulse.io',
    nameserver2 VARCHAR(255) NOT NULL DEFAULT 'ns2.socialpulse.io',
    expires_at TIMESTAMPTZ NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    metadata_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add Tenant Foreign Key constraint to Users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_users_tenant' AND table_name = 'users'
    ) THEN
        ALTER TABLE public.users 
        ADD CONSTRAINT fk_users_tenant 
        FOREIGN KEY (tenant_id) REFERENCES public.child_panels(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Catalog Services Table
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
    provider_service_id VARCHAR(100) NOT NULL,
    platform VARCHAR(50) NOT NULL DEFAULT 'instagram',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    service_type VARCHAR(50) NOT NULL DEFAULT 'Default',
    category VARCHAR(150) NOT NULL,
    provider_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    selling_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    wholesale_rate NUMERIC(12, 2) DEFAULT 0.00,
    markup_type markup_type_enum NOT NULL DEFAULT 'percentage',
    markup_value NUMERIC(10, 2) NOT NULL DEFAULT 100.00,
    min_quantity INTEGER NOT NULL DEFAULT 10,
    max_quantity INTEGER NOT NULL DEFAULT 100000,
    refill_available BOOLEAN NOT NULL DEFAULT FALSE,
    cancel_available BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fallback_provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
    fallback_service_id VARCHAR(100)
);

-- Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number INTEGER UNIQUE DEFAULT nextval('order_number_seq'),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
    tenant_id UUID REFERENCES public.child_panels(id) ON DELETE SET NULL,
    provider_order_id VARCHAR(100),
    target_link VARCHAR(500) NOT NULL,
    quantity INTEGER NOT NULL,
    start_count INTEGER NOT NULL DEFAULT 0,
    remains INTEGER NOT NULL DEFAULT 0,
    charge NUMERIC(12, 2) NOT NULL,
    provider_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'KES',
    status order_status_enum NOT NULL DEFAULT 'pending',
    custom_comments TEXT,
    error_message TEXT,
    runs INTEGER NOT NULL DEFAULT 1,
    interval INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Financial Transactions Ledger Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    tenant_id UUID REFERENCES public.child_panels(id) ON DELETE SET NULL,
    type transaction_type_enum NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    balance_before NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'KES',
    payment_method payment_method_enum NOT NULL DEFAULT 'internal',
    payment_reference VARCHAR(100),
    status transaction_status_enum NOT NULL DEFAULT 'pending',
    description VARCHAR(255),
    metadata_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Support Tickets Table
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    tenant_id UUID REFERENCES public.child_panels(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL,
    priority ticketpriority NOT NULL DEFAULT 'medium',
    status ticketstatus NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ticket Conversation Messages Table
CREATE TABLE IF NOT EXISTS public.ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_admin_reply BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System Migration Locks
CREATE TABLE IF NOT EXISTS public._system_migration_lock (
    id SERIAL PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public._live_dummy_funds_purged_lock_v2 (
    id SERIAL PRIMARY KEY,
    purged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 4. PERFORMANCE INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS ix_users_id ON public.users(id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON public.users(email);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS ix_users_role ON public.users(role);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_api_key ON public.users(api_key);
CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON public.users(tenant_id);

CREATE INDEX IF NOT EXISTS ix_providers_id ON public.providers(id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_providers_slug ON public.providers(slug);

CREATE INDEX IF NOT EXISTS ix_child_panels_id ON public.child_panels(id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_child_panels_domain ON public.child_panels(domain);
CREATE INDEX IF NOT EXISTS ix_child_panels_user_id ON public.child_panels(user_id);
CREATE INDEX IF NOT EXISTS ix_child_panels_status ON public.child_panels(status);

CREATE INDEX IF NOT EXISTS ix_services_id ON public.services(id);
CREATE INDEX IF NOT EXISTS ix_services_provider_id ON public.services(provider_id);
CREATE INDEX IF NOT EXISTS ix_services_provider_service_id ON public.services(provider_service_id);
CREATE INDEX IF NOT EXISTS ix_services_platform ON public.services(platform);
CREATE INDEX IF NOT EXISTS ix_services_category ON public.services(category);
CREATE INDEX IF NOT EXISTS ix_services_is_active ON public.services(is_active);

CREATE INDEX IF NOT EXISTS ix_orders_id ON public.orders(id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS ix_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS ix_orders_service_id ON public.orders(service_id);
CREATE INDEX IF NOT EXISTS ix_orders_provider_id ON public.orders(provider_id);
CREATE INDEX IF NOT EXISTS ix_orders_provider_order_id ON public.orders(provider_order_id);
CREATE INDEX IF NOT EXISTS ix_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS ix_orders_tenant_id ON public.orders(tenant_id);

CREATE INDEX IF NOT EXISTS ix_transactions_id ON public.transactions(id);
CREATE INDEX IF NOT EXISTS ix_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS ix_transactions_order_id ON public.transactions(order_id);
CREATE INDEX IF NOT EXISTS ix_transactions_payment_method ON public.transactions(payment_method);
CREATE INDEX IF NOT EXISTS ix_transactions_payment_reference ON public.transactions(payment_reference);
CREATE INDEX IF NOT EXISTS ix_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS ix_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS ix_transactions_tenant_id ON public.transactions(tenant_id);

CREATE INDEX IF NOT EXISTS ix_tickets_id ON public.tickets(id);
CREATE INDEX IF NOT EXISTS ix_tickets_user_id ON public.tickets(user_id);
CREATE INDEX IF NOT EXISTS ix_tickets_order_id ON public.tickets(order_id);
CREATE INDEX IF NOT EXISTS ix_tickets_priority ON public.tickets(priority);
CREATE INDEX IF NOT EXISTS ix_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS ix_tickets_tenant_id ON public.tickets(tenant_id);

CREATE INDEX IF NOT EXISTS ix_ticket_messages_id ON public.ticket_messages(id);
CREATE INDEX IF NOT EXISTS ix_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS ix_ticket_messages_sender_id ON public.ticket_messages(sender_id);

-- =====================================================================
-- 5. ALEMBIC MIGRATION HEAD
-- =====================================================================
INSERT INTO public.alembic_version (version_num) 
VALUES ('010_add_wholesale_rate')
ON CONFLICT (version_num) DO NOTHING;

-- System Locks (prevents automatic dev-mode wipes)
INSERT INTO public._system_migration_lock (id, applied_at)
VALUES (1, NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public._live_dummy_funds_purged_lock_v2 (id, purged_at)
VALUES (1, NOW())
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 6. UPSTREAM PROVIDERS
-- =====================================================================
INSERT INTO public.providers (
    id, name, slug, api_url, api_key_encrypted, is_active, balance, currency, description, created_at, updated_at
) VALUES
  ('71110e74-f334-4d14-b98e-3f5357d97489', 'ResellerSMM', 'resellersmm', 'https://resellersmm.com/api/v2', NULL, TRUE, '0.00', 'USD', NULL, '2026-09-19T06:20:39.701793+00:00', '2026-09-19T06:20:39.701793+00:00'),
  ('e040f927-23c8-4cf2-a27a-f6eba46f3699', 'JustAnotherPanel', 'jap', 'https://justanotherpanel.com/api/v2', NULL, TRUE, '0.00', 'USD', NULL, '2026-09-19T06:21:17.547596+00:00', '2026-09-19T06:21:17.547596+00:00')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 7. REGISTERED USERS (16 SIGNED UP ACCOUNTS)
-- =====================================================================
-- All bcrypt hashed passwords and user attributes are preserved identically.
INSERT INTO public.users (
    id, email, username, hashed_password, role, is_active, is_verified,
    full_name, phone_number, balance, currency, api_key, created_at, updated_at
) VALUES
  ('84facac8-6b02-42e5-9779-fe43983f5b32', 'muneneoscar599@gmail.com', 'spence', '$2b$12$wPeQ/yK/yX6l4D6uCtrMnuN0ikDA7UeUCQ.H8qgbYCRz1CPKQ3/Oi', 'super_admin', TRUE, TRUE, 'Spencer Spence', '+254706656544', '0.00', 'KES', 'sp_mvfsD4ONhOmV4ToWfCE6wl43fFW3xFnEfV4hKHVW8hY', '2026-08-27T08:39:25.213065+00:00', '2026-09-26T06:51:05.255856+00:00'),
  ('bda05567-a68f-474a-b633-f7a3ea781063', 'muneneoscar77@gmail.com', 'spence__', '$2b$12$55ECXAbD5QK2ugsszje2y.CBz.w6icWcZ54mGVNzCgF28CdGfllKO', 'customer', TRUE, FALSE, 'Oscar Munene', '+254706656544', '0.00', 'KES', NULL, '2026-08-27T17:20:27.985505+00:00', '2026-09-15T18:22:59.582469+00:00'),
  ('141ac2c8-02d3-4d71-b65f-242c326dbff0', 'admin@socialpulse.io', 'admin', '$2b$12$drFLyFG61vC6SXFNrLhSp.HlUpkL8sdutVgYwcJ8yoj75LZw1q0.K', 'super_admin', TRUE, TRUE, NULL, NULL, '0.00', 'KES', 'demo_admin_api_key_socialpulse', '2026-09-02T13:40:35.241733+00:00', '2026-09-26T06:51:05.255856+00:00'),
  ('40744bb6-0a72-40ec-aace-0a516bedbb0d', 'johnkamau@gmail.com', 'spencer', '$2b$12$Z9iu7oR9mI096MmW84IOj.hzsxUqnC6E5PjaGB7BkD2pJG2av1VsK', 'customer', TRUE, FALSE, 'John Kamau', '+254706656544', '0.00', 'KES', NULL, '2026-09-08T07:46:21.425398+00:00', '2026-09-15T18:22:59.582469+00:00'),
  ('41c400c0-d517-46c9-b229-73d5bba78695', 'cust_1e223b@gmail.com', 'cust_1e223b', '$2b$12$MOjuC/Nmo524W1Lh8LKMNuCx84xkXgJLfiHFdher/110YH7cumZHK', 'customer', TRUE, FALSE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T09:08:51.881362+00:00', '2026-09-26T09:08:51.881362+00:00'),
  ('17409aca-1ec2-4f42-aa05-58d44c04dda3', 'cust_7d44a1@gmail.com', 'cust_7d44a1', '$2b$12$lC92DzHJTpmXBY2j4Dbcz.HQjzjGl0XotKvrxzO.RYily289oQBvK', 'customer', TRUE, FALSE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T09:09:48.171883+00:00', '2026-09-26T09:09:48.171883+00:00'),
  ('23f5064b-4e38-4917-b8cd-60297c96cc83', 'cust_24de0e@gmail.com', 'cust_24de0e', '$2b$12$aT5ci1R/m4CTbm9H1Tcn7e9sKeGBorw0KobY3KOY64A50z/5MQ0me', 'customer', TRUE, FALSE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T09:10:33.186728+00:00', '2026-09-26T09:10:33.186728+00:00'),
  ('4e433562-c2a6-4f92-8290-e9f577d06383', 'cust_2cde38@gmail.com', 'cust_2cde38', '$2b$12$MXWdyqgmjQ9h3jgYiyx5IOsxcnvuww0AghgJtgdUV3IgWDd2Ba2ny', 'customer', TRUE, FALSE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T09:11:19.203529+00:00', '2026-09-26T09:11:19.203529+00:00'),
  ('11f42d34-4b7b-48f0-9d0a-22490a9786a6', 'cust_b6083e@gmail.com', 'cust_b6083e', '$2b$12$UAmNDCq4Dlv78vwZX1UJ/O8v1EMVDgHwEWmdkkydi/ImmRuXexwZG', 'customer', FALSE, FALSE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T09:11:58.603245+00:00', '2026-09-26T09:12:00.747067+00:00'),
  ('843ded25-41c9-4200-aafd-411ee9d92b80', 'oscarmunene900@gmail.com', 'oscar', '$2b$12$slvb5GFkZhACP1u4aCCc1emg8PWqB3k5xlH/oK9TrOF9fSU/5.m1W', 'customer', TRUE, FALSE, 'oscar munene', '0706656544', '0.00', 'KES', NULL, '2026-09-26T09:25:26.987964+00:00', '2026-09-26T09:25:26.987964+00:00'),
  ('aecf449f-f81f-4f38-ab53-32630bbf1573', 'panelowner_a8a683@example.com', 'owner_9688b3', '$2b$12$rm/RnhNaOvQxPsOl3KYUWO1XOEOrwkHPs8eYmn/l66iiwd57hA0eW', 'customer', TRUE, TRUE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T10:53:11.060940+00:00', '2026-09-26T10:53:11.060940+00:00'),
  ('0da1aae8-e7e7-4006-858c-4ba00da62ccb', 'customer_49d071@example.com', 'cust_f87317', '$2b$12$kd9HO59H6l.C/V0kvLzjU.MkEIewa98DsSn/4/jcBerhBMg0Bu7cO', 'customer', TRUE, TRUE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T10:53:11.866170+00:00', '2026-09-26T10:53:11.866170+00:00'),
  ('b00d9aa4-14fb-4633-928f-4c0a80a292a0', 'panelowner_53adf1@example.com', 'owner_4cd75a', '$2b$12$8OYvARxgwF8h6UjIIN2BX.kt1Fw1NbFe1fVh/oIwSBzo9tYrahoJm', 'customer', TRUE, TRUE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T10:53:44.667002+00:00', '2026-09-26T10:53:44.667002+00:00'),
  ('f05cd3da-7f90-4965-a21d-52dbfb449c14', 'customer_a5bd89@example.com', 'cust_252fa6', '$2b$12$x6iFMKaEta0miv0unUarTeKSc9vKdkoPhUunIyZO3S1vtILhyAkSW', 'customer', TRUE, TRUE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T10:53:45.444897+00:00', '2026-09-26T10:53:45.444897+00:00'),
  ('f8b945ff-0eac-4819-980e-e911e8c5dcc4', 'panelowner_e748d9@example.com', 'owner_057e08', '$2b$12$1wuq2tScV5EBPAF8LLes2ObvVHjk1shv5DDbtMP5/Bcg0h8T8blei', 'customer', TRUE, TRUE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T10:54:28.881714+00:00', '2026-09-26T10:54:37.012209+00:00'),
  ('ceb20492-bc03-4546-ac42-ec2cd2f414ed', 'customer_60efbb@example.com', 'cust_1a5b62', '$2b$12$DQ2X6guvyv0iWxU.0fLleOYy.BxrWh7dIKucMLFlSm/FBxcYZLIUa', 'customer', TRUE, TRUE, NULL, NULL, '0.00', 'KES', NULL, '2026-09-26T10:54:29.750940+00:00', '2026-09-26T10:54:37.012209+00:00')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  username = EXCLUDED.username,
  hashed_password = EXCLUDED.hashed_password,
  role = EXCLUDED.role,
  balance = EXCLUDED.balance,
  is_active = EXCLUDED.is_active,
  is_verified = EXCLUDED.is_verified,
  full_name = EXCLUDED.full_name,
  phone_number = EXCLUDED.phone_number,
  api_key = EXCLUDED.api_key;

-- =====================================================================
-- 8. CHILD SMM PANELS (6 TENANTS)
-- =====================================================================
INSERT INTO public.child_panels (
    id, user_id, domain, admin_username, admin_password_hash, currency,
    price_per_month, status, provisioning_step, last_error, branding_json,
    nameserver1, nameserver2, expires_at, auto_renew, notes, metadata_json,
    created_at, updated_at
) VALUES
  ('b3db140e-a93c-41cf-977b-778ae970eb53', '84facac8-6b02-42e5-9779-fe43983f5b32', 'testpanel.com', 'testadmin', '$2b$12$1ZA5zTqQA1BLUS2EmbHXT.8B5QM2clRdapeVpij0lj4b.1JHpmGV2', 'KES', '1500.00', 'active', 'active', NULL, '{"tagline": "Premium Social Media Marketing Growth", "currency": "KES", "logo_url": null, "site_name": "Testpanel SMM", "theme_color": "#8b5cf6", "contact_email": "support@testpanel.com", "whatsapp_support": null, "custom_cname_target": "cname.socialpulse.io", "default_markup_percent": 100}'::jsonb, 'ns1.socialpulse.io', 'ns2.socialpulse.io', '2026-12-14T18:26:19.572061+00:00', TRUE, NULL, NULL, '2026-09-15T18:26:19.968722+00:00', '2026-09-15T20:46:32.361539+00:00'),
  ('27f648af-fb2e-4b8a-9f4f-9cb88e6c923b', '84facac8-6b02-42e5-9779-fe43983f5b32', 'testpannel.com', 'Admin', '$2b$12$l1YEaCbEELotLqrb8kojQekOhtD/uMV1HeYNOksC2wmADTf5zSsoC', 'KES', '1500.00', 'active', 'active', NULL, '{"tagline": "Premium Social Media Marketing Growth", "currency": "KES", "logo_url": null, "site_name": "Picnic SMM", "theme_color": "#8b5cf6", "contact_email": "support@testpannel.com", "whatsapp_support": null, "custom_cname_target": "cname.socialpulse.io", "default_markup_percent": 100}'::jsonb, 'ns1.socialpulse.io', 'ns2.socialpulse.io', '2026-10-15T20:27:01.673880+00:00', TRUE, NULL, NULL, '2026-09-15T20:27:01.984848+00:00', '2026-09-26T11:02:18.464430+00:00'),
  ('c5ed6b8f-d38e-46d9-b6f7-aaafa464201b', '141ac2c8-02d3-4d71-b65f-242c326dbff0', 'boostkenya.com', 'boostadmin', '$2b$12$PmJoeCXeF.yRdEnlV3pMme/3wdXJOo5pE2gNAfK0X7bQByuxFsHh.', 'KES', '1500.00', 'active', 'pending', NULL, NULL, 'ns1.socialpulse.io', 'ns2.socialpulse.io', '2026-10-26T09:08:51.500577+00:00', TRUE, NULL, NULL, '2026-09-26T09:08:51.504600+00:00', '2026-09-26T09:08:51.504600+00:00'),
  ('7974266a-9585-421f-a5ab-c7d433da3dd1', 'aecf449f-f81f-4f38-ab53-32630bbf1573', 'testpanel-69ca7f.com', 'testadmin', '$2b$12$qNBnZEceAD3XGRpfWvVZWedVUhYYC6nQrk.jp.Y0mAmrxezPxr3dS', 'KES', '1500.00', 'active', 'pending', NULL, NULL, 'ns1.socialpulse.io', 'ns2.socialpulse.io', '2026-10-26T10:53:11.478249+00:00', TRUE, NULL, '{"payment_gateway": {"is_active": true, "payhero_api_key": "test_api_key", "gateway_provider": "payhero", "payhero_channel_id": "9999", "payhero_account_name": "Test Reseller Till"}}'::jsonb, '2026-09-26T10:53:11.478249+00:00', '2026-09-26T10:53:11.478249+00:00'),
  ('4628da58-9aad-4025-a747-a7fb31923352', 'b00d9aa4-14fb-4633-928f-4c0a80a292a0', 'testpanel-9650ce.com', 'testadmin', '$2b$12$X4GZ2RpVZ4jpn9jcNTrbOO1l6XHXU8jh7AHZXRl.hu4QGQauhlmea', 'KES', '1500.00', 'active', 'pending', NULL, NULL, 'ns1.socialpulse.io', 'ns2.socialpulse.io', '2026-10-26T10:53:45.049506+00:00', TRUE, NULL, '{"payment_gateway": {"is_active": true, "payhero_api_key": "test_api_key", "gateway_provider": "payhero", "payhero_channel_id": "9999", "payhero_account_name": "Test Reseller Till"}}'::jsonb, '2026-09-26T10:53:45.065140+00:00', '2026-09-26T10:53:45.065140+00:00'),
  ('7e1e5c5d-42dc-4f32-877e-eb4e86bfc268', 'f8b945ff-0eac-4819-980e-e911e8c5dcc4', 'testpanel-6b6573.com', 'testadmin', '$2b$12$2zjxNaz4tHMbb2bgOOXwCOFxW.lhSCnXFPcdoIiV55PjFLmxYJJ1a', 'KES', '1500.00', 'active', 'pending', NULL, NULL, 'ns1.socialpulse.io', 'ns2.socialpulse.io', '2026-10-26T10:54:29.319010+00:00', TRUE, NULL, '{"payment_gateway": {"is_active": true, "payhero_api_key": "test_api_key", "gateway_provider": "payhero", "payhero_channel_id": "9999", "payhero_account_name": "Test Reseller Till"}}'::jsonb, '2026-09-26T10:54:29.324323+00:00', '2026-09-26T10:54:29.324323+00:00')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 9. LINK TENANT IDS TO USERS
-- =====================================================================

UPDATE public.users SET tenant_id = 'c5ed6b8f-d38e-46d9-b6f7-aaafa464201b' WHERE id = '41c400c0-d517-46c9-b229-73d5bba78695';

UPDATE public.users SET tenant_id = 'c5ed6b8f-d38e-46d9-b6f7-aaafa464201b' WHERE id = '17409aca-1ec2-4f42-aa05-58d44c04dda3';

UPDATE public.users SET tenant_id = 'c5ed6b8f-d38e-46d9-b6f7-aaafa464201b' WHERE id = '23f5064b-4e38-4917-b8cd-60297c96cc83';

UPDATE public.users SET tenant_id = 'c5ed6b8f-d38e-46d9-b6f7-aaafa464201b' WHERE id = '4e433562-c2a6-4f92-8290-e9f577d06383';

UPDATE public.users SET tenant_id = 'c5ed6b8f-d38e-46d9-b6f7-aaafa464201b' WHERE id = '11f42d34-4b7b-48f0-9d0a-22490a9786a6';

UPDATE public.users SET tenant_id = '7974266a-9585-421f-a5ab-c7d433da3dd1' WHERE id = '0da1aae8-e7e7-4006-858c-4ba00da62ccb';

UPDATE public.users SET tenant_id = '4628da58-9aad-4025-a747-a7fb31923352' WHERE id = 'f05cd3da-7f90-4965-a21d-52dbfb449c14';

UPDATE public.users SET tenant_id = '7e1e5c5d-42dc-4f32-877e-eb4e86bfc268' WHERE id = 'ceb20492-bc03-4546-ac42-ec2cd2f414ed';

-- =====================================================================
-- 10. SUPPORT TICKETS (6 TICKETS)
-- =====================================================================
INSERT INTO public.tickets (
    id, user_id, order_id, tenant_id, subject, priority, status, created_at, updated_at
) VALUES
  ('6541c056-d54f-4bdf-a533-f8fefde71266', '84facac8-6b02-42e5-9779-fe43983f5b32', NULL, NULL, 'Order Delayed', 'high', 'closed', '2026-08-28T10:31:43.072432+00:00', '2026-08-28T10:33:08.869725+00:00'),
  ('76345514-1a84-4d6a-8bed-13a45af6437e', '41c400c0-d517-46c9-b229-73d5bba78695', NULL, 'c5ed6b8f-d38e-46d9-b6f7-aaafa464201b', 'Order delivery speed inquiry', 'medium', 'open', '2026-09-26T09:08:51.055619+00:00', '2026-09-26T09:08:51.055619+00:00'),
  ('c89e71bb-1ffb-45c2-a2dd-2eaddd581f28', '17409aca-1ec2-4f42-aa05-58d44c04dda3', NULL, 'c5ed6b8f-d38e-46d9-b6f7-aaafa464201b', 'Order delivery speed inquiry', 'medium', 'answered', '2026-09-26T09:09:47.734083+00:00', '2026-09-26T09:09:50.022602+00:00'),
  ('290cf660-c8b0-42ac-b085-c9d629e50adf', '23f5064b-4e38-4917-b8cd-60297c96cc83', NULL, 'c5ed6b8f-d38e-46d9-b6f7-aaafa464201b', 'Order delivery speed inquiry', 'medium', 'answered', '2026-09-26T09:10:32.687426+00:00', '2026-09-26T09:10:35.179644+00:00'),
  ('38631422-41b9-4a9f-9e21-aa231e13c788', '4e433562-c2a6-4f92-8290-e9f577d06383', NULL, 'c5ed6b8f-d38e-46d9-b6f7-aaafa464201b', 'Order delivery speed inquiry', 'medium', 'answered', '2026-09-26T09:11:18.766793+00:00', '2026-09-26T09:11:21.067537+00:00'),
  ('3ec55e08-0068-4a09-9ae8-445f6101ce17', '11f42d34-4b7b-48f0-9d0a-22490a9786a6', NULL, 'c5ed6b8f-d38e-46d9-b6f7-aaafa464201b', 'Order delivery speed inquiry', 'medium', 'closed', '2026-09-26T09:11:58.156870+00:00', '2026-09-26T09:12:00.631909+00:00')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 11. SUPPORT TICKET MESSAGES (10 MESSAGES)
-- =====================================================================
INSERT INTO public.ticket_messages (
    id, ticket_id, sender_id, message, is_admin_reply, created_at
) VALUES
  ('bd5528db-59bf-4f0b-ac58-5a9e77c7e26e', '6541c056-d54f-4bdf-a533-f8fefde71266', '84facac8-6b02-42e5-9779-fe43983f5b32', '100 Insta Views', FALSE, '2026-08-28T10:31:43.072432+00:00'),
  ('03e396bb-7156-4270-a471-dd0817683aaa', '76345514-1a84-4d6a-8bed-13a45af6437e', '41c400c0-d517-46c9-b229-73d5bba78695', 'Hello, when will my followers order start delivering?', FALSE, '2026-09-26T09:08:51.055619+00:00'),
  ('ff854b84-a427-4c27-9fe9-d2b81cc6a9e9', 'c89e71bb-1ffb-45c2-a2dd-2eaddd581f28', '17409aca-1ec2-4f42-aa05-58d44c04dda3', 'Hello, when will my followers order start delivering?', FALSE, '2026-09-26T09:09:47.734083+00:00'),
  ('ebe7e492-b1ce-4029-8623-59bb3ccbae67', 'c89e71bb-1ffb-45c2-a2dd-2eaddd581f28', '141ac2c8-02d3-4d71-b65f-242c326dbff0', 'Hello! Your order has been queued and will deliver within 15 minutes.', TRUE, '2026-09-26T09:09:50.022602+00:00'),
  ('73ce570c-dbbf-4b4a-9c05-592b86496024', '290cf660-c8b0-42ac-b085-c9d629e50adf', '23f5064b-4e38-4917-b8cd-60297c96cc83', 'Hello, when will my followers order start delivering?', FALSE, '2026-09-26T09:10:32.687426+00:00'),
  ('f9b03613-6385-4697-a938-e4aa02d6a651', '290cf660-c8b0-42ac-b085-c9d629e50adf', '141ac2c8-02d3-4d71-b65f-242c326dbff0', 'Hello! Your order has been queued and will deliver within 15 minutes.', TRUE, '2026-09-26T09:10:35.179644+00:00'),
  ('4dc01b9f-8a73-4c57-960d-12a27cd67010', '38631422-41b9-4a9f-9e21-aa231e13c788', '4e433562-c2a6-4f92-8290-e9f577d06383', 'Hello, when will my followers order start delivering?', FALSE, '2026-09-26T09:11:18.766793+00:00'),
  ('70dd78be-35c4-4d4c-b636-e5c608ae1c08', '38631422-41b9-4a9f-9e21-aa231e13c788', '141ac2c8-02d3-4d71-b65f-242c326dbff0', 'Hello! Your order has been queued and will deliver within 15 minutes.', TRUE, '2026-09-26T09:11:21.067537+00:00'),
  ('adc8b4bc-e63b-433b-9cde-69cad3914141', '3ec55e08-0068-4a09-9ae8-445f6101ce17', '11f42d34-4b7b-48f0-9d0a-22490a9786a6', 'Hello, when will my followers order start delivering?', FALSE, '2026-09-26T09:11:58.156870+00:00'),
  ('ef4eb54d-ba79-4c6c-a581-1a3688e42acf', '3ec55e08-0068-4a09-9ae8-445f6101ce17', '141ac2c8-02d3-4d71-b65f-242c326dbff0', 'Hello! Your order has been queued and will deliver within 15 minutes.', TRUE, '2026-09-26T09:12:00.497646+00:00')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- SUPABASE POST-SETUP NOTES:
-- 1. If connecting from FastAPI backend, set DATABASE_URL in your .env:
--    DATABASE_URL=postgresql+asyncpg://postgres:[YOUR-SUPABASE-PASSWORD]@[YOUR-SUPABASE-HOST]:5432/postgres
--    SYNC_DATABASE_URL=postgresql://postgres:[YOUR-SUPABASE-PASSWORD]@[YOUR-SUPABASE-HOST]:5432/postgres
-- 2. Services: If you want to populate live services catalog, either run the
--    supabase_services_seed.sql file or execute:
--    python sync_live_services.py
-- =====================================================================
