from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, List, Optional


@dataclass
class ProviderServiceItem:
    service_id: str
    name: str
    type: str  # Default, Package, Custom Comments, etc.
    category: str
    rate: Decimal  # Cost per 1000 from provider in provider currency
    min_quantity: int
    max_quantity: int
    refill: bool = False
    cancel: bool = False
    description: Optional[str] = None


@dataclass
class ProviderBalance:
    balance: Decimal
    currency: str


@dataclass
class ProviderOrderResponse:
    provider_order_id: str
    status: str
    charge: Optional[Decimal] = None
    raw_response: Optional[Dict[str, Any]] = None


@dataclass
class ProviderOrderStatus:
    provider_order_id: str
    status: str  # Pending, Processing, In progress, Completed, Partial, Canceled, Error
    charge: Optional[Decimal] = None
    start_count: Optional[int] = None
    remains: Optional[int] = None
    currency: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None


class ProviderInterface(ABC):
    """
    Abstract interface for SMM Service Providers (Delix Gains, Mock, etc.)
    Ensures seamless pluggability of future providers without touching the order system.
    """

    @abstractmethod
    async def get_services(self) -> List[ProviderServiceItem]:
        """Fetch all services offered by the provider."""
        pass

    @abstractmethod
    async def get_balance(self) -> ProviderBalance:
        """Fetch current account balance from the provider."""
        pass

    @abstractmethod
    async def create_order(
        self,
        service_id: str,
        target: str,
        quantity: int,
        **kwargs: Any
    ) -> ProviderOrderResponse:
        """Submit a new order to the provider."""
        pass

    @abstractmethod
    async def get_order_status(self, provider_order_id: str) -> ProviderOrderStatus:
        """Check the status of an existing order on the provider."""
        pass
