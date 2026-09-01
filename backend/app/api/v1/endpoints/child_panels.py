import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, require_roles
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.child_panel import ChildPanel, ChildPanelStatus
from app.models.transaction import PaymentMethod, Transaction, TransactionStatus, TransactionType
from app.models.user import User, UserRole
from app.schemas.child_panel import ChildPanelCreate, ChildPanelResponse, ChildPanelStatusUpdate

router = APIRouter(prefix="/child-panels", tags=["Child Panels"])

PANEL_MONTHLY_FEE = Decimal("1500.00")


@router.post("", response_model=ChildPanelResponse, status_code=status.HTTP_201_CREATED)
async def order_child_panel(
    panel_in: ChildPanelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Rent a new Child SMM Panel on a custom domain.
    Deducts monthly rental fee (KES 1,500) from user wallet balance and provisions nameserver details.
    """
    clean_domain = panel_in.domain.strip().lower().replace("https://", "").replace("http://", "").rstrip("/")

    # 1. Check if domain already registered
    existing_q = await db.execute(select(ChildPanel).where(ChildPanel.domain == clean_domain))
    if existing_q.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The domain '{clean_domain}' is already registered on SocialPulse."
        )

    # 2. Check wallet balance
    if current_user.balance < PANEL_MONTHLY_FEE:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient balance. Child panel rental is KES {PANEL_MONTHLY_FEE:,.2f} per month. Your balance: KES {current_user.balance:,.2f}. Please add funds to proceed."
        )

    # 3. Deduct balance and record double-entry transaction
    balance_before = current_user.balance
    balance_after = balance_before - PANEL_MONTHLY_FEE
    current_user.balance = balance_after
    db.add(current_user)

    expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    # 4. Create child panel record
    panel = ChildPanel(
        user_id=current_user.id,
        domain=clean_domain,
        admin_username=panel_in.admin_username.strip(),
        admin_password_hash=get_password_hash(panel_in.admin_password),
        currency=panel_in.currency or "KES",
        price_per_month=PANEL_MONTHLY_FEE,
        status=ChildPanelStatus.PENDING,
        nameserver1="ns1.socialpulse.io",
        nameserver2="ns2.socialpulse.io",
        expires_at=expires_at,
        auto_renew=panel_in.auto_renew
    )
    db.add(panel)
    await db.flush()

    # 5. Record transaction ledger
    tx = Transaction(
        user_id=current_user.id,
        type=TransactionType.ORDER_PAYMENT,
        amount=-PANEL_MONTHLY_FEE,
        balance_before=balance_before,
        balance_after=balance_after,
        currency="KES",
        payment_method=PaymentMethod.INTERNAL,
        payment_reference=f"PANEL-{str(panel.id)[:8]}",
        status=TransactionStatus.COMPLETED,
        description=f"Monthly rental for Child Panel: {clean_domain}",
        metadata_json={
            "panel_id": str(panel.id),
            "domain": clean_domain,
            "duration_days": 30,
            "expires_at": expires_at.isoformat()
        }
    )
    db.add(tx)

    await db.commit()
    await db.refresh(panel)
    return panel


@router.get("/my", response_model=List[ChildPanelResponse])
async def list_my_child_panels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    List all child panels owned by the current authenticated user.
    """
    query = (
        select(ChildPanel)
        .where(ChildPanel.user_id == current_user.id)
        .order_by(desc(ChildPanel.created_at))
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{panel_id}/renew", response_model=ChildPanelResponse)
async def renew_child_panel(
    panel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Renew a child panel for an additional 30 days.
    """
    query = await db.execute(
        select(ChildPanel).where(ChildPanel.id == panel_id, ChildPanel.user_id == current_user.id)
    )
    panel = query.scalars().first()
    if not panel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child panel not found."
        )

    if current_user.balance < panel.price_per_month:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient balance. Renewal is KES {panel.price_per_month:,.2f}. Your balance: KES {current_user.balance:,.2f}."
        )

    balance_before = current_user.balance
    balance_after = balance_before - panel.price_per_month
    current_user.balance = balance_after
    db.add(current_user)

    # Extend expiration
    now = datetime.now(timezone.utc)
    base_date = panel.expires_at if panel.expires_at > now else now
    new_expires_at = base_date + timedelta(days=30)
    panel.expires_at = new_expires_at
    if panel.status == ChildPanelStatus.EXPIRED:
        panel.status = ChildPanelStatus.ACTIVE
    db.add(panel)

    tx = Transaction(
        user_id=current_user.id,
        type=TransactionType.ORDER_PAYMENT,
        amount=-panel.price_per_month,
        balance_before=balance_before,
        balance_after=balance_after,
        currency="KES",
        payment_method=PaymentMethod.INTERNAL,
        payment_reference=f"RENEW-{str(panel.id)[:8]}",
        status=TransactionStatus.COMPLETED,
        description=f"30-day renewal for Child Panel: {panel.domain}",
        metadata_json={
            "panel_id": str(panel.id),
            "domain": panel.domain,
            "new_expires_at": new_expires_at.isoformat()
        }
    )
    db.add(tx)

    await db.commit()
    await db.refresh(panel)
    return panel


@router.get("/admin/all", response_model=List[ChildPanelResponse])
async def list_all_child_panels_admin(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Staff / Admin endpoint to view all child panels across the platform.
    """
    query = select(ChildPanel).order_by(desc(ChildPanel.created_at))
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/admin/{panel_id}/status", response_model=ChildPanelResponse)
async def update_child_panel_status_admin(
    panel_id: uuid.UUID,
    payload: ChildPanelStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Staff endpoint to update child panel provisioning status (active, suspended, terminated).
    """
    query = await db.execute(select(ChildPanel).where(ChildPanel.id == panel_id))
    panel = query.scalars().first()
    if not panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child panel not found.")

    panel.status = payload.status
    if payload.notes:
        panel.notes = payload.notes
    db.add(panel)
    await db.commit()
    await db.refresh(panel)
    return panel
