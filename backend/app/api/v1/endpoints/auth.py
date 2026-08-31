import secrets
from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)
from app.models.user import User, UserRole
from app.schemas.token import RefreshTokenRequest, Token, TokenPayload
from app.schemas.user import UserCreate, UserLogin, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Register a new customer account on SocialPulse.
    """
    # Check if email or username already registered
    result = await db.execute(
        select(User).where(
            or_(
                User.email == user_in.email.lower(),
                User.username == user_in.username.lower()
            )
        )
    )
    existing_user = result.scalars().first()
    if existing_user:
        if existing_user.email.lower() == user_in.email.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email already exists."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This username is already taken. Please choose another."
            )

    # Check if this is the very first user in the database -> automatically make SUPER_ADMIN
    count_result = await db.execute(select(User))
    first_user = count_result.scalars().first()
    assigned_role = UserRole.SUPER_ADMIN if first_user is None else UserRole.CUSTOMER

    user = User(
        email=user_in.email.lower(),
        username=user_in.username.lower(),
        full_name=user_in.full_name,
        phone_number=user_in.phone_number,
        hashed_password=get_password_hash(user_in.password),
        role=assigned_role,
        is_active=True,
        is_verified=False,
        currency=settings.PRIMARY_CURRENCY,
        api_key=secrets.token_hex(24) if assigned_role in [UserRole.RESELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN] else None
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token)
async def login_json(
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Authenticate with JSON payload (email or username + password). Returns access and refresh tokens.
    """
    identifier = credentials.email_or_username.lower().strip()
    result = await db.execute(
        select(User).where(
            or_(
                User.email == identifier,
                User.username == identifier
            )
        )
    )
    user = result.scalars().first()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email/username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact support.",
        )

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/login-form", response_model=Token, include_in_schema=False)
async def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    OAuth2 compatible token login for Swagger UI authorization button.
    """
    credentials = UserLogin(
        email_or_username=form_data.username,
        password=form_data.password
    )
    return await login_json(credentials=credentials, db=db)


@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    refresh_req: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Exchange a valid refresh token for a new access token.
    """
    try:
        payload = jwt.decode(
            refresh_req.refresh_token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        if token_data.type != "refresh" or token_data.sub is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token type",
            )
        import uuid
        user_id = uuid.UUID(token_data.sub)
    except (JWTError, Exception):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is expired or invalid",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    new_access_token = create_access_token(subject=user.id)
    new_refresh_token = create_refresh_token(subject=user.id)

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.get("/me", response_model=UserResponse)
async def get_authenticated_user_profile(
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Get profile information of currently logged-in user.
    """
    return current_user
