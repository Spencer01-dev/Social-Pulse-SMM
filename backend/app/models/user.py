import enum
from sqlalchemy import Boolean, Column, Enum, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import TimeStampedUUIDModel


class UserRole(str, enum.Enum):
    CUSTOMER = "customer"
    RESELLER = "reseller"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class User(TimeStampedUUIDModel):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_email_main", func.lower(Column("email")), unique=True, postgresql_where=Column("tenant_id").is_(None)),
        Index("ix_users_username_main", func.lower(Column("username")), unique=True, postgresql_where=Column("tenant_id").is_(None)),
        Index("ix_users_email_tenant", func.lower(Column("email")), Column("tenant_id"), unique=True, postgresql_where=Column("tenant_id").isnot(None)),
        Index("ix_users_username_tenant", func.lower(Column("username")), Column("tenant_id"), unique=True, postgresql_where=Column("tenant_id").isnot(None)),
    )

    tenant_id = Column(UUID(as_uuid=True), ForeignKey("child_panels.id", ondelete="SET NULL"), nullable=True, index=True)

    email = Column(String(255), index=True, nullable=False)
    username = Column(String(100), index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    
    role = Column(
        Enum(
            UserRole,
            name="user_role_enum",
            values_callable=lambda obj: [e.value for e in obj],
            create_type=False
        ),
        default=UserRole.CUSTOMER,
        nullable=False,
        index=True
    )
    
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)

    # User profile fields
    full_name = Column(String(150), nullable=True)
    phone_number = Column(String(50), nullable=True)
    
    # Wallet balance cached for fast reads
    balance = Column(Numeric(12, 2), default=0.00, nullable=False)
    currency = Column(String(10), default="KES", nullable=False)

    # API key for Reseller API in Phase 8
    api_key = Column(String(64), unique=True, index=True, nullable=True)

    def __repr__(self):
        return f"<User {self.username} ({self.role.value})>"
