import asyncio
from decimal import Decimal
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.models.provider import Provider
from app.models.service import Service, Platform, MarkupType
from app.workers.service_sync import sync_services_from_provider

async def curate_dual_provider_catalog():
    async with AsyncSessionLocal() as db:
        print("[1] Ensuring both ResellerSMM and JAP providers are active...")
        # 1. ResellerSMM
        res_r = await db.execute(select(Provider).where(Provider.slug == "resellersmm"))
        reseller_prov = res_r.scalars().first()
        if not reseller_prov:
            reseller_prov = Provider(
                name="ResellerSMM",
                slug="resellersmm",
                api_url=settings.RESELLERSMM_API_URL,
                api_key_encrypted=settings.RESELLERSMM_API_KEY,
                currency="USD",
                is_active=True,
                balance=Decimal("0.00")
            )
            db.add(reseller_prov)
            await db.commit()
            await db.refresh(reseller_prov)
        else:
            reseller_prov.is_active = True
            await db.commit()

        # 2. JAP
        res_j = await db.execute(select(Provider).where(Provider.slug == "jap"))
        jap_prov = res_j.scalars().first()
        if not jap_prov:
            jap_prov = Provider(
                name="JustAnotherPanel",
                slug="jap",
                api_url=settings.JAP_API_URL,
                api_key_encrypted=settings.JAP_API_KEY,
                currency="USD",
                is_active=True,
                balance=Decimal("0.00")
            )
            db.add(jap_prov)
            await db.commit()
            await db.refresh(jap_prov)
        else:
            jap_prov.is_active = True
            jap_prov.api_key_encrypted = settings.JAP_API_KEY
            await db.commit()

        print(f"[+] Providers active: ResellerSMM ({reseller_prov.id}), JAP ({jap_prov.id})")

        # Check service counts
        cnt_r = (await db.execute(select(text("count(*)")).select_from(Service).where(Service.provider_id == reseller_prov.id))).scalar()
        if cnt_r == 0:
            print("[2] Syncing services from ResellerSMM into database...")
            total_r, created_r, updated_r = await sync_services_from_provider(db, provider_slug="resellersmm", default_markup_percent=Decimal("80.00"))
            print(f"[+] Synced {total_r} ResellerSMM services ({created_r} created, {updated_r} updated).")
        else:
            print(f"[2] ResellerSMM already has {cnt_r} services in database.")

        cnt_j = (await db.execute(select(text("count(*)")).select_from(Service).where(Service.provider_id == jap_prov.id))).scalar()
        if cnt_j == 0:
            print("[3] Syncing services from JAP into database...")
            total_j, created_j, updated_j = await sync_services_from_provider(db, provider_slug="jap", default_markup_percent=Decimal("80.00"))
            print(f"[+] Synced {total_j} JAP services ({created_j} created, {updated_j} updated).")
        else:
            print(f"[3] JAP already has {cnt_j} services in database.")

        print("[4] Applying user's exact catalog curation rules...")

        # Rule 1: Ensure JAP budget TikTok Likes and cheap IG bot followers are active (excluding any views/reels)
        res_j_likes = await db.execute(text("""
            UPDATE services 
            SET is_active = TRUE 
            WHERE provider_id = :jap_id
              AND (
                  (platform = 'tiktok' AND name ILIKE '%like%' AND name NOT ILIKE '%view%')
                  OR (platform = 'instagram' AND name ILIKE '%follower%' AND name NOT ILIKE '%view%' AND name NOT ILIKE '%reel%')
              );
        """), {"jap_id": jap_prov.id})
        print(f"[+] Ensured JAP budget TikTok Likes and Instagram followers are active ({res_j_likes.rowcount} active).")

        # Rule 2: Deactivate JAP services in categories where ResellerSMM is superior:
        # TikTok Views, Instagram Views/Reels, Telegram Members, and Nigerian/African Traffic
        res_j_deact = await db.execute(text("""
            UPDATE services 
            SET is_active = FALSE 
            WHERE provider_id = :jap_id
              AND (
                  (platform = 'tiktok' AND (name ILIKE '%view%' OR category ILIKE '%view%'))
                  OR (platform = 'instagram' AND (name ILIKE '%view%' OR category ILIKE '%view%' OR name ILIKE '%reel%' OR category ILIKE '%reel%'))
                  OR (platform = 'telegram' AND (name ILIKE '%member%' OR category ILIKE '%member%'))
                  OR (name ILIKE '%nigeria%' OR category ILIKE '%nigeria%' OR name ILIKE '%africa%' OR category ILIKE '%africa%')
              );
        """), {"jap_id": jap_prov.id})
        print(f"[+] Deactivated {res_j_deact.rowcount} JAP services in favour of ResellerSMM (Views, Telegram, Nigerian/African).")

        # Rule 3: Deactivate ResellerSMM TikTok Likes and Bot Followers in favour of JAP:
        res_r_deact = await db.execute(text("""
            UPDATE services 
            SET is_active = FALSE 
            WHERE provider_id = :res_id
              AND (
                  (platform = 'tiktok' AND (name ILIKE '%like%' OR category ILIKE '%like%'))
                  OR (platform = 'instagram' AND (name ILIKE '%bot%' OR name ILIKE '%high drop%' OR name ILIKE '%no refill%') AND (name ILIKE '%follower%' OR category ILIKE '%follower%'))
              );
        """), {"res_id": reseller_prov.id})
        print(f"[+] Deactivated {res_r_deact.rowcount} ResellerSMM TikTok Likes and Bot Followers in favour of JAP.")

        # Rule 4: Ensure ResellerSMM services are active for Views, Reels, Telegram, Nigerian/African:
        res_r_act = await db.execute(text("""
            UPDATE services 
            SET is_active = TRUE 
            WHERE provider_id = :res_id
              AND (
                  (platform = 'tiktok' AND (name ILIKE '%view%' OR category ILIKE '%view%'))
                  OR (platform = 'instagram' AND (name ILIKE '%view%' OR category ILIKE '%view%' OR name ILIKE '%reel%' OR category ILIKE '%reel%'))
                  OR (platform = 'telegram' AND (name ILIKE '%member%' OR category ILIKE '%member%'))
                  OR (name ILIKE '%nigeria%' OR category ILIKE '%nigeria%' OR name ILIKE '%africa%' OR category ILIKE '%africa%')
              );
        """), {"res_id": reseller_prov.id})
        print(f"[+] Ensured ResellerSMM services are active for Views, Telegram, Nigerian/African ({res_r_act.rowcount} active).")

        # Rule C: Baseline Pricing Formula (30% SocialPulse Wholesale / 100% Retail / 70% Child Panel Profit)
        # 1. SocialPulse sells wholesale to Child Panels at +30% (wholesale_rate = provider_rate * 1.30)
        # 2. SocialPulse sells retail to Customers at +100% (selling_rate = provider_rate * 2.00)
        # 3. Child panels sell to their customers at the identical retail price (+100%), keeping the remaining 70% profit!
        res_base = await db.execute(text("""
            UPDATE services
            SET wholesale_rate = ROUND(provider_rate * 1.30, 2),
                selling_rate = ROUND(provider_rate * 2.00, 2),
                markup_type = 'percentage',
                markup_value = 100.00
            WHERE markup_type != 'manual' AND provider_rate > 0;
        """))
        print(f"[+] Applied baseline 30% wholesale / 100% retail pricing to {res_base.rowcount} services.")

        # Rule D: Pricing calibration to equalize or beat Delix Gains:
        # Ultra-cheap TikTok views (from ResellerSMM): sell at 0.85 KES (ws 0.50 KES)
        await db.execute(text("""
            UPDATE services
            SET selling_rate = 0.85, wholesale_rate = 0.50, markup_type = 'manual'
            WHERE provider_id = :res_id AND platform = 'tiktok' AND name ILIKE '%view%' AND provider_rate < 0.60;
        """), {"res_id": reseller_prov.id})

        # Instagram Views & Reels (from ResellerSMM): sell at 0.80 KES (ws 0.40 KES)
        await db.execute(text("""
            UPDATE services
            SET selling_rate = 0.80, wholesale_rate = 0.40, markup_type = 'manual'
            WHERE provider_id = :res_id AND platform = 'instagram' AND (name ILIKE '%view%' OR name ILIKE '%reel%') AND provider_rate < 0.50;
        """), {"res_id": reseller_prov.id})

        # Telegram Members (from ResellerSMM): sell at 0.80 - 1.50 KES (ws 0.45 KES)
        await db.execute(text("""
            UPDATE services
            SET selling_rate = 0.90, wholesale_rate = 0.45, markup_type = 'manual'
            WHERE provider_id = :res_id AND platform = 'telegram' AND name ILIKE '%member%' AND provider_rate < 0.50;
        """), {"res_id": reseller_prov.id})

        # TikTok Likes (from JAP): sell at 21.00 KES (ws 16.00 KES) for budget likes
        await db.execute(text("""
            UPDATE services
            SET selling_rate = 21.00, wholesale_rate = 16.00, markup_type = 'manual'
            WHERE provider_id = :jap_id AND platform = 'tiktok' AND name ILIKE '%like%' AND provider_rate BETWEEN 10.00 AND 18.00;
        """), {"jap_id": jap_prov.id})

        # Instagram Bot Followers (from JAP): sell at 35.00 - 45.00 KES (ws 25.00 - 32.00 KES)
        await db.execute(text("""
            UPDATE services
            SET selling_rate = 39.00, wholesale_rate = 28.00, markup_type = 'manual'
            WHERE provider_id = :jap_id AND platform = 'instagram' AND name ILIKE '%follower%' AND provider_rate < 32.00;
        """), {"jap_id": jap_prov.id})

        await db.commit()
        print("[+] Rates calibrated to beat Delix Gains with parity across SocialPulse and child panels.")

        from app.core.cache import clear_all_cache
        clear_all_cache()
        print("[+] Cache cleared successfully.")

if __name__ == "__main__":
    asyncio.run(curate_dual_provider_catalog())
