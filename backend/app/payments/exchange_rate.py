from decimal import Decimal
from typing import Dict, Any


class ExchangeRateService:
    """
    Multi-Currency Conversion Engine.
    Base currency: KES (Kenyan Shilling).
    Supports: NGN (Nigeria), GHS (Ghana), ZAR (South Africa), USD.
    """

    # Real-time baseline exchange rates (Units of Local Currency per 1 KES)
    DEFAULT_RATES_PER_KES = {
        "KES": Decimal("1.00"),
        "NGN": Decimal("11.50"),   # 1 KES ~ 11.50 NGN  (1 USD ~ 1,500 NGN)
        "GHS": Decimal("0.12"),    # 1 KES ~ 0.12 GHS   (1 USD ~ 15.6 GHS)
        "ZAR": Decimal("0.14"),    # 1 KES ~ 0.14 ZAR   (1 USD ~ 18.2 ZAR)
        "USD": Decimal("0.00769"), # 1 KES ~ 0.00769 USD (1 USD ~ 130 KES)
    }

    CURRENCY_METADATA = {
        "KES": {"name": "Kenyan Shilling", "symbol": "Ksh", "flag": "🇰🇪", "country": "Kenya", "decimals": 2},
        "NGN": {"name": "Nigerian Naira", "symbol": "₦", "flag": "🇳🇬", "country": "Nigeria", "decimals": 2},
        "GHS": {"name": "Ghanaian Cedi", "symbol": "GH₵", "flag": "🇬🇭", "country": "Ghana", "decimals": 2},
        "ZAR": {"name": "South African Rand", "symbol": "R", "flag": "🇿🇦", "country": "South Africa", "decimals": 2},
        "USD": {"name": "US Dollar", "symbol": "$", "flag": "🇺🇸", "country": "United States", "decimals": 2},
    }

    def __init__(self):
        self._rates = dict(self.DEFAULT_RATES_PER_KES)
        self._last_updated = 0.0

    def get_supported_currencies(self) -> Dict[str, Any]:
        """Return full list of currencies with metadata and rates relative to KES."""
        result = {}
        for code, meta in self.CURRENCY_METADATA.items():
            rate_per_kes = self._rates.get(code, Decimal("1.00"))
            kes_per_unit = (Decimal("1.00") / rate_per_kes) if rate_per_kes > 0 else Decimal("1.00")
            result[code] = {
                **meta,
                "code": code,
                "rate_per_kes": float(rate_per_kes),
                "kes_per_unit": float(round(kes_per_unit, 4)),
            }
        return result

    def convert_from_kes(self, kes_amount: Decimal, target_currency: str) -> Decimal:
        """Convert an amount in KES to target currency."""
        target = target_currency.upper()
        rate = self._rates.get(target, Decimal("1.00"))
        decimals = self.CURRENCY_METADATA.get(target, {}).get("decimals", 2)
        converted = kes_amount * rate
        return round(converted, decimals)

    def convert_to_kes(self, local_amount: Decimal, from_currency: str) -> Decimal:
        """Convert an amount in foreign currency to base KES."""
        source = from_currency.upper()
        rate = self._rates.get(source, Decimal("1.00"))
        if rate <= 0:
            return local_amount
        return round(local_amount / rate, 2)


exchange_rate_service = ExchangeRateService()
