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
