# ⚡ SocialPulse - Next-Gen SMM Reseller Platform

> **Production-Ready Social Media Marketing Reseller Engine & SMM Panel**
> Built with **FastAPI**, **React 18 (TypeScript)**, **PostgreSQL 14**, **Redis 7**, **Celery**, **Safaricom Lipa Na M-Pesa**, **OKX Web3 Multi-Chain USDT**, and **Binance Pay**.

---

## 🌟 Platform Highlights & Completed Features

- 🔐 **Enterprise Auth & RBAC**: JWT Access & Refresh Token rotation, Super Admin, Admin, Reseller, and Customer roles.
- 📦 **Dynamic Services & Provider Engine**: Multi-provider architecture with **Delix Gains KE API v2** sync, category mapping, and automatic price markup algorithms.
- ⚡ **Order Fulfillment & Polling Engine**: Instant automated order dispatch with background status tracking and automatic prorated refunds.
- 💳 **Triple Payment Gateway Suite**:
  - **Safaricom Daraja 2.0 Lipa Na M-Pesa STK Push** with live handset countdown modal & row-level locking.
  - **OKX Web3 Multi-Chain USDT** (`TRC20`, `TON` with memo/tag, `Polygon`) with on-chain hash verification.
  - **Binance Pay Merchant API** with deep-link & QR code checkout.
- 📊 **Executive Admin Analytics**: Real-time revenue, wholesale cost, gross profit margins, 14-day daily bar charts, platform breakdown distributions, and top services leaderboards.
- 🤖 **Universal Reseller API v2 Standard**: Full compatibility with external SMM panels, custom bots, and scripts (`action=services`, `action=balance`, `action=add`, `action=status`).
- 🎧 **Support Ticket Helpdesk**: Customer issue reporting with order association and live chat thread conversation viewer.
- 🛡️ **Production Security**: SlowAPI request rate limiting, security headers (`X-Frame-Options`, `nosniff`, CSP), and Nginx container reverse proxy.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
|---|---|
| **Backend API** | Python 3.10, FastAPI, SQLAlchemy 2.0 (Asyncpg), Alembic, Pydantic v2 |
| **Database** | PostgreSQL 14 (Port 5433 / 5432 in Docker) |
| **Cache & Task Queue** | Redis 7, Celery Background Workers |
| **Frontend Web App** | React 18, TypeScript, TailwindCSS, Lucide Icons, Vite |
| **Payment Gateways** | Safaricom Daraja Lipa Na M-Pesa, OKX Web3 (Tron/TON/Polygon), Binance Pay |
| **Web Server** | Nginx Reverse Proxy & Static Caching |
| **Containerization** | Docker, Docker Compose Multi-Container Stack |

---

## 🚀 Quickstart Guide (Local Development)

### 1. Database & Migrations
```bash
cd backend
alembic upgrade head
```

### 2. Run Backend Dev Server
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```
- Interactive Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health Check: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)
- Reseller API v2: `POST http://localhost:8000/api/v2`

### 3. Run Frontend Dev Server
```bash
cd frontend
npm run dev
```
- Open Browser: [http://localhost:5173](http://localhost:5173)

---

## 🐳 Full Production Deployment with Docker Compose

Deploy the complete multi-container production stack with 1 command:

```bash
docker-compose up -d --build
```

Services will run automatically:
- **Frontend & Nginx Proxy**: [http://localhost:80](http://localhost:80)
- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **PostgreSQL 14**: `localhost:5433`
- **Redis 7**: `localhost:6379`
- **Celery Worker**: Background order polling and service synchronization

---

## 🔑 Default Administrator Credentials

- **Username**: `admin`
- **Email**: `admin@socialpulse.io`
- **Password**: `admin123`
- **Role**: `super_admin`

---

## 📖 Reseller API v2 Documentation

Send `application/x-www-form-urlencoded` or `application/json` POST requests to `/api/v2`:

### Example: Get Service Catalog
```bash
curl -X POST "http://localhost:8000/api/v2" \
  -d "key=YOUR_API_KEY" \
  -d "action=services"
```

### Example: Place New Order
```bash
curl -X POST "http://localhost:8000/api/v2" \
  -d "key=YOUR_API_KEY" \
  -d "action=add" \
  -d "service=SERVICE_UUID" \
  -d "link=https://instagram.com/p/xyz" \
  -d "quantity=1000"
```

### Example: Check Order Status
```bash
curl -X POST "http://localhost:8000/api/v2" \
  -d "key=YOUR_API_KEY" \
  -d "action=status" \
  -d "order=ORDER_UUID"
```

### Example: Check Balance
```bash
curl -X POST "http://localhost:8000/api/v2" \
  -d "key=YOUR_API_KEY" \
  -d "action=balance"
```
