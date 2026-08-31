from fastapi import APIRouter
from app.api.v1.endpoints import (
    admin_analytics,
    admin_orders,
    admin_services,
    admin_settings,
    admin_tickets,
    admin_wallet,
    auth,
    binance_payments,
    crypto_payments,
    health,
    orders,
    payments,
    services,
    tickets,
    users,
    wallet,
)

api_router = APIRouter()

# Health check route
api_router.include_router(health.router)

# Authentication & Registration
api_router.include_router(auth.router)

# User Management & Administration
api_router.include_router(users.router)

# Public & Customer Services Catalog
api_router.include_router(services.router)

# Admin Services Management & Provider Sync
api_router.include_router(admin_services.router)

# Customer Orders & Tracking
api_router.include_router(orders.router)

# Admin Orders Monitoring & Status Overrides
api_router.include_router(admin_orders.router)

# Mobile Money & Lipa Na M-Pesa STK Push
api_router.include_router(payments.router)

# OKX Web3 & Multi-Chain Crypto Payments
api_router.include_router(crypto_payments.router)

# Binance Pay Merchant Checkout
api_router.include_router(binance_payments.router)

# Customer Wallet & Statement Ledger
api_router.include_router(wallet.router)

# Admin Wallet Auditing & Adjustments
api_router.include_router(admin_wallet.router)

# Admin Executive Analytics & Telemetry
api_router.include_router(admin_analytics.router)

# Customer Support Tickets
api_router.include_router(tickets.router)

# Admin Support Helpdesk
api_router.include_router(admin_tickets.router)

# Admin Platform Configuration & Settings
api_router.include_router(admin_settings.router)
