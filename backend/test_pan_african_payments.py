import asyncio
import sys
from decimal import Decimal

from app.payments.exchange_rate import exchange_rate_service
from app.payments.flutterwave import flutterwave_provider
from app.payments.paystack import paystack_provider

async def test_integrations():
    print("Testing Exchange Rate Engine...")
    currencies = exchange_rate_service.get_supported_currencies()
    assert "KES" in currencies
    assert "NGN" in currencies
    assert "GHS" in currencies
    assert "TZS" in currencies
    assert "BIF" in currencies
    assert "USD" in currencies
    assert "USDT" in currencies
    print(f"Supported Currencies: {list(currencies.keys())}")

    # Test conversions
    kes_1000_in_ngn = exchange_rate_service.convert_from_kes(Decimal("1000"), "NGN")
    print(f"1,000 KES = {kes_1000_in_ngn} NGN")
    assert kes_1000_in_ngn > 0

    ngn_to_kes = exchange_rate_service.convert_to_kes(kes_1000_in_ngn, "NGN")
    print(f"{kes_1000_in_ngn} NGN converted back to KES = {ngn_to_kes} KES")
    assert abs(ngn_to_kes - Decimal("1000")) < Decimal("2.0")

    print("\nTesting Flutterwave Provider...")
    flw_init = await flutterwave_provider.initialize_payment(
        user_email="test@socialpulse.io",
        user_name="Test User",
        amount=Decimal("5000"),
        currency="NGN",
        redirect_url="http://localhost:5173/wallet/deposit"
    )
    print("Flutterwave Init Response:", flw_init)
    assert flw_init.get("status") == "success"
    assert "tx_ref" in flw_init

    flw_verify = await flutterwave_provider.verify_transaction(flw_init["tx_ref"])
    print("Flutterwave Verify Response:", flw_verify)
    assert flw_verify.get("is_verified") is True

    print("\nTesting Paystack Provider...")
    pstk_init = await paystack_provider.initialize_payment(
        user_email="test@socialpulse.io",
        amount=Decimal("2500"),
        currency="NGN",
        callback_url="http://localhost:5173/wallet/deposit"
    )
    print("Paystack Init Response:", pstk_init)
    assert pstk_init.get("status") is True
    ref = pstk_init["data"]["reference"]

    pstk_verify = await paystack_provider.verify_transaction(ref)
    print("Paystack Verify Response:", pstk_verify)
    assert pstk_verify.get("is_verified") is True

    print("\nALL PAN-AFRICAN ENGINE TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(test_integrations())
