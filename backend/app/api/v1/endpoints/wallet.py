import uuid
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user
from app.core.database import get_db
from app.models.transaction import Transaction, TransactionStatus, TransactionType
from app.models.user import User
from app.schemas.payment import TransactionResponse

router = APIRouter(prefix="/wallet", tags=["Wallet & Ledger"])


@router.get("/transactions", response_model=List[TransactionResponse])
async def get_my_transactions(
    type: Optional[TransactionType] = None,
    status: Optional[TransactionStatus] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Get user's full double-entry financial ledger statement.
    """
    query = (
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(desc(Transaction.created_at))
        .offset(skip)
        .limit(limit)
    )

    if type:
        query = query.where(Transaction.type == type)
    if status:
        query = query.where(Transaction.status == status)

    result = await db.execute(query)
    transactions = result.scalars().all()
    return transactions


@router.get("/balance")
async def get_my_balance(current_user: User = Depends(get_current_active_user)) -> Any:
    """
    Get user's live wallet balance.
    """
    return {
        "balance": float(current_user.balance),
        "currency": current_user.currency,
        "is_verified": current_user.is_verified
    }
