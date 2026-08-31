import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.order import Order, OrderStatus
from app.models.service import Service
from app.models.user import User, UserRole
from app.providers.manager import get_provider

router = APIRouter(prefix="/api/v2", tags=["Reseller API v2 Standard"])


@router.get("")
async def get_reseller_api_info():
    """
    Informational GET response for browser visits.
    """
    return JSONResponse(
        content={
            "protocol": "SMM Reseller API v2",
            "method": "POST",
            "status": "online",
            "description": "Standard SMM Panel Reseller API. Send POST requests with 'key' and 'action' (services, add, status, balance).",
            "docs_url": "http://localhost:5173/api-docs"
        }
    )


async def authenticate_api_key(key: Optional[str], db: AsyncSession) -> User:
    """Validate reseller API key from payload."""
    if not key or not key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "API key is required"}
        )

    result = await db.execute(
        select(User).where(User.api_key == key.strip(), User.is_active == True)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid or inactive API key"}
        )
    return user


@router.post("")
async def handle_reseller_action(
    request: Request,
    key: Optional[str] = Form(None),
    action: Optional[str] = Form(None),
    service: Optional[str] = Form(None),
    link: Optional[str] = Form(None),
    quantity: Optional[int] = Form(None),
    comments: Optional[str] = Form(None),
    order: Optional[str] = Form(None),
    orders: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Standard SMM Panel Reseller API v2 Protocol.
    Supports form-urlencoded and JSON payloads for actions: services, balance, add, status.
    """
    # If parameters not sent in form-data, check JSON body
    if not action or not key:
        try:
            body = await request.json()
            key = key or body.get("key")
            action = action or body.get("action")
            service = service or str(body.get("service", ""))
            link = link or body.get("link")
            quantity = quantity or body.get("quantity")
            comments = comments or body.get("comments")
            order = order or str(body.get("order", ""))
            orders = orders or str(body.get("orders", ""))
        except Exception:
            pass

    if not action:
        return {"error": "Parameter 'action' is required (e.g. services, balance, add, status)"}

    # Authenticate API Key
    user = await authenticate_api_key(key, db)

    # 1. ACTION: SERVICES
    if action == "services":
        result = await db.execute(
            select(Service).where(Service.is_active == True).order_by(Service.platform, Service.sort_order)
        )
        services = result.scalars().all()
        return [
            {
                "service": str(s.id),
                "name": s.name,
                "type": s.service_type,
                "category": s.category,
                "rate": str(s.selling_rate),
                "min": str(s.min_quantity),
                "max": str(s.max_quantity),
                "refill": s.refill_available,
                "cancel": s.cancel_available
            }
            for s in services
        ]

    # 2. ACTION: BALANCE
    elif action == "balance":
        return {
            "balance": f"{user.balance:.2f}",
            "currency": user.currency
        }

    # 3. ACTION: ADD (Create Order)
    elif action == "add":
        if not service:
            return {"error": "Parameter 'service' is required"}
        if not link:
            return {"error": "Parameter 'link' is required"}
        if not quantity or int(quantity) <= 0:
            return {"error": "Parameter 'quantity' must be greater than 0"}

        # Find service by UUID or string match
        try:
            service_uuid = uuid.UUID(service)
            s_query = select(Service).options(selectinload(Service.provider)).where(Service.id == service_uuid, Service.is_active == True)
        except ValueError:
            s_query = select(Service).options(selectinload(Service.provider)).where(Service.provider_service_id == service, Service.is_active == True)

        s_res = await db.execute(s_query)
        svc = s_res.scalars().first()
        if not svc:
            return {"error": "Service not found or currently inactive"}

        int_qty = int(quantity)
        if int_qty < svc.min_quantity:
            return {"error": f"Minimum quantity is {svc.min_quantity}"}
        if int_qty > svc.max_quantity:
            return {"error": f"Maximum quantity is {svc.max_quantity}"}

        # Calculate costs
        total_charge = round((svc.selling_rate * Decimal(int_qty)) / Decimal(1000), 2)
        provider_cost = round((svc.provider_rate * Decimal(int_qty)) / Decimal(1000), 2)
        profit = total_charge - provider_cost

        # Balance check
        if user.balance < total_charge:
            return {"error": f"Not enough funds on balance. Required: KES {total_charge:.2f}"}

        # Deduct balance
        user.balance -= total_charge
        db.add(user)

        # Sanitize target link
        from app.core.link_cleaner import sanitize_and_canonicalize_target_link
        clean_link = await sanitize_and_canonicalize_target_link(link)

        # Dispatch using Multi-Provider Smart Router with Auto-Failover
        provider_order_id = None
        status_val = OrderStatus.PENDING
        try:
            from app.providers.router import SmartProviderRouter
            p_id, p_order_id, msg = await SmartProviderRouter.dispatch_with_failover(
                service=svc,
                target_link=clean_link,
                quantity=int_qty,
                db=db,
                comments=comments
            )
            provider_order_id = p_order_id
            status_val = OrderStatus.IN_PROGRESS if p_order_id else OrderStatus.PROCESSING
        except Exception:
            pass

        # Save order
        new_order = Order(
            user_id=user.id,
            service_id=svc.id,
            provider_id=svc.provider_id,
            provider_order_id=provider_order_id,
            target_link=clean_link,
            quantity=int_qty,
            start_count=0,
            remains=int_qty,
            charge=total_charge,
            provider_cost=provider_cost,
            profit=profit,
            currency="KES",
            status=status_val,
            custom_comments=comments
        )
        db.add(new_order)
        await db.commit()
        await db.refresh(new_order)

        return {"order": str(new_order.id)}

    # 4. ACTION: STATUS
    elif action == "status":
        if order:
            try:
                order_uuid = uuid.UUID(order)
                o_query = select(Order).where(Order.id == order_uuid, Order.user_id == user.id)
            except ValueError:
                return {"error": "Invalid order ID format"}

            o_res = await db.execute(o_query)
            ord_item = o_res.scalars().first()
            if not ord_item:
                return {"error": "Order not found"}

            status_text = ord_item.status.value.capitalize()
            if ord_item.status == OrderStatus.IN_PROGRESS:
                status_text = "In progress"

            return {
                "charge": f"{ord_item.charge:.2f}",
                "start_count": str(ord_item.start_count),
                "status": status_text,
                "remains": str(ord_item.remains),
                "currency": ord_item.currency
            }
        elif orders:
            order_ids = [o.strip() for o in orders.split(",") if o.strip()]
            status_map = {}
            for oid in order_ids:
                try:
                    ouuid = uuid.UUID(oid)
                    res = await db.execute(select(Order).where(Order.id == ouuid, Order.user_id == user.id))
                    ord_item = res.scalars().first()
                    if ord_item:
                        status_map[oid] = {
                            "charge": f"{ord_item.charge:.2f}",
                            "start_count": str(ord_item.start_count),
                            "status": ord_item.status.value.capitalize(),
                            "remains": str(ord_item.remains),
                            "currency": ord_item.currency
                        }
                    else:
                        status_map[oid] = {"error": "Incorrect order ID"}
                except Exception:
                    status_map[oid] = {"error": "Incorrect order ID"}
            return status_map
        else:
            return {"error": "Parameter 'order' or 'orders' is required"}

    return {"error": f"Unsupported action: '{action}'"}
