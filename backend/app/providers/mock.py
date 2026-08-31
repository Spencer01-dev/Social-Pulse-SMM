import random
import time
from decimal import Decimal
from typing import Any, Dict, List, Optional

from app.providers.base import (
    ProviderBalance,
    ProviderInterface,
    ProviderOrderResponse,
    ProviderOrderStatus,
    ProviderServiceItem,
)


class MockProvider(ProviderInterface):
    """
    Mock / Sandbox SMM Provider for local development, demoing, and automated tests.
    Generates realistic catalog items for Instagram, Facebook, YouTube, TikTok, etc.
    """

    def __init__(self):
        self._services = [
            # Instagram
            ProviderServiceItem(
                service_id="101",
                name="Instagram Real Active Followers [HQ | Instant | 30 Days Refill]",
                type="Default",
                category="Instagram Followers",
                rate=Decimal("120.00"),  # KES cost per 1k
                min_quantity=50,
                max_quantity=50000,
                refill=True,
                cancel=True,
                description="Fast start, real high-quality profiles with bio and posts. 30 days guarantee."
            ),
            ProviderServiceItem(
                service_id="102",
                name="Instagram Super Fast Likes [Instant Start | Non-Drop]",
                type="Default",
                category="Instagram Likes",
                rate=Decimal("45.00"),
                min_quantity=20,
                max_quantity=100000,
                refill=True,
                cancel=False,
                description="Instant delivery speed up to 50k/day. Real worldwide profiles."
            ),
            ProviderServiceItem(
                service_id="103",
                name="Instagram Custom Comments [Positive Vibes | Real Profiles]",
                type="Custom Comments",
                category="Instagram Comments",
                rate=Decimal("250.00"),
                min_quantity=5,
                max_quantity=1000,
                refill=False,
                cancel=False,
                description="Custom positive comments written by real looking users."
            ),
            ProviderServiceItem(
                service_id="104",
                name="Instagram Video Views + Impressions & Reach [Ultra Speed]",
                type="Default",
                category="Instagram Views",
                rate=Decimal("15.00"),
                min_quantity=100,
                max_quantity=1000000,
                refill=False,
                cancel=False,
                description="Super fast video & reel views with bonus profile visits."
            ),

            # Facebook
            ProviderServiceItem(
                service_id="201",
                name="Facebook Page Followers & Likes [Real Worldwide | Fast]",
                type="Default",
                category="Facebook Page",
                rate=Decimal("180.00"),
                min_quantity=100,
                max_quantity=25000,
                refill=True,
                cancel=True,
                description="High quality Facebook page likes and followers to grow social proof."
            ),
            ProviderServiceItem(
                service_id="202",
                name="Facebook Post Likes / Reactions [Love, Care, Wow mix]",
                type="Default",
                category="Facebook Reactions",
                rate=Decimal("65.00"),
                min_quantity=50,
                max_quantity=20000,
                refill=True,
                cancel=False,
                description="Custom post reactions to increase engagement ranking."
            ),
            ProviderServiceItem(
                service_id="203",
                name="Facebook Video Views [High Retention | 3 Seconds+]",
                type="Default",
                category="Facebook Views",
                rate=Decimal("20.00"),
                min_quantity=500,
                max_quantity=500000,
                refill=False,
                cancel=False,
                description="Boosts video watch count on personal or business pages."
            ),

            # YouTube
            ProviderServiceItem(
                service_id="301",
                name="YouTube High Retention Views [Suggested & Search | Monetizable]",
                type="Default",
                category="YouTube Views",
                rate=Decimal("220.00"),
                min_quantity=500,
                max_quantity=100000,
                refill=True,
                cancel=False,
                description="Real viewers from search and browse features, safe for AdSense."
            ),
            ProviderServiceItem(
                service_id="302",
                name="YouTube Subscribers [Non-Drop | Organic Speed]",
                type="Default",
                category="YouTube Subscribers",
                rate=Decimal("650.00"),
                min_quantity=50,
                max_quantity=5000,
                refill=True,
                cancel=False,
                description="Gradual natural delivery to maintain channel integrity."
            ),

            # TikTok
            ProviderServiceItem(
                service_id="401",
                name="TikTok Followers [Instant Start | Real Looking]",
                type="Default",
                category="TikTok Followers",
                rate=Decimal("140.00"),
                min_quantity=100,
                max_quantity=50000,
                refill=True,
                cancel=False,
                description="Grow your TikTok audience and qualify for creator fund."
            ),
            ProviderServiceItem(
                service_id="402",
                name="TikTok Video Views [Super Instant | FYP Boost]",
                type="Default",
                category="TikTok Views",
                rate=Decimal("10.00"),
                min_quantity=500,
                max_quantity=5000000,
                refill=False,
                cancel=False,
                description="Viral algorithm booster with high retention view metrics."
            ),
        ]

    async def get_services(self) -> List[ProviderServiceItem]:
        return self._services

    async def get_balance(self) -> ProviderBalance:
        return ProviderBalance(balance=Decimal("25480.50"), currency="KES")

    async def create_order(
        self,
        service_id: str,
        target: str,
        quantity: int,
        **kwargs: Any
    ) -> ProviderOrderResponse:
        # Generate simulated provider order ID
        simulated_id = f"MOCK-{random.randint(10000, 99999)}"
        return ProviderOrderResponse(
            provider_order_id=simulated_id,
            status="Pending",
            charge=Decimal("15.00"),
            raw_response={"order": simulated_id, "mock": True}
        )

    async def get_order_status(self, provider_order_id: str) -> ProviderOrderStatus:
        possible_statuses = ["In progress", "Processing", "Completed", "Pending"]
        status_chosen = random.choice(possible_statuses)
        return ProviderOrderStatus(
            provider_order_id=provider_order_id,
            status=status_chosen,
            charge=Decimal("15.00"),
            start_count=1200,
            remains=0 if status_chosen == "Completed" else random.randint(10, 500),
            currency="KES",
            raw_response={"order": provider_order_id, "status": status_chosen}
        )
