from sqlalchemy import Boolean, Column, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.models.base import TimeStampedUUIDModel


class Provider(TimeStampedUUIDModel):
    __tablename__ = "providers"

    slug = Column(String(50), unique=True, index=True, nullable=False)  # jap, mock
    api_key_encrypted = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    balance = Column(Numeric(12, 2), default=0.00, nullable=False)
    currency = Column(String(10), default="USD", nullable=False)
    description = Column(Text, nullable=True)

    # Relationships
    services = relationship("Service", back_populates="provider", cascade="all, delete-orphan", foreign_keys="[Service.provider_id]")

    @property
    def name(self) -> str:
        if self.slug:
            slug_lower = self.slug.lower()
            if "jap" in slug_lower:
                return "JustAnotherPanel (JAP)"
            return self.slug.capitalize()
        return "Direct"

    def __repr__(self):
        return f"<Provider {self.name} ({self.slug})>"
