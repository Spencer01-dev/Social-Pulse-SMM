from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
    Automated background worker that polls Delix Gains KE for live order status updates
    every 15 seconds. Transitions orders (Pending -> Processing -> In Progress -> Completed/Partial/Canceled)
    and executes auto-refunds in real-time.
    """
    logger.info("[*] Automated Delix Gains real-time order poller started.")
    while True:
        try:
            async with AsyncSessionLocal() as session:
                checked, updated = await sync_active_orders(session)
                if updated > 0:
                    logger.info(f"[+] Real-time status update: {updated}/{checked} active orders updated from Delix Gains.")
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
                await conn.execute(text("CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 29100001;"))
                await conn.execute(text("""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name='orders' AND column_name='order_number'
                        ) THEN
                            ALTER TABLE orders ADD COLUMN order_number INTEGER DEFAULT nextval('order_number_seq');
                            CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_order_number ON orders (order_number);
                        END IF;
                    END $$;
                """))
            except Exception as e:
                print(f"[*] Note on order_number DDL check: {e}")
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
                    balance=Decimal("200.00"),
                    currency="KES",
                )
                db.add(admin_user)
                await db.commit()
                print("[+] Super Admin account bootstrapped successfully.")
            else:
                print("[*] Super Admin account already exists.")
    except Exception as exc:
        print(f"[!] Warning during admin bootstrap: {exc}")

    # Auto-sync services from Delix Gains on startup
    try:
        from app.workers.service_sync import sync_services_from_provider

        async with AsyncSessionLocal() as db:
            total, created, updated = await sync_services_from_provider(db, provider_slug="delix")
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
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin).rstrip("/") for origin in settings.BACKEND_CORS_ORIGINS] or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
