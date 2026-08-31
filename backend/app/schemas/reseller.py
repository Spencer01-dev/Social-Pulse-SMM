from decimal import Decimal
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class ResellerServiceItem(BaseModel):
    service: str = Field(..., description="Service ID")
    name: str
    type: str = "Default"
    category: str
    rate: Decimal = Field(..., description="Rate per 1000 in KES")
    min: int
    max: int
    refill: bool = False
    cancel: bool = False


class ResellerBalanceResponse(BaseModel):
    balance: Decimal
    currency: str


class ResellerAddOrderResponse(BaseModel):
    order: str


class ResellerOrderStatusResponse(BaseModel):
    charge: Decimal
    start_count: int
    status: str
    remains: int
    currency: str = "KES"


class ResellerErrorResponse(BaseModel):
    error: str
