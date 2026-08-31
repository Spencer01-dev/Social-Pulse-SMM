import secrets
import uuid
from decimal import Decimal
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, require_roles
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password
from app.models.user import User, UserRole
from app.schemas.user import (
    PasswordChange,
    UserResponse,
    UserRoleUpdate,
    UserStatusUpdate,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["Users & Administration"])


class SandboxFundsRequest(BaseModel):
    amount: Decimal = Field(default=Decimal("1000.00"), gt=0, le=100000, description="Amount in KES to credit for testing")


@router.post("/me/add-sandbox-funds", response_model=UserResponse)
async def add_sandbox_funds(
    req: SandboxFundsRequest = SandboxFundsRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Development/Sandbox tool to add test wallet funds instantly.
    """
    current_user.balance += req.amount
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/generate-api-key", response_model=UserResponse)
async def generate_my_api_key(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Generate or regenerate a secure API key for the Reseller API.
    """
    new_key = f"sp_{secrets.token_urlsafe(32)}"
    current_user.api_key = new_key
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/revoke-api-key", response_model=UserResponse)
async def revoke_my_api_key(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Revoke current API key.
    """
    current_user.api_key = None
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("", response_model=List[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    role: Optional[UserRole] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    List all platform users (Admin & Super Admin only).
    """
    query = select(User).order_by(desc(User.created_at)).offset(skip).limit(limit)
    if role:
        query = query.where(User.role == role)
    if search:
        search_pattern = f"%{search.lower()}%"
        query = query.where(
            (User.email.ilike(search_pattern)) | 
            (User.username.ilike(search_pattern)) |
            (User.full_name.ilike(search_pattern))
        )
    result = await db.execute(query)
    users = result.scalars().all()
    return users


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Get user by ID. Normal users can only inspect their own profile. Admins can inspect any user.
    """
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN] and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view other users' profiles."
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    user_in: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Update personal profile information (name, phone number).
    """
    if user_in.full_name is not None:
        current_user.full_name = user_in.full_name
    if user_in.phone_number is not None:
        current_user.phone_number = user_in.phone_number

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/change-password")
async def change_my_password(
    pwd_data: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Update password with current password verification.
    """
    if not verify_password(pwd_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect."
        )
    
    current_user.hashed_password = get_password_hash(pwd_data.new_password)
    db.add(current_user)
    await db.commit()
    return {"message": "Password updated successfully."}


@router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: uuid.UUID,
    role_in: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_roles([UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Update a user's role (Super Admin only).
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    user.role = role_in.role
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}/status", response_model=UserResponse)
async def update_user_status(
    user_id: uuid.UUID,
    status_in: UserStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Activate or deactivate a user account (Admin / Super Admin only).
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own administrative account."
        )

    user.is_active = status_in.is_active
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
