from sqlalchemy import Boolean, Column, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.models.base import TimeStampedUUIDModel


class Provider(TimeStampedUUIDModel):
    __tablename__ = "providers"

    name = Column(String(100), nullable=False)
    slug = Column(String(50), unique=True, index=True, nullable=False)  # delix, mock, provider_a
    api_url = Column(String(255), nullable=False)
    api_key_encrypted = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    balance = Column(Numeric(12, 2), default=0.00, nullable=False)
    currency = Column(String(10), default="USD", nullable=False)
    description = Column(Text, nullable=True)

    # Relationships
    services = relationship("Service", back_populates="provider", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Provider {self.name} ({self.slug})>"
