import uuid
from decimal import Decimal
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.transaction import (
    PaymentMethod,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from app.models.user import User, UserRole
from app.schemas.payment import AdminBalanceAdjustRequest, TransactionResponse

router = APIRouter(prefix="/admin/wallet", tags=["Admin Wallet & Ledger"])


@router.get("/transactions", response_model=List[TransactionResponse])
async def list_admin_transactions(
    user_id: Optional[uuid.UUID] = None,
    type: Optional[TransactionType] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Audit log of all platform financial movements.
    """
    query = select(Transaction).order_by(desc(Transaction.created_at)).offset(skip).limit(limit)

    if user_id:
        query = query.where(Transaction.user_id == user_id)
    if type:
        query = query.where(Transaction.type == type)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/adjust", response_model=TransactionResponse)
async def adjust_user_balance(
    req: AdminBalanceAdjustRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles([UserRole.SUPER_ADMIN]))
) -> Any:
    """
    Manually credit or debit a user's wallet with ledger entry (Super Admin only).
    """
    result = await db.execute(select(User).where(User.id == req.user_id))
    target_user = result.scalars().first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")

    balance_before = target_user.balance
    target_user.balance += req.amount
    balance_after = target_user.balance

    transaction = Transaction(
        user_id=target_user.id,
        type=TransactionType.MANUAL_ADJUSTMENT if req.amount >= 0 else TransactionType.MANUAL_ADJUSTMENT,
        amount=req.amount,
        balance_before=balance_before,
        balance_after=balance_after,
        currency="KES",
        payment_method=PaymentMethod.MANUAL,
        payment_reference=f"ADJUST-{admin.username[:6].upper()}-{int(uuid.uuid4().int % 100000)}",
        status=TransactionStatus.COMPLETED,
        description=f"Admin adjustment by {admin.username}: {req.reason}",
        metadata_json={
            "adjusted_by_admin_id": str(admin.id),
            "adjusted_by_admin_name": admin.username,
            "reason": req.reason
        }
    )

    db.add(target_user)
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)

    return transaction
