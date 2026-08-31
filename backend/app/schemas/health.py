from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ServiceStatus(BaseModel):
    status: str
    message: Optional[str] = None
    latency_ms: Optional[float] = None


class HealthCheckResponse(BaseModel):
    app_name: str
    environment: str
    status: str
    timestamp: datetime
    version: str = "1.0.0"
    database: ServiceStatus
    redis: ServiceStatus
