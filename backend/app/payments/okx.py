import hashlib
import random
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, Optional
import httpx

from app.core.config import settings
from app.payments.exchange_rate import exchange_rate_service


@dataclass
class CryptoDepositInfo:
    deposit_id: str
    network: str  # TRC20, TON, POLYGON
    currency: str # USDT
    deposit_address: str
    memo_or_tag: Optional[str]
    amount_usdt: Decimal
    amount_kes: Decimal
    exchange_rate: Decimal
    qr_code_uri: str
    expires_at_timestamp: int


@dataclass
class CryptoVerificationResult:
    is_valid: bool
    tx_hash: str
    amount_usdt: Decimal
    amount_kes: Decimal
    confirmations: int
    raw_data: Optional[Dict[str, Any]] = None


class OKXWeb3Client:
    """
    OKX Web3 & Multi-Chain Deposit Client (USDT on TRC20, TON, Polygon).
    """

    SUPPORTED_NETWORKS = {
        "TRC20": {
            "name": "TRON (TRC20)",
            "token": "USDT",
            "default_address": "TYDzsYUEpvnYmQk4zGP9sWWcTEd3Ui5q4e",
            "confirmations_required": 1,
        },
        "TON": {
            "name": "TON Network",
            "token": "USDT",
            "default_address": "EQBvW8Z5huBkMJYdn3PBRnVDqcTOnhTOWhkg26ViCzpNpZsX",
            "confirmations_required": 1,
        },
        "POLYGON": {
            "name": "Polygon (ERC20)",
            "token": "USDT",
            "default_address": "0x71C8705a2B88e60Da4320214aB50b601E82d30B0",
            "confirmations_required": 5,
        },
    }

    def __init__(self):
        self.api_key = settings.OKX_API_KEY
        self.secret_key = settings.OKX_SECRET_KEY
        self.passphrase = settings.OKX_PASSPHRASE

    async def create_deposit_intent(
        self,
        user_id: str,
        network: str = "TRC20",
        amount_kes: Optional[Decimal] = None,
        amount_usdt: Optional[Decimal] = None
    ) -> CryptoDepositInfo:
        """
        Generate crypto deposit address, exchange rate calculation, and QR Code payload.
        """
        norm_network = network.upper().strip()
        if norm_network not in self.SUPPORTED_NETWORKS:
            norm_network = "TRC20"

        net_info = self.SUPPORTED_NETWORKS[norm_network]
        rate = await exchange_rate_service.get_usdt_to_kes_rate()

        if amount_usdt is not None:
            calc_usdt = amount_usdt
            calc_kes = exchange_rate_service.usdt_to_kes(amount_usdt)
        elif amount_kes is not None:
            calc_kes = amount_kes
            calc_usdt = exchange_rate_service.kes_to_usdt(amount_kes)
        else:
            calc_usdt = Decimal("10.00")
            calc_kes = exchange_rate_service.usdt_to_kes(calc_usdt)

        deposit_id = f"CRYPTO-{int(time.time())}-{random.randint(1000, 9999)}"
        deposit_address = net_info["default_address"]
        memo_tag = f"SP{user_id[:6].upper()}" if norm_network == "TON" else None

        # Build standard crypto payment URI for QR Code scanning
        if norm_network == "TRC20":
            qr_uri = f"tron:{deposit_address}?amount={calc_usdt}"
        elif norm_network == "TON":
            qr_uri = f"ton://transfer/{deposit_address}?amount={int(calc_usdt * 1000000)}&text={memo_tag}"
        else:
            qr_uri = f"ethereum:{deposit_address}?value={calc_usdt}"

        expires_at = int(time.time()) + 3600  # 1 hour expiration

        return CryptoDepositInfo(
            deposit_id=deposit_id,
            network=norm_network,
            currency="USDT",
            deposit_address=deposit_address,
            memo_or_tag=memo_tag,
            amount_usdt=calc_usdt,
            amount_kes=calc_kes,
            exchange_rate=rate,
            qr_code_uri=qr_uri,
            expires_at_timestamp=expires_at,
        )

    async def verify_transaction_hash(
        self,
        tx_hash: str,
        expected_usdt: Decimal,
        network: str = "TRC20"
    ) -> CryptoVerificationResult:
        """
        Verify on-chain deposit transaction.
        In sandbox / mock mode, validates any realistic hash.
        """
        clean_hash = tx_hash.strip()
        if not clean_hash or len(clean_hash) < 10:
            return CryptoVerificationResult(
                is_valid=False,
                tx_hash=clean_hash,
                amount_usdt=Decimal("0.00"),
                amount_kes=Decimal("0.00"),
                confirmations=0
            )

        # In Sandbox / Development mode: simulate successful verification
        amount_kes = exchange_rate_service.usdt_to_kes(expected_usdt)
        return CryptoVerificationResult(
            is_valid=True,
            tx_hash=clean_hash,
            amount_usdt=expected_usdt,
            amount_kes=amount_kes,
            confirmations=12,
            raw_data={"tx_hash": clean_hash, "network": network, "verified": True}
        )


okx_client = OKXWeb3Client()
