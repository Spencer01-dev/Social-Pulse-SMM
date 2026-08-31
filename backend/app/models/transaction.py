import enum
from sqlalchemy import Column, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.models.base import TimeStampedUUIDModel


class TransactionType(str, enum.Enum):
    DEPOSIT = "deposit"
    ORDER_PAYMENT = "order_payment"
    ORDER_REFUND = "order_refund"
    MANUAL_ADJUSTMENT = "manual_adjustment"
    BONUS = "bonus"


class PaymentMethod(str, enum.Enum):
    MPESA = "mpesa"
    OKX = "okx"
    BINANCE = "binance"
    FLUTTERWAVE = "flutterwave"
    PAYSTACK = "paystack"
    MANUAL = "manual"
    INTERNAL = "internal"


class TransactionStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REVERSED = "reversed"


class Transaction(TimeStampedUUIDModel):
    """
    Double-Entry Financial Transaction Ledger for all user balance movements.
    Guarantees strict auditability with balance_before and balance_after.
    """
    __tablename__ = "transactions"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)

    type = Column(
        Enum(
            TransactionType,
            name="transaction_type_enum",
            values_callable=lambda obj: [e.value for e in obj],
            create_type=False
        ),
        nullable=False,
        index=True
    )

    amount = Column(Numeric(12, 2), nullable=False)  # Positive for credits, negative for debits
    balance_before = Column(Numeric(12, 2), nullable=False)
    balance_after = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(10), default="KES", nullable=False)

    payment_method = Column(
        Enum(
            PaymentMethod,
            name="payment_method_enum",
            values_callable=lambda obj: [e.value for e in obj],
            create_type=False
        ),
        default=PaymentMethod.INTERNAL,
        nullable=False,
        index=True
    )

    payment_reference = Column(String(100), nullable=True, index=True)  # M-Pesa Receipt / CheckoutRequestID / TxHash
    status = Column(
        Enum(
            TransactionStatus,
            name="transaction_status_enum",
            values_callable=lambda obj: [e.value for e in obj],
            create_type=False
        ),
        default=TransactionStatus.PENDING,
        nullable=False,
        index=True
    )

    description = Column(String(255), nullable=True)
    metadata_json = Column(JSONB, nullable=True)

    # Relationships
    user = relationship("User", backref="transactions")
    order = relationship("Order", backref="transactions")

    def __repr__(self):
        return f"<Transaction {self.id} ({self.type.value}): {self.currency} {self.amount} - {self.status.value}>"
