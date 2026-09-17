import enum
from sqlalchemy import Boolean, Column, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import TimeStampedUUIDModel


class UserRole(str, enum.Enum):
    CUSTOMER = "customer"
    RESELLER = "reseller"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class User(TimeStampedUUIDModel):
    __tablename__ = "users"

    tenant_id = Column(UUID(as_uuid=True), ForeignKey("child_panels.id", ondelete="SET NULL"), nullable=True, index=True)

    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
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
