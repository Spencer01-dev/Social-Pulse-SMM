import enum
from sqlalchemy import Boolean, Column, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import TimeStampedUUIDModel


class MarkupType(str, enum.Enum):
    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"
    MANUAL = "manual"


class Platform(str, enum.Enum):
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    YOUTUBE = "youtube"
    TIKTOK = "tiktok"
    TWITTER = "twitter"
    TELEGRAM = "telegram"
    SPOTIFY = "spotify"
    DISCORD = "discord"
    TWITCH = "twitch"
    OTHER = "other"


class Service(TimeStampedUUIDModel):
    __tablename__ = "services"

    provider_id = Column(UUID(as_uuid=True), ForeignKey("providers.id", ondelete="SET NULL"), nullable=True, index=True)
    provider_service_id = Column(String(100), index=True, nullable=False)  # ID on Delix Gains / external provider

    platform = Column(
        Enum(
            Platform,
            name="platform_enum",
            values_callable=lambda obj: [e.value for e in obj],
            create_type=False
        ),
        default=Platform.INSTAGRAM,
        nullable=False,
        index=True
    )

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    service_type = Column(String(50), default="Default", nullable=False)  # Default, Custom Comments, Subscriptions
    category = Column(String(150), index=True, nullable=False)

    # Pricing per 1000 units
    provider_rate = Column(Numeric(12, 2), default=0.00, nullable=False)  # What provider charges us
    selling_rate = Column(Numeric(12, 2), default=0.00, nullable=False)   # What customer pays

    markup_type = Column(
        Enum(
            MarkupType,
            name="markup_type_enum",
            values_callable=lambda obj: [e.value for e in obj],
            create_type=False
        ),
        default=MarkupType.PERCENTAGE,
        nullable=False
    )
    markup_value = Column(Numeric(10, 2), default=100.00, nullable=False)  # e.g. 100% or 50 KES

    # Quantity boundaries
    min_quantity = Column(Integer, default=10, nullable=False)
    max_quantity = Column(Integer, default=100000, nullable=False)

    # Provider capabilities
    refill_available = Column(Boolean, default=False, nullable=False)
    cancel_available = Column(Boolean, default=False, nullable=False)

    # Platform display & ordering
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    sort_order = Column(Integer, default=0, nullable=False)

    # Relationships
    provider = relationship("Provider", back_populates="services")

    def __repr__(self):
        return f"<Service {self.name} - {self.platform.value} (KES {self.selling_rate}/1k)>"
