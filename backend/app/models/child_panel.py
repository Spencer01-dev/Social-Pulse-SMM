import enum
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.models.base import TimeStampedUUIDModel


class ChildPanelStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    EXPIRED = "expired"
    TERMINATED = "terminated"


class ChildPanel(TimeStampedUUIDModel):
    """
    Rented Child SMM Panel Model.
    Allows customers/resellers to host their own branded SMM panel on custom domains.
    """
    __tablename__ = "child_panels"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    domain = Column(String(255), unique=True, nullable=False, index=True)
    admin_username = Column(String(100), nullable=False)
    admin_password_hash = Column(String(255), nullable=False)

    currency = Column(String(10), default="KES", nullable=False)
    price_per_month = Column(Numeric(12, 2), default=1500.00, nullable=False)

    status = Column(
        Enum(
            ChildPanelStatus,
            name="child_panel_status_enum",
            values_callable=lambda obj: [e.value for e in obj],
            create_type=False
        ),
        default=ChildPanelStatus.PENDING,
        nullable=False,
        index=True
    )

    nameserver1 = Column(String(255), default="ns1.socialpulse.io", nullable=False)
    nameserver2 = Column(String(255), default="ns2.socialpulse.io", nullable=False)

    expires_at = Column(DateTime(timezone=True), nullable=False)
    auto_renew = Column(Boolean, default=True, nullable=False)

    notes = Column(Text, nullable=True)
    metadata_json = Column(JSONB, nullable=True)

    # Relationships
    user = relationship("User", backref="child_panels")

    def __repr__(self):
        return f"<ChildPanel {self.domain} ({self.status.value}) - User {self.user_id}>"
