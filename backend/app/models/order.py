import enum
from sqlalchemy import Column, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import TimeStampedUUIDModel


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    PARTIAL = "partial"
    CANCELED = "canceled"
    FAILED = "failed"


class Order(TimeStampedUUIDModel):
    __tablename__ = "orders"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True)
    provider_id = Column(UUID(as_uuid=True), ForeignKey("providers.id", ondelete="SET NULL"), nullable=True, index=True)

    # External Provider reference
    provider_order_id = Column(String(100), nullable=True, index=True)

    # Order details
    target_link = Column(String(500), nullable=False)
    quantity = Column(Integer, nullable=False)
    start_count = Column(Integer, default=0, nullable=False)
    remains = Column(Integer, default=0, nullable=False)

    # Financial tracking (in KES)
    charge = Column(Numeric(12, 2), nullable=False)        # Retail price charged to customer
    provider_cost = Column(Numeric(12, 2), default=0.00, nullable=False) # Wholesale cost from provider
    profit = Column(Numeric(12, 2), default=0.00, nullable=False)        # Gross profit earned (charge - provider_cost)
    currency = Column(String(10), default="KES", nullable=False)

    # Order status
    status = Column(
        Enum(
            OrderStatus,
            name="order_status_enum",
            values_callable=lambda obj: [e.value for e in obj],
            create_type=False
        ),
        default=OrderStatus.PENDING,
        nullable=False,
        index=True
    )

    # Optional metadata
    custom_comments = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    runs = Column(Integer, default=1, nullable=False)
    interval = Column(Integer, default=0, nullable=False)

    # Relationships
    user = relationship("User", backref="orders")
    service = relationship("Service", backref="orders")
    provider = relationship("Provider", backref="orders")

    def __repr__(self):
        return f"<Order {self.id} - {self.target_link} ({self.status.value})>"
