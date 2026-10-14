"""
ChildPanelServiceConfig Model
Per-panel service overrides: enable/disable & custom markup for each catalog service.
"""
from sqlalchemy import Boolean, Column, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import TimeStampedUUIDModel


class ChildPanelServiceConfig(TimeStampedUUIDModel):
    """
    Per-child-panel override for a catalog service.
    - is_enabled: whether this service is visible/orderable on the child panel
    - custom_markup_percent: if set, overrides the panel's default_markup_percent for this specific service
    """
    __tablename__ = "child_panel_service_configs"

    panel_id = Column(
        UUID(as_uuid=True),
        ForeignKey("child_panels.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    service_id = Column(
        UUID(as_uuid=True),
        ForeignKey("services.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    is_enabled = Column(Boolean, default=True, nullable=False)
    # When set, this overrides the panel-level default_markup_percent for this service only
    custom_markup_percent = Column(Numeric(8, 2), nullable=True)

    __table_args__ = (
        UniqueConstraint("panel_id", "service_id", name="uq_panel_service"),
    )

    # Relationships
    panel = relationship("ChildPanel", backref="service_configs", foreign_keys=[panel_id])
    service = relationship("Service", foreign_keys=[service_id])

    def __repr__(self):
        return f"<ChildPanelServiceConfig panel={self.panel_id} service={self.service_id} enabled={self.is_enabled}>"
