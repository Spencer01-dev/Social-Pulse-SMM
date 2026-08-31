import time
from datetime import datetime, timezone
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.schemas.health import HealthCheckResponse, ServiceStatus

router = APIRouter()


@router.get("/health", response_model=HealthCheckResponse, tags=["Health"])
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Comprehensive system health check:
    - Verifies API process is running
    - Tests asynchronous PostgreSQL connection latency
    - Tests Redis connectivity
    """
    # 1. Check PostgreSQL Database
    db_status = ServiceStatus(status="unknown")
    start_time = time.time()
    try:
        result = await db.execute(text("SELECT 1"))
        if result.scalar() == 1:
            db_status.status = "healthy"
            db_status.latency_ms = round((time.time() - start_time) * 1000, 2)
            db_status.message = "Connected to PostgreSQL database"
    except Exception as e:
        db_status.status = "unhealthy"
        db_status.message = f"Database error: {str(e)}"

    # 2. Check Redis
    redis_status = ServiceStatus(status="unknown")
    redis_start = time.time()
    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        ping_res = await r.ping()
        await r.close()
        if ping_res:
            redis_status.status = "healthy"
            redis_status.latency_ms = round((time.time() - redis_start) * 1000, 2)
            redis_status.message = "Connected to Redis instance"
    except Exception as e:
        redis_status.status = "unhealthy"
        redis_status.message = f"Redis error: {str(e)}"

    overall_status = "healthy" if db_status.status == "healthy" and redis_status.status == "healthy" else "degraded"

    return HealthCheckResponse(
        app_name=settings.PROJECT_NAME,
        environment=settings.ENVIRONMENT,
        status=overall_status,
        timestamp=datetime.now(timezone.utc),
        version="1.0.0",
        database=db_status,
        redis=redis_status
    )
