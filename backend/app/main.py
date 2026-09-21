from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
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

    # Auto-sync services from JustAnotherPanel on startup
    try:
        from app.workers.service_sync import sync_services_from_provider

        async with AsyncSessionLocal() as db:
            total, created, updated = await sync_services_from_provider(db, provider_slug="jap")
            print(f"[+] Service sync complete: {total} fetched, {created} created, {updated} updated.")
    except Exception as exc:
        print(f"[!] Warning during service sync: {exc}")

    poller_task = asyncio.create_task(order_status_poller_loop())
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
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Register SlowAPI State and Exception Handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
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
            "version": "1.0.0",
            "status": "online",
            "docs": "/docs",
            "reseller_api_v2": "/api/v2",
            "health": f"{settings.API_V1_STR}/health"
        }
    )
