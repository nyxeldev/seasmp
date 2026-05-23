# SEASMP — Smart Education Analytics & Security Monitoring Platform

## 🚀 Tezkor Ishga Tushirish

### Talablar
- Node.js v22+
- Python 3.13+
- Docker Desktop ([yuklab olish](https://www.docker.com/products/docker-desktop/))
- Git

---

### 1. Repozitoriyani klonlash
```bash
git clone https://github.com/your-org/seasmp.git
cd seasmp
```

### 2. Environment sozlash
```bash
cp .env.example .env
```
`.env` faylni oching va qiymatlarni to'ldiring:
- `POSTGRES_PASSWORD` — kuchli parol
- `REDIS_PASSWORD`    — kuchli parol
- `JWT_ACCESS_SECRET` — 64+ belgili random string
- `JWT_REFRESH_SECRET`— 64+ belgili random string
- `AES_ENCRYPTION_KEY`— 64 ta hex belgisi (32 byte)

Kerakli secretlarni generatsiya qilish:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Docker bilan ishga tushirish
```bash
# Faqat database va Redis (development uchun)
docker compose up postgres redis -d

# To'liq stack
docker compose up -d
```

### 4. Ma'lumotlar bazasini sozlash
```bash
cd apps/api
npm install
npx prisma migrate dev --name init
npx prisma db seed     # Test ma'lumotlar (ixtiyoriy)
```

### 5. API ishga tushirish (development)
```bash
# Root papkadan
npm run dev:api
```

---

## 📁 Papka Tuzilmasi

```
seasmp/
├── apps/
│   ├── api/                # Node.js + Fastify backend
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │       ├── config/     # env, prisma, redis, logger
│   │       ├── routes/     # API endpoint'lar
│   │       ├── services/   # Business logic
│   │       ├── middlewares/# Auth, RBAC
│   │       └── server.ts   # Entry point
│   ├── analytics/          # Python + FastAPI
│   └── frontend/           # Next.js 16
├── packages/
│   └── shared/             # Umumiy tiplar
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🗄 Ma'lumotlar Bazasi

Jadvallar:
- `users`         — Foydalanuvchilar (4 rol)
- `refresh_tokens`— JWT refresh tokenlar
- `courses`       — Kurslar
- `enrollments`   — Kursga yozilish (dropout_risk_score bilan)
- `attendance`    — Davomat (QR + manual)
- `assessments`   — Imtihon/vazifalar
- `grades`        — Baholar
- `audit_logs`    — Barcha harakatlar logi

---

## 🔐 Xavfsizlik

| Xususiyat          | Amalga oshirish                    |
|--------------------|------------------------------------|
| Parol shifrlash    | bcrypt (rounds: 12)                |
| JWT                | Access (15 min) + Refresh (7 kun)  |
| 2FA                | TOTP (Google Authenticator)        |
| Rate Limiting      | 100 req/min (Nginx + Redis)        |
| Audit Log          | Barcha CRUD + Login/Logout         |
| SQL Injection      | Prisma ORM + Zod validation        |
| XSS                | Helmet.js + Input sanitization     |

---

## 📡 API Endpoints (asosiy)

| Method | Endpoint              | Tavsif                    |
|--------|-----------------------|---------------------------|
| POST   | /v1/auth/login        | Login                     |
| POST   | /v1/auth/refresh      | Token yangilash           |
| POST   | /v1/auth/logout       | Chiqish                   |
| POST   | /v1/auth/2fa/verify   | 2FA tasdiqlash            |
| GET    | /v1/users             | Foydalanuvchilar (Admin+) |
| GET    | /v1/courses           | Kurslar ro'yxati          |
| POST   | /v1/attendance        | Davomat belgilash         |
| GET    | /v1/analytics/...     | Analitika                 |
| GET    | /v1/security/...      | Xavfsizlik paneli         |

---

## 🧪 Testlar

```bash
npm test                    # Barcha testlar
npm test --workspace=apps/api  # Faqat API
```

---

## 📞 Loyiha bo'yicha savol

Texnik topshiriq: `SEASMP_TechSpec_v2.pdf`
