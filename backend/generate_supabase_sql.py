import json
from decimal import Decimal

def escape_sql(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, dict):
        # JSON
        s = json.dumps(val).replace("'", "''")
        return f"'{s}'::jsonb"
    # String / UUID / datetime
    val_str = str(val).replace("'", "''")
    return f"'{val_str}'"

with open("db_dump_records.json", "r", encoding="utf-8") as f:
    data = json.load(f)

users = data["users"]
providers = data["providers"]
child_panels = data["child_panels"]
tickets = data["tickets"]
ticket_messages = data["ticket_messages"]
alembic_version = data["alembic_version"]

out = []

out.append("""-- =====================================================================
-- SOCIALPULSE SMM RESELLER PLATFORM - FULL SUPABASE DATABASE SETUP SCRIPT
-- =====================================================================
-- This SQL script contains:
--   1. PostgreSQL Extensions & Custom Types / Enums
--   2. Order Sequence (order_number_seq starting at 29100001)
--   3. All Application Tables & Relationships (DDL)
--   4. Performance Indexes & Constraints
--   5. All 16 Registered Users with Encrypted Passwords, Roles & Balances
--   6. Configured Upstream Providers (JustAnotherPanel & Secsers)
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
""")

# Alembic version insertion
out.append("""-- =====================================================================
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
""")

# Upstream Providers
out.append("""-- =====================================================================
-- 6. UPSTREAM PROVIDERS
-- =====================================================================
INSERT INTO public.providers (
    id, name, slug, api_url, api_key_encrypted, is_active, balance, currency, description, created_at, updated_at
) VALUES""")
prov_rows = []
for p in providers:
    row_str = f"({escape_sql(p['id'])}, {escape_sql(p['name'])}, {escape_sql(p['slug'])}, {escape_sql(p['api_url'])}, {escape_sql(p['api_key_encrypted'])}, {escape_sql(p['is_active'])}, {escape_sql(p['balance'])}, {escape_sql(p['currency'])}, {escape_sql(p['description'])}, {escape_sql(p['created_at'])}, {escape_sql(p['updated_at'])})"
    prov_rows.append("  " + row_str)
out.append(",\n".join(prov_rows) + "\nON CONFLICT (id) DO NOTHING;\n")

# Users
out.append(f"""-- =====================================================================
-- 7. REGISTERED USERS ({len(users)} SIGNED UP ACCOUNTS)
-- =====================================================================
-- All bcrypt hashed passwords and user attributes are preserved identically.
INSERT INTO public.users (
    id, email, username, hashed_password, role, is_active, is_verified,
    full_name, phone_number, balance, currency, api_key, created_at, updated_at
) VALUES""")
user_rows = []
for u in users:
    # note: tenant_id will be linked after child_panels table is populated
    row_str = f"({escape_sql(u['id'])}, {escape_sql(u['email'])}, {escape_sql(u['username'])}, {escape_sql(u['hashed_password'])}, '{u['role']}', {escape_sql(u['is_active'])}, {escape_sql(u['is_verified'])}, {escape_sql(u['full_name'])}, {escape_sql(u['phone_number'])}, {escape_sql(u['balance'])}, {escape_sql(u['currency'])}, {escape_sql(u['api_key'])}, {escape_sql(u['created_at'])}, {escape_sql(u['updated_at'])})"
    user_rows.append("  " + row_str)
out.append(",\n".join(user_rows) + "\nON CONFLICT (id) DO UPDATE SET\n"
           "  email = EXCLUDED.email,\n"
           "  username = EXCLUDED.username,\n"
           "  hashed_password = EXCLUDED.hashed_password,\n"
           "  role = EXCLUDED.role,\n"
           "  balance = EXCLUDED.balance,\n"
           "  is_active = EXCLUDED.is_active,\n"
           "  is_verified = EXCLUDED.is_verified,\n"
           "  full_name = EXCLUDED.full_name,\n"
           "  phone_number = EXCLUDED.phone_number,\n"
           "  api_key = EXCLUDED.api_key;\n")

# Child Panels
out.append(f"""-- =====================================================================
-- 8. CHILD SMM PANELS ({len(child_panels)} TENANTS)
-- =====================================================================
INSERT INTO public.child_panels (
    id, user_id, domain, admin_username, admin_password_hash, currency,
    price_per_month, status, provisioning_step, last_error, branding_json,
    nameserver1, nameserver2, expires_at, auto_renew, notes, metadata_json,
    created_at, updated_at
) VALUES""")
panel_rows = []
for cp in child_panels:
    row_str = f"({escape_sql(cp['id'])}, {escape_sql(cp['user_id'])}, {escape_sql(cp['domain'])}, {escape_sql(cp['admin_username'])}, {escape_sql(cp['admin_password_hash'])}, {escape_sql(cp['currency'])}, {escape_sql(cp['price_per_month'])}, {escape_sql(cp['status'])}, {escape_sql(cp['provisioning_step'])}, {escape_sql(cp['last_error'])}, {escape_sql(cp['branding_json'])}, {escape_sql(cp['nameserver1'])}, {escape_sql(cp['nameserver2'])}, {escape_sql(cp['expires_at'])}, {escape_sql(cp['auto_renew'])}, {escape_sql(cp['notes'])}, {escape_sql(cp['metadata_json'])}, {escape_sql(cp['created_at'])}, {escape_sql(cp['updated_at'])})"
    panel_rows.append("  " + row_str)
out.append(",\n".join(panel_rows) + "\nON CONFLICT (id) DO NOTHING;\n")

# Update Users with Tenant ID
out.append("""-- =====================================================================
-- 9. LINK TENANT IDS TO USERS
-- =====================================================================
""")
for u in users:
    if u.get('tenant_id'):
        out.append(f"UPDATE public.users SET tenant_id = {escape_sql(u['tenant_id'])} WHERE id = {escape_sql(u['id'])};\n")

# Support Tickets
out.append(f"""-- =====================================================================
-- 10. SUPPORT TICKETS ({len(tickets)} TICKETS)
-- =====================================================================
INSERT INTO public.tickets (
    id, user_id, order_id, tenant_id, subject, priority, status, created_at, updated_at
) VALUES""")
t_rows = []
for t in tickets:
    row_str = f"({escape_sql(t['id'])}, {escape_sql(t['user_id'])}, {escape_sql(t['order_id'])}, {escape_sql(t['tenant_id'])}, {escape_sql(t['subject'])}, '{t['priority']}', '{t['status']}', {escape_sql(t['created_at'])}, {escape_sql(t['updated_at'])})"
    t_rows.append("  " + row_str)
out.append(",\n".join(t_rows) + "\nON CONFLICT (id) DO NOTHING;\n")

# Support Ticket Messages
out.append(f"""-- =====================================================================
-- 11. SUPPORT TICKET MESSAGES ({len(ticket_messages)} MESSAGES)
-- =====================================================================
INSERT INTO public.ticket_messages (
    id, ticket_id, sender_id, message, is_admin_reply, created_at
) VALUES""")
tm_rows = []
for tm in ticket_messages:
    row_str = f"({escape_sql(tm['id'])}, {escape_sql(tm['ticket_id'])}, {escape_sql(tm['sender_id'])}, {escape_sql(tm['message'])}, {escape_sql(tm['is_admin_reply'])}, {escape_sql(tm['created_at'])})"
    tm_rows.append("  " + row_str)
out.append(",\n".join(tm_rows) + "\nON CONFLICT (id) DO NOTHING;\n")

# Footer instructions
out.append("""-- =====================================================================
-- SUPABASE POST-SETUP NOTES:
-- 1. If connecting from FastAPI backend, set DATABASE_URL in your .env:
--    DATABASE_URL=postgresql+asyncpg://postgres:[YOUR-SUPABASE-PASSWORD]@[YOUR-SUPABASE-HOST]:5432/postgres
--    SYNC_DATABASE_URL=postgresql://postgres:[YOUR-SUPABASE-PASSWORD]@[YOUR-SUPABASE-HOST]:5432/postgres
-- 2. Services: If you want to populate live services catalog, either run the
--    supabase_services_seed.sql file or execute:
--    python sync_live_services.py
-- =====================================================================
""")

final_sql = "\n".join(out)

# Write to root and backend
with open("c:/Users/SPENCER/Desktop/SMM/supabase_schema_and_users.sql", "w", encoding="utf-8") as f:
    f.write(final_sql)

with open("c:/Users/SPENCER/Desktop/SMM/backend/supabase_schema_and_users.sql", "w", encoding="utf-8") as f:
    f.write(final_sql)

print(f"Generated supabase_schema_and_users.sql successfully! Total size: {len(final_sql)} bytes")
