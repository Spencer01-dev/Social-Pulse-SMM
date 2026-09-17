import enum
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.models.base import TimeStampedUUIDModel


class ChildPanelStatus(str, enum.Enum):
    PENDING = "pending"
    PAYMENT_CONFIRMED = "payment_confirmed"
    CREATING_TENANT = "creating_tenant"
    CONFIGURING_DATABASE = "configuring_database"
    CONFIGURING_DOMAIN = "configuring_domain"
    CONFIGURING_BRANDING = "configuring_branding"
    CONFIGURING_API = "configuring_api"
    SSL_PENDING = "ssl_pending"
    ACTIVE = "active"
    PROVISIONING_FAILED = "provisioning_failed"
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
        String(50),
        default=ChildPanelStatus.PENDING.value,
        nullable=False,
        index=True
    )

    provisioning_step = Column(String(50), default="pending", nullable=True)
    last_error = Column(Text, nullable=True)
    branding_json = Column(JSONB, nullable=True)

    nameserver1 = Column(String(255), default="ns1.socialpulse.io", nullable=False)
    nameserver2 = Column(String(255), default="ns2.socialpulse.io", nullable=False)

    expires_at = Column(DateTime(timezone=True), nullable=False)
    auto_renew = Column(Boolean, default=True, nullable=False)

    notes = Column(Text, nullable=True)
    metadata_json = Column(JSONB, nullable=True)

    # Relationships
    user = relationship("User", backref="child_panels", foreign_keys=[user_id])

    def __repr__(self):
        return f"<ChildPanel {self.domain} ({self.status}) - User {self.user_id}>"

