from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.api.v2.reseller import router as api_v2_router
from app.core.config import settings
from app.core.rate_limiter import limiter
from app.core.security_headers import SecurityHeadersMiddleware


import asyncio
import logging
from app.core.database import AsyncSessionLocal
from app.workers.order_tasks import sync_active_orders

logger = logging.getLogger("socialpulse.order_poller")


async def order_status_poller_loop():
    """
    Automated background worker that polls upstream providers for live order status updates
    every 15 seconds. Transitions orders (Pending -> Processing -> In Progress -> Completed/Partial/Canceled)
    and executes auto-refunds in real-time.
    """
    logger.info("[*] Automated real-time order poller started.")
    while True:
        try:
            async with AsyncSessionLocal() as session:
                checked, updated = await sync_active_orders(session)
                if updated > 0:
                    logger.info(f"[+] Real-time status update: {updated}/{checked} active orders updated from upstream provider.")
        except Exception as e:
            logger.error(f"[!] Error in automated order status poller: {e}")

        await asyncio.sleep(15)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup tasks
    print(f"[*] Initializing {settings.PROJECT_NAME} backend in {settings.ENVIRONMENT} mode...")
    
    # Auto-initialize database tables if not existing
    try:
        from app.models.base import Base
        import app.models.user
        import app.models.provider
        import app.models.service
        import app.models.order
        import app.models.transaction
        import app.models.ticket
        import app.models.child_panel
        from sqlalchemy import text
        from app.core.database import engine
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Ensure order_number sequence and column exist on orders table
            try:
                # Step 1: Create sequence if it doesn't exist
                await conn.execute(text("CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 29100001;"))
                print("[+] order_number_seq sequence ready.")

                # Step 2: Add order_number column if missing
                await conn.execute(text("""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name='orders' AND column_name='order_number'
                        ) THEN
                            ALTER TABLE orders ADD COLUMN order_number INTEGER DEFAULT nextval('order_number_seq');
                        END IF;
                    END $$;
                """))
                print("[+] order_number column verified.")

                # Step 3: Create unique index (separate statement)
                await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_order_number ON orders (order_number);"))
                print("[+] order_number index verified.")

                # Step 4: Ensure fallback columns exist on services table
                await conn.execute(text("""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name='services' AND column_name='fallback_provider_id'
                        ) THEN
                            ALTER TABLE services ADD COLUMN fallback_provider_id UUID REFERENCES providers(id) ON DELETE SET NULL;
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name='services' AND column_name='fallback_service_id'
                        ) THEN
                            ALTER TABLE services ADD COLUMN fallback_service_id VARCHAR(100);
                        END IF;
                    END $$;
                """))
                print("[+] fallback provider columns on services verified.")

                # Step 5 & 6: One-time execution lock to purge demo orders and zero subscriber demo cash ONCE
                await conn.execute(text("""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='_system_migration_lock') THEN
                            CREATE TABLE _system_migration_lock (id SERIAL PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
                            UPDATE users SET balance = 0.00 WHERE email != 'muneneoscar599@gmail.com';
                            DELETE FROM orders;
                            ALTER SEQUENCE IF EXISTS order_number_seq RESTART WITH 29100001;
                        END IF;
                    END $$;
                """))
                # Step 7: Convert platform column to VARCHAR(50) so all platforms work cleanly without enum locks
                await conn.execute(text("""
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'services' AND column_name = 'platform' AND udt_name = 'platform_enum'
                        ) THEN
                            ALTER TABLE services ALTER COLUMN platform TYPE VARCHAR(50) USING platform::text;
                        END IF;
                    END $$;
                """))
                await conn.execute(text("""
                    UPDATE services 
                    SET platform = 'whatsapp' 
                    WHERE (name ILIKE '%whatsapp%' OR category ILIKE '%whatsapp%') 
                      AND platform != 'whatsapp';
                """))
                await conn.execute(text("""
                    UPDATE services 
                    SET is_active = false 
                    WHERE platform NOT IN ('tiktok', 'facebook', 'instagram', 'whatsapp', 'telegram');
                """))
                await conn.execute(text("""
                    UPDATE services 
                    SET is_active = true 
                    WHERE platform IN ('tiktok', 'facebook', 'instagram', 'whatsapp', 'telegram');
                """))
                print("[+] Platform restriction verified (TikTok, Facebook, Instagram, WhatsApp, Telegram).")

                # Step 8: Multi-Tenancy & Child Panel Provisioning Schema Migration
                await conn.execute(text("""
                    DO $$
                    BEGIN
                        -- Child panels new columns
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child_panels' AND column_name='provisioning_step') THEN
                            ALTER TABLE child_panels ADD COLUMN provisioning_step VARCHAR(50) DEFAULT 'pending';
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child_panels' AND column_name='last_error') THEN
                            ALTER TABLE child_panels ADD COLUMN last_error TEXT;
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child_panels' AND column_name='branding_json') THEN
                            ALTER TABLE child_panels ADD COLUMN branding_json JSONB;
                        END IF;
                        -- Convert status from enum to VARCHAR(50) if necessary
                        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='child_panels' AND column_name='status' AND udt_name='child_panel_status_enum') THEN
                            ALTER TABLE child_panels ALTER COLUMN status TYPE VARCHAR(50) USING status::text;
                        END IF;

                        -- Add tenant_id to users, orders, transactions, tickets
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='tenant_id') THEN
                            ALTER TABLE users ADD COLUMN tenant_id UUID REFERENCES child_panels(id) ON DELETE SET NULL;
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='tenant_id') THEN
                            ALTER TABLE orders ADD COLUMN tenant_id UUID REFERENCES child_panels(id) ON DELETE SET NULL;
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='tenant_id') THEN
                            ALTER TABLE transactions ADD COLUMN tenant_id UUID REFERENCES child_panels(id) ON DELETE SET NULL;
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='tenant_id') THEN
                            ALTER TABLE tickets ADD COLUMN tenant_id UUID REFERENCES child_panels(id) ON DELETE SET NULL;
                        END IF;
                    END $$;
                """))
                print("[+] Multi-Tenancy & Child Panel Provisioning columns verified.")

                # Step 9: Ensure wholesale_rate column exists on services table and is populated
                await conn.execute(text("""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name='services' AND column_name='wholesale_rate'
                        ) THEN
                            ALTER TABLE services ADD COLUMN wholesale_rate NUMERIC(12, 2) DEFAULT 0.00;
                        END IF;
                        UPDATE services 
                        SET wholesale_rate = ROUND(provider_rate * 1.30, 2) 
                        WHERE (wholesale_rate IS NULL OR wholesale_rate <= 0.001) AND provider_rate > 0;
                    END $$;
                """))
                print("[+] wholesale_rate column on services verified and populated.")

                # Step 10: Clean up legacy providers (smm_africa, delix) and orphaned services
                await conn.execute(text("""
                    DO $$
                    BEGIN
                        UPDATE services 
                        SET fallback_provider_id = NULL, fallback_service_id = NULL 
                        WHERE fallback_provider_id IN (SELECT id FROM providers WHERE slug NOT IN ('jap', 'secsers', 'resellersmm'));

                        DELETE FROM orders 
                        WHERE provider_id IN (SELECT id FROM providers WHERE slug NOT IN ('jap', 'secsers', 'resellersmm'));

                        DELETE FROM services 
                        WHERE provider_id IN (SELECT id FROM providers WHERE slug NOT IN ('jap', 'secsers', 'resellersmm'))
                           OR provider_id IS NULL
                           OR provider_id NOT IN (SELECT id FROM providers WHERE id IS NOT NULL)
                           OR name ILIKE '%delix%' 
                           OR category ILIKE '%delix%';

                        DELETE FROM providers 
                        WHERE slug NOT IN ('jap', 'secsers', 'resellersmm');
                    END $$;
                """))
                print("[+] Legacy providers and orphaned services cleanup verified.")

                # Step 11: Remove child panels that match main platform domains (prevents tenant mode on main site)
                await conn.execute(text("""
                    DELETE FROM child_panels 
                    WHERE domain IN (
                        'socialpulse.io', 'www.socialpulse.io',
                        'socialpulsesmm.com', 'www.socialpulsesmm.com',
                        'social-pulse-smm.vercel.app', 'social-pulse-smm.onrender.com', 'social-pulse-smm-0geu.onrender.com',
                        'localhost', '127.0.0.1'
                    );
                """))
                print("[+] Cleaned up any child panels matching main platform domains.")

                # Step 12: One-time purge of all dummy balances on live database
                await conn.execute(text("""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='_live_dummy_funds_purged_lock_v2') THEN
                            CREATE TABLE _live_dummy_funds_purged_lock_v2 (id SERIAL PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
                            UPDATE users SET balance = 0.00;
                            DELETE FROM transactions;
                            DELETE FROM orders;
                            ALTER SEQUENCE IF EXISTS order_number_seq RESTART WITH 29100001;
                        END IF;
                    END $$;
                """))
                # Step 12: Multi-tenant user email/username uniqueness migration
                await conn.execute(text("""
                    DO $$
                    BEGIN
                        -- Drop global unique indexes if they exist
                        IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='users' AND indexname='ix_users_email') THEN
                            DROP INDEX IF EXISTS ix_users_email;
                        END IF;
                        IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='users' AND indexname='ix_users_username') THEN
                            DROP INDEX IF EXISTS ix_users_username;
                        END IF;

                        -- Drop unique constraints if defined as constraints
                        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_email_key') THEN
                            ALTER TABLE users DROP CONSTRAINT users_email_key;
                        END IF;
                        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_username_key') THEN
                            ALTER TABLE users DROP CONSTRAINT users_username_key;
                        END IF;

                        -- Create tenant-scoped unique indexes
                        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_main ON users (LOWER(email)) WHERE tenant_id IS NULL;
                        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_main ON users (LOWER(username)) WHERE tenant_id IS NULL;

                        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_tenant ON users (LOWER(email), tenant_id) WHERE tenant_id IS NOT NULL;
                        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_tenant ON users (LOWER(username), tenant_id) WHERE tenant_id IS NOT NULL;

                        -- Lookup indexes for fast queries
                        CREATE INDEX IF NOT EXISTS ix_users_email_lookup ON users (LOWER(email));
                        CREATE INDEX IF NOT EXISTS ix_users_username_lookup ON users (LOWER(username));
                    END $$;
                """))
                print("[+] Multi-tenant user uniqueness indexes verified.")

                # Step 13: Auto-configure skakegains.com PayHero Payment Gateway
                await conn.execute(text("""
                    UPDATE child_panels
                    SET metadata_json = jsonb_set(
                        jsonb_set(
                            jsonb_set(
                                COALESCE(metadata_json, '{}'::jsonb),
                                '{payment_gateway}',
                                jsonb_build_object(
                                    'gateway_provider', 'payhero',
                                    'is_active', true,
                                    'payhero_channel_id', '14160',
                                    'payhero_account_name', 'shakegains',
                                    'payhero_account_number', '0010542',
                                    'payhero_paybill', '997960',
                                    'payhero_api_key', 'qrQKEw0HwQ73lnkXo7hP',
                                    'payhero_api_secret', 'F9fPm9T1Qu7g0MGDLaFakTuqOF9iZIPRVo9PyynT'
                                )
                            ),
                            '{payment_account_name}', '"shakegains"'
                        ),
                        '{payment_account_number}', '"0010542"'
                    )
                    WHERE domain ILIKE '%skakegains%' OR domain ILIKE '%shakegains%';
                """))
                print("[+] skakegains.com PayHero gateway initialized.")

                # Step 14: Dual-Provider Catalog Curation & Price Calibration (Beat Delix Gains, lowest price 18.70 KES everywhere)
                # Ensure JAP and ResellerSMM providers are active
                await conn.execute(text("""
                    UPDATE providers SET is_active = TRUE WHERE slug IN ('jap', 'resellersmm');
                """))

                # Ensure JAP budget TikTok Likes and cheap IG bot followers are active
                await conn.execute(text("""
                    UPDATE services 
                    SET is_active = TRUE 
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'jap')
                      AND (
                          (platform = 'tiktok' AND name ILIKE '%like%' AND name NOT ILIKE '%view%')
                          OR (platform = 'instagram' AND name ILIKE '%follower%' AND name NOT ILIKE '%view%' AND name NOT ILIKE '%reel%')
                      );
                """))

                # Deactivate JAP services where ResellerSMM is superior (Views, Reels, Telegram, Nigerian/African)
                await conn.execute(text("""
                    UPDATE services 
                    SET is_active = FALSE 
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'jap')
                      AND (
                          (platform = 'tiktok' AND (name ILIKE '%view%' OR category ILIKE '%view%'))
                          OR (platform = 'instagram' AND (name ILIKE '%view%' OR category ILIKE '%view%' OR name ILIKE '%reel%' OR category ILIKE '%reel%'))
                          OR (platform = 'telegram' AND (name ILIKE '%member%' OR category ILIKE '%member%'))
                          OR (name ILIKE '%nigeria%' OR category ILIKE '%nigeria%' OR name ILIKE '%africa%' OR category ILIKE '%africa%')
                      );
                """))

                # Deactivate ResellerSMM TikTok Likes and Bot Followers in favor of JAP
                await conn.execute(text("""
                    UPDATE services 
                    SET is_active = FALSE 
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'resellersmm')
                      AND (
                          (platform = 'tiktok' AND (name ILIKE '%like%' OR category ILIKE '%like%'))
                          OR (platform = 'instagram' AND (name ILIKE '%bot%' OR name ILIKE '%high drop%' OR name ILIKE '%no refill%') AND (name ILIKE '%follower%' OR category ILIKE '%follower%'))
                      );
                """))

                # Ensure ResellerSMM services are active for Views, Reels, Telegram, Nigerian/African
                await conn.execute(text("""
                    UPDATE services 
                    SET is_active = TRUE 
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'resellersmm')
                      AND (
                          (platform = 'tiktok' AND (name ILIKE '%view%' OR category ILIKE '%view%'))
                          OR (platform = 'instagram' AND (name ILIKE '%view%' OR category ILIKE '%view%' OR name ILIKE '%reel%' OR category ILIKE '%reel%'))
                          OR (platform = 'telegram' AND (name ILIKE '%member%' OR category ILIKE '%member%'))
                          OR (name ILIKE '%nigeria%' OR category ILIKE '%nigeria%' OR name ILIKE '%africa%' OR category ILIKE '%africa%')
                      );
                """))

                # Baseline Pricing Formula (30% SocialPulse Wholesale / 100% Retail)
                await conn.execute(text("""
                    UPDATE services
                    SET wholesale_rate = ROUND(provider_rate * 1.30, 2),
                        selling_rate = ROUND(provider_rate * 2.00, 2),
                        markup_type = 'percentage',
                        markup_value = 100.00
                    WHERE markup_type != 'manual' AND provider_rate > 0;
                """))

                # Calibrate ultra-cheap views & members
                await conn.execute(text("""
                    UPDATE services
                    SET selling_rate = 0.85, wholesale_rate = 0.50, markup_type = 'manual'
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'resellersmm')
                      AND platform = 'tiktok' AND name ILIKE '%view%' AND provider_rate < 0.60;
                """))
                await conn.execute(text("""
                    UPDATE services
                    SET selling_rate = 0.80, wholesale_rate = 0.40, markup_type = 'manual'
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'resellersmm')
                      AND platform = 'instagram' AND (name ILIKE '%view%' OR name ILIKE '%reel%') AND provider_rate < 0.50;
                """))
                await conn.execute(text("""
                    UPDATE services
                    SET selling_rate = 0.90, wholesale_rate = 0.45, markup_type = 'manual'
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'resellersmm')
                      AND platform = 'telegram' AND name ILIKE '%member%' AND provider_rate < 0.50;
                """))

                # TikTok Likes Calibration (Delix tier matching with lowest price 18.70 KES everywhere):
                # Delix tier 1: TT Likes [Max 100K] (#9423) -> 18.70 KES
                await conn.execute(text("""
                    UPDATE services
                    SET selling_rate = 18.70, wholesale_rate = 18.70, markup_type = 'manual'
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'jap')
                      AND platform = 'tiktok' AND provider_service_id = '9423';
                """))
                # Delix tier 2: TT Likes [Max 10M] (#9301) -> 25.00 KES
                await conn.execute(text("""
                    UPDATE services
                    SET selling_rate = 25.00, wholesale_rate = 24.00, markup_type = 'manual'
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'jap')
                      AND platform = 'tiktok' AND provider_service_id = '9301';
                """))
                # Delix tier 3: TT Likes Fast [Max 5K - 500K] (#10385, #9179) -> 33.00 KES
                await conn.execute(text("""
                    UPDATE services
                    SET selling_rate = 33.00, wholesale_rate = 28.00, markup_type = 'manual'
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'jap')
                      AND platform = 'tiktok' AND provider_service_id IN ('10385', '9179');
                """))
                # Delix tier 4: TT Likes 30-Day Refill (#10173) -> 36.00 KES
                await conn.execute(text("""
                    UPDATE services
                    SET selling_rate = 36.00, wholesale_rate = 33.00, markup_type = 'manual'
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'jap')
                      AND platform = 'tiktok' AND (provider_service_id = '10173' OR (name ILIKE '%like%' AND name ILIKE '%30d%'));
                """))
                # Delix tier 5: TT Likes 60-Day Refill (#9397) -> 39.00 KES
                await conn.execute(text("""
                    UPDATE services
                    SET selling_rate = 39.00, wholesale_rate = 37.00, markup_type = 'manual'
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'jap')
                      AND platform = 'tiktok' AND (provider_service_id = '9397' OR (name ILIKE '%like%' AND name ILIKE '%60d%'));
                """))
                # TikTok Live Likes (#8063) -> 3.20 KES
                await conn.execute(text("""
                    UPDATE services
                    SET selling_rate = 3.20, wholesale_rate = 2.30, markup_type = 'manual'
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'jap')
                      AND platform = 'tiktok' AND provider_service_id = '8063';
                """))
                # Instagram Bot Followers -> 39.00 KES
                await conn.execute(text("""
                    UPDATE services
                    SET selling_rate = 39.00, wholesale_rate = 28.00, markup_type = 'manual'
                    WHERE provider_id IN (SELECT id FROM providers WHERE slug = 'jap')
                      AND platform = 'instagram' AND name ILIKE '%follower%' AND provider_rate < 32.00;
                """))

                # Set child panel default_markup_percent to 0 so all child panels (skakegains.com) display identical retail prices to SocialPulse
                await conn.execute(text("""
                    UPDATE child_panels
                    SET branding_json = jsonb_set(
                        COALESCE(branding_json, '{}'::jsonb),
                        '{default_markup_percent}',
                        '0'::jsonb
                    )
                    WHERE domain ILIKE '%skakegains%' OR domain ILIKE '%shakegains%';
                """))

                # Sync tenant admin balance with parent wholesale balance
                await conn.execute(text("""
                    UPDATE users u
                    SET balance = parent.balance
                    FROM child_panels cp
                    JOIN users parent ON cp.user_id = parent.id
                    WHERE u.tenant_id = cp.id AND u.role = 'admin';
                """))

                from app.core.cache import clear_all_cache
                clear_all_cache()
                print("[+] Step 14: Dual-Provider catalog curated & rates calibrated (lowest price 18.70 KES everywhere).")
            except Exception as e:
                print(f"[!] Startup schema fix error: {e}")
        print("[+] Database schema verified and initialized.")
    except Exception as exc:
        print(f"[!] Warning during database init: {exc}")

    # Bootstrap super_admin account if not exists
    try:
        from sqlalchemy import select
        from app.models.user import User, UserRole
        from app.core.security import get_password_hash
        from decimal import Decimal

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(User).where(User.email == "muneneoscar599@gmail.com")
            )
            existing = result.scalars().first()
            if not existing:
                admin_user = User(
                    email="muneneoscar599@gmail.com",
                    username="admin",
                    hashed_password=get_password_hash("@Oscar599"),
                    role=UserRole.SUPER_ADMIN,
                    is_active=True,
                    is_verified=True,
                    full_name="Spencer Admin",
                    balance=Decimal("10.00"),
                    currency="KES",
                )
                db.add(admin_user)
                await db.commit()
                print("[+] Super Admin account bootstrapped successfully.")
            else:
                print("[*] Super Admin account already exists.")
    except Exception as exc:
        print(f"[!] Warning during admin bootstrap: {exc}")

    # Step: Sync child panel admin password for skakegains.com (Admin: ken -> @keN450000)
    try:
        from app.models.child_panel import ChildPanel
        from sqlalchemy import or_
        async with AsyncSessionLocal() as db:
            cp_res = await db.execute(
                select(ChildPanel).where(
                    or_(
                        ChildPanel.domain.ilike("%skakegains%"),
                        ChildPanel.domain.ilike("%shakegains%"),
                        ChildPanel.domain.ilike("%shakesgains%"),
                    )
                )
            )
            panels = cp_res.scalars().all()
            new_hash = get_password_hash("@keN4500")
            for p in panels:
                p.domain = "skakegains.com"
                p.admin_username = "ken"
                p.admin_password_hash = new_hash

                # 1. Ensure 'ken' exists as a Parent Account on SocialPulse (tenant_id IS NULL)
                parent_res = await db.execute(select(User).where(User.username == "ken", User.tenant_id.is_(None)))
                ken_parent = parent_res.scalars().first()
                if not ken_parent:
                    ken_parent = User(
                        email="ken@skakegains.com",
                        username="ken",
                        full_name="Ken (Skakegains Parent Account)",
                        hashed_password=new_hash,
                        role=UserRole.CUSTOMER,
                        tenant_id=None,
                        balance=Decimal("0.00"),
                        is_active=True,
                        is_verified=True,
                        currency=p.currency or "KES",
                    )
                    db.add(ken_parent)
                    await db.flush()
                else:
                    ken_parent.email = "ken@skakegains.com"
                    ken_parent.hashed_password = new_hash
                    ken_parent.is_active = True
                    db.add(ken_parent)

                # Link child panel ownership to parent ken
                p.user_id = ken_parent.id
                db.add(p)

                # 2. Also ensure 'ken' exists as Tenant Admin on skakegains (tenant_id == p.id)
                user_res = await db.execute(select(User).where(User.username == "ken", User.tenant_id == p.id))
                ken_user = user_res.scalars().first()
                if not ken_user:
                    ken_user = User(
                        email="ken@skakegains.com",
                        username="ken",
                        full_name="Ken (skakegains.com Admin)",
                        hashed_password=new_hash,
                        role=UserRole.ADMIN,
                        tenant_id=p.id,
                        balance=ken_parent.balance,
                        is_active=True,
                        is_verified=True,
                        currency=p.currency or "KES",
                    )
                    db.add(ken_user)
                else:
                    ken_user.email = "ken@skakegains.com"
                    ken_user.full_name = "Ken (skakegains.com Admin)"
                    ken_user.hashed_password = new_hash
                    ken_user.role = UserRole.ADMIN
                    ken_user.tenant_id = p.id
                    ken_user.is_active = True
                    ken_user.balance = ken_parent.balance
                    db.add(ken_user)
            await db.commit()
            print("[+] Successfully synced ken as parent account on SocialPulse and admin for skakegains.com.")
    except Exception as exc:
        print(f"[!] Warning during child panel admin password sync: {exc}")

    # Step: Set SkakeGains branding (logo, site name, tagline) for skakegains.com child panel
    try:
        from sqlalchemy.orm.attributes import flag_modified
        async with AsyncSessionLocal() as db:
            cp_res = await db.execute(
                select(ChildPanel).where(ChildPanel.domain.ilike("%skakegains%"))
            )
            panels = cp_res.scalars().all()
            for p in panels:
                branding = dict(p.branding_json or {})
                branding["site_name"] = "Skakegains SMM"
                branding["tagline"] = "More Followers • More Likes"
                branding["logo_url"] = "/skakegains-logo.png"
                branding["contact_email"] = "support@skakegains.com"
                branding["theme_color"] = branding.get("theme_color", "#10b981")
                branding["whatsapp_channel_url"] = "https://whatsapp.com/channel/0029Vb8c54F0bIdka4i2Xh2M"
                p.branding_json = branding
                flag_modified(p, "branding_json")
                db.add(p)
            await db.commit()
            print("[+] SkakeGains branding (logo, site name) updated successfully.")
    except Exception as exc:
        print(f"[!] Warning during SkakeGains branding update: {exc}")

    # Start background poller immediately so startup yields without delay
    poller_task = asyncio.create_task(order_status_poller_loop())

    # Background service sync only if services table is completely empty
    async def initial_services_check():
        try:
            from sqlalchemy import select, func
            from app.models.service import Service
            from app.workers.service_sync import sync_services_from_provider
            async with AsyncSessionLocal() as db:
                count_res = await db.execute(select(func.count(Service.id)))
                service_count = count_res.scalar() or 0
                if service_count == 0:
                    print("[*] No services found in DB. Starting background initial sync...")
                    total, created, updated = await sync_services_from_provider(db, provider_slug="resellersmm")
                    print(f"[+] Initial service sync complete: {total} fetched, {created} created, {updated} updated.")
                    from app.core.cache import clear_all_cache
                    clear_all_cache()
                else:
                    print(f"[*] Services already initialized ({service_count} active in DB). Skipping blocking sync.")
        except Exception as exc:
            print(f"[!] Warning during background service check: {exc}")

    asyncio.create_task(initial_services_check())
    yield
    # Shutdown tasks
    print(f"[*] Shutting down {settings.PROJECT_NAME} backend...")
    poller_task.cancel()
    try:
        await poller_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="SocialPulse - Production-ready Social Media Marketing Reseller Platform (SMM Panel) API",
    version="1.0.1",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Register SlowAPI State and Exception Handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    for err in errors:
        loc = err.get("loc", [])
        if "phone_number" in loc:
            return JSONResponse(
                status_code=422,
                content={"detail": "Incorrect phone number. Please enter a valid M-Pesa number (e.g. 0712345678 or 254712345678)."}
            )
        if "amount" in loc:
            return JSONResponse(
                status_code=422,
                content={"detail": "Invalid amount entered. Please enter a valid deposit amount."}
            )
    first_msg = errors[0].get("msg", "Invalid input submitted.") if errors else "Invalid input submitted."
    return JSONResponse(
        status_code=422,
        content={"detail": first_msg}
    )

# Register Security Headers Middleware
app.add_middleware(SecurityHeadersMiddleware)

# Configure CORS Middleware
allowed_origins = [str(origin).rstrip("/") for origin in settings.BACKEND_CORS_ORIGINS] if settings.BACKEND_CORS_ORIGINS else ["*"]
dev_origins = [
    "http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000",
    "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175", "http://127.0.0.1:3000"
]
for dev_o in dev_origins:
    if dev_o not in allowed_origins:
        allowed_origins.append(dev_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://[a-zA-Z0-9.-]+(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register GZip Compression (compress JSON payloads > 1000 bytes)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Include API v1 Router (/api/v1/...)
app.include_router(api_router, prefix=settings.API_V1_STR)

# Include Standard Reseller API v2 Router (/api/v2)
app.include_router(api_v2_router)


@app.get("/", tags=["Root"])
async def root():
    return JSONResponse(
        content={
            "project": settings.PROJECT_NAME,
            "version": "1.0.1",
            "status": "online",
            "docs": "/docs",
            "reseller_api_v2": "/api/v2",
            "health": f"{settings.API_V1_STR}/health"
        }
    )
