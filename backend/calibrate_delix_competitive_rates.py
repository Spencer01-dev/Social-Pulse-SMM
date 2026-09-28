"""
FULL-SPECTRUM COMPETITIVE PRICING CALIBRATION
=============================================
Applies tiered, cost-aware markups across ALL platforms and ALL service types.

Strategy:
- Ultra-cheap services (cost < 1 KES): 35-50% markup (stay aggressive)
- Cheap services (cost 1-5 KES): 25-35% markup
- Mid-range services (cost 5-20 KES): 20-30% markup
- Premium services (cost 20-100 KES): 20-25% markup
- High-ticket services (cost 100+ KES): 15-20% markup

Wholesale is always set to give child panels 8-15% margin below selling rate.

All calibrated services are locked with markup_type = MANUAL to prevent
the service_sync worker from overwriting them.
"""

import asyncio, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from decimal import Decimal
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.service import Service, MarkupType


# ---------------------------------------------------------------------------
# Tier-specific pricing for high-demand service types
# ---------------------------------------------------------------------------

# TikTok Views - match/beat Delix where cost allows
TIKTOK_VIEW_TIERS = {
    "no_refill": {"max_cost": Decimal("0.70"), "sell": Decimal("0.99"), "ws": Decimal("0.75")},
    "30d":       {"max_cost": Decimal("1.30"), "sell": Decimal("1.80"), "ws": Decimal("1.40")},
    "60d":       {"max_cost": Decimal("1.40"), "sell": Decimal("1.95"), "ws": Decimal("1.50")},
    "90d":       {"max_cost": Decimal("1.55"), "sell": Decimal("2.10"), "ws": Decimal("1.65")},
    "365d":      {"max_cost": Decimal("1.65"), "sell": Decimal("2.25"), "ws": Decimal("1.75")},
    "lifetime":  {"max_cost": Decimal("1.80"), "sell": Decimal("2.40"), "ws": Decimal("1.90")},
}


def get_tiered_markup(cost: Decimal) -> tuple:
    """
    Returns (selling_rate, wholesale_rate) based on cost tier.
    Uses progressively tighter markups for higher-cost services.
    """
    if cost <= Decimal("0"):
        return (Decimal("0.80"), Decimal("0.60"))

    if cost < Decimal("0.50"):
        # Ultra-cheap: e.g. IG views at 0.16 KES -> sell at ~0.85
        sell = max(round(cost * Decimal("1.50"), 2), Decimal("0.80"))
        ws = max(round(cost * Decimal("1.25"), 2), Decimal("0.55"))
    elif cost < Decimal("1.00"):
        # Cheap: sell with 40% markup
        sell = max(round(cost * Decimal("1.40"), 2), Decimal("0.85"))
        ws = max(round(cost * Decimal("1.18"), 2), Decimal("0.65"))
    elif cost < Decimal("3.00"):
        # Low-mid: 35% markup
        sell = round(cost * Decimal("1.35"), 2)
        ws = round(cost * Decimal("1.15"), 2)
    elif cost < Decimal("5.00"):
        # Mid: 30% markup
        sell = round(cost * Decimal("1.30"), 2)
        ws = round(cost * Decimal("1.12"), 2)
    elif cost < Decimal("10.00"):
        # Mid-high: 25% markup
        sell = round(cost * Decimal("1.25"), 2)
        ws = round(cost * Decimal("1.10"), 2)
    elif cost < Decimal("25.00"):
        # High: 22% markup
        sell = round(cost * Decimal("1.22"), 2)
        ws = round(cost * Decimal("1.10"), 2)
    elif cost < Decimal("50.00"):
        # Premium: 20% markup
        sell = round(cost * Decimal("1.20"), 2)
        ws = round(cost * Decimal("1.08"), 2)
    elif cost < Decimal("200.00"):
        # High-ticket: 18% markup
        sell = round(cost * Decimal("1.18"), 2)
        ws = round(cost * Decimal("1.08"), 2)
    elif cost < Decimal("1000.00"):
        # Very high: 15% markup
        sell = round(cost * Decimal("1.15"), 2)
        ws = round(cost * Decimal("1.06"), 2)
    else:
        # Ultra-premium: 12% markup
        sell = round(cost * Decimal("1.12"), 2)
        ws = round(cost * Decimal("1.05"), 2)

    return (sell, ws)


def classify_tiktok_view(name_lower: str, cost: Decimal) -> tuple:
    """Special Delix-beating tiers for TikTok views."""
    if ("no refill" in name_lower or "instant" in name_lower or "super fast" in name_lower):
        t = TIKTOK_VIEW_TIERS["no_refill"]
        if cost <= t["max_cost"]:
            return (t["sell"], t["ws"])
    elif "30 day" in name_lower or "30d" in name_lower:
        t = TIKTOK_VIEW_TIERS["30d"]
        if cost <= t["max_cost"]:
            return (t["sell"], t["ws"])
    elif "60 day" in name_lower or "60d" in name_lower:
        t = TIKTOK_VIEW_TIERS["60d"]
        if cost <= t["max_cost"]:
            return (t["sell"], t["ws"])
    elif "90 day" in name_lower or "90d" in name_lower:
        t = TIKTOK_VIEW_TIERS["90d"]
        if cost <= t["max_cost"]:
            return (t["sell"], t["ws"])
    elif "365 day" in name_lower or "365d" in name_lower or "1 year" in name_lower:
        t = TIKTOK_VIEW_TIERS["365d"]
        if cost <= t["max_cost"]:
            return (t["sell"], t["ws"])
    elif "lifetime" in name_lower or "non drop" in name_lower:
        t = TIKTOK_VIEW_TIERS["lifetime"]
        if cost <= t["max_cost"]:
            return (t["sell"], t["ws"])
    # Fallback to tiered markup
    return None


async def calibrate_all():
    print("=" * 80)
    print("FULL-SPECTRUM COMPETITIVE PRICING CALIBRATION")
    print("=" * 80)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Service))
        all_services = result.scalars().all()
        print(f"Total services loaded: {len(all_services)}")

        stats = {
            "tiktok_views": 0,
            "ig_views": 0,
            "tw_views": 0,
            "tg_views": 0,
            "followers": 0,
            "likes": 0,
            "comments": 0,
            "shares": 0,
            "subscribers": 0,
            "members": 0,
            "reactions": 0,
            "saves": 0,
            "impressions": 0,
            "reach": 0,
            "other_generic": 0,
            "guardrail_fixes": 0,
        }

        for s in all_services:
            cost = s.provider_rate or Decimal("0.00")
            name_lower = (s.name or "").lower()
            platform_str = str(s.platform or "").lower()
            category_lower = (s.category or "").lower()
            is_live = "live" in name_lower and ("stream" in name_lower or "minute" in name_lower)

            new_sell = None
            new_ws = None
            stat_key = None

            # ==============================================================
            # PLATFORM + SERVICE TYPE SPECIFIC CALIBRATION
            # ==============================================================

            # --- TIKTOK VIEWS (Delix-beating) ---
            if platform_str == "tiktok" and "view" in name_lower and not is_live:
                result = classify_tiktok_view(name_lower, cost)
                if result:
                    new_sell, new_ws = result
                else:
                    new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "tiktok_views"

            # --- INSTAGRAM VIEWS ---
            elif platform_str == "instagram" and ("view" in name_lower or "reel" in name_lower or "view" in category_lower) and not is_live:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "ig_views"

            # --- TWITTER VIEWS ---
            elif platform_str == "twitter" and "view" in name_lower and not is_live and "mention" not in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "tw_views"

            # --- TELEGRAM VIEWS ---
            elif platform_str == "telegram" and "view" in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "tg_views"

            # --- FOLLOWERS (all platforms) ---
            elif "follower" in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "followers"

            # --- LIKES (all platforms) ---
            elif "like" in name_lower and "unlike" not in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "likes"

            # --- COMMENTS (all platforms) ---
            elif "comment" in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "comments"

            # --- SHARES (all platforms) ---
            elif "share" in name_lower or "repost" in name_lower or "retweet" in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "shares"

            # --- SUBSCRIBERS (YouTube, Telegram, etc) ---
            elif "subscriber" in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "subscribers"

            # --- MEMBERS (Telegram, Discord) ---
            elif "member" in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "members"

            # --- REACTIONS (Telegram, Facebook, etc) ---
            elif "reaction" in name_lower or "emoji" in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "reactions"

            # --- SAVES (Instagram, etc) ---
            elif "save" in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "saves"

            # --- IMPRESSIONS ---
            elif "impression" in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "impressions"

            # --- REACH ---
            elif "reach" in name_lower:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "reach"

            # --- EVERYTHING ELSE (views with live, votes, polls, traffic, etc) ---
            else:
                new_sell, new_ws = get_tiered_markup(cost)
                stat_key = "other_generic"

            # Apply the new rates
            if new_sell is not None and new_ws is not None:
                s.selling_rate = new_sell
                s.wholesale_rate = new_ws
                s.markup_type = MarkupType.MANUAL
                stats[stat_key] += 1

            # ==============================================================
            # GLOBAL GUARDRAILS (runs on every service regardless)
            # ==============================================================
            current_sell = s.selling_rate or Decimal("0.00")
            current_ws = s.wholesale_rate or Decimal("0.00")
            needs_fix = False

            # Selling rate must be above provider cost
            if current_sell <= cost and cost > 0:
                current_sell = max(round(cost * Decimal("1.20"), 2), cost + Decimal("0.10"))
                needs_fix = True

            # Wholesale must be above provider cost
            if current_ws <= cost and cost > 0:
                current_ws = max(round(cost * Decimal("1.08"), 2), cost + Decimal("0.05"))
                needs_fix = True

            # Wholesale must be below selling rate
            if current_ws >= current_sell:
                current_sell = max(round(current_ws * Decimal("1.15"), 2), current_ws + Decimal("0.10"))
                needs_fix = True

            if needs_fix:
                s.selling_rate = current_sell
                s.wholesale_rate = current_ws
                stats["guardrail_fixes"] += 1

            db.add(s)

        await db.commit()

        print("\n" + "=" * 60)
        print("CALIBRATION RESULTS")
        print("=" * 60)
        total_calibrated = sum(v for k, v in stats.items() if k != "guardrail_fixes")
        print(f"Total services calibrated: {total_calibrated}")
        print(f"Guardrail fixes applied:   {stats['guardrail_fixes']}")
        print()
        print("Breakdown by category:")
        for key, count in stats.items():
            if key != "guardrail_fixes" and count > 0:
                label = key.replace("_", " ").title()
                print(f"  {label:25s}: {count:5d} services")
        print()
        print("All database updates committed successfully!")


if __name__ == "__main__":
    asyncio.run(calibrate_all())
