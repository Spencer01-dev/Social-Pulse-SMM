import re
from typing import Optional
import httpx


async def sanitize_and_canonicalize_target_link(raw_text: str, timeout: float = 6.0) -> str:
    """
    Intelligently extracts, cleans, and canonicalizes social media target links.
    1. Extracts URL from messy text (e.g. TikTok Lite share messages).
    2. Unshortens redirected links (vm.tiktok.com, vt.tiktok.com, youtu.be, fb.me).
    3. Strips tracking query parameters (?_r=1&_t=..., ?igsi=...).
    """
    if not raw_text:
        return ""

    # 1. Regex to find the first URL in the text
    url_pattern = re.compile(r'https?://[^\s<>"]+|www\.[^\s<>"]+')
    match = url_pattern.search(raw_text)
    
    if not match:
        return raw_text.strip()

    extracted_url = match.group(0)
    if not extracted_url.startswith("http"):
        extracted_url = "https://" + extracted_url

    # 2. Check if it's a short redirect link that needs canonicalization
    short_domains = ["vm.tiktok.com", "vt.tiktok.com", "youtu.be", "fb.me", "ig.me", "t.co", "bit.ly"]
    is_short = any(domain in extracted_url.lower() for domain in short_domains)

    if is_short:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.get(extracted_url, headers=headers)
                if resp.status_code == 200 or str(resp.url).startswith("http"):
                    extracted_url = str(resp.url)
        except Exception:
            # If network resolution fails, keep original extracted URL
            pass

    # 3. Clean tracking query parameters for clean provider delivery
    if "tiktok.com" in extracted_url or "instagram.com" in extracted_url or "facebook.com" in extracted_url:
        clean_url = extracted_url.split("?")[0].rstrip("/")
        return clean_url

    return extracted_url.strip()
