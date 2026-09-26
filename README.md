# SEASMP — Smart Education Analytics & Security Monitoring Platform

## 🚀 Tezkor Ishga Tushirish

### Talablar
- Node.js v22+
- Docker Desktop ([yuklab olish](https://www.docker.com/products/docker-desktop/))
- Git

---

### 1. Repozitoriyani klonlash
```bash
git clone https://github.com/nyxeldev/seasmp.git
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
# Root papkadan — monorepo, shuning uchun bitta npm ci yetarli
npm ci
npm --workspace apps/api run db:generate

# Migratsiyalar. `migrate dev` EMAS: u tayyor migratsiyalar ustiga yana
# bittasini yasashga urinadi va bazani tozalashni so'raydi.
npm --workspace apps/api run db:migrate

# Ma'lumot. Ikkitasidan birini tanlang:
npm --workspace apps/api run db:seed        # minimal: 9 foydalanuvchi, 3 kurs
npm --workspace apps/api run db:seed:demo   # namoyish: 80 talaba, 10 kurs, davomat va baholar

# Xatti-harakat tarixi — 2-QATLAM UCHUN SHART.
# Xatti-harakat qatlami har foydalanuvchining o'z me'yoriga qaraydi, me'yor esa
# 30 kunlik audit tarixidan quriladi (kamida 50 kuzatuv). Bu tarixsiz profil
# qurilmaydi, 2-qatlam jim qoladi va CORRELATED hukm hech qachon chiqmaydi.
npm --workspace apps/api run db:seed:history
```

Tarixdan keyin profillarni qurish kerak (ADMIN tokeni bilan):

```bash
curl -X POST http://localhost:4000/v1/security/profiles/refresh \
  -H "authorization: Bearer <ADMIN_ACCESS_TOKEN>"
```

Javobda `{"built": 95, "skipped": 0}` chiqishi kerak. `skipped` noldan katta
bo'lsa — o'sha foydalanuvchilarda yetarli tarix yo'q.

### 5. API ishga tushirish (development)
```bash
# Root papkadan, ikki alohida terminalda
npm run dev:api    # http://localhost:4000
npm run dev:web    # http://localhost:3000
```

Analitika servisi konteynerda ishlaydi (`http://localhost:5000`).
Modelni birinchi marta o'qitish kerak — aks holda `/health` javobida
`rule_based_fallback` turadi:

```bash
curl -X POST http://localhost:5000/v1/analytics/train
```

---

## 💾 Boshqa kompyuterga ko'chirish

Kod GitHub'da, lekin repoda turmagan uchta narsa bor:

| Nima | Qayerda | Kerakmi |
|---|---|---|
| `.env` | repodan tashqarida | **Ha.** `AES_ENCRYPTION_KEY` bazadagi 2FA kalitlarini shifrlaydi — baza nusxasi bilan bir xil kalit ko'chishi shart |
| Baza | `seasmp_postgres_data` volumi | Namoyish ma'lumoti, audit jurnali va xavfsizlik ogohlantirishlari shu yerda |
| ML modeli | `seasmp_analytics_models` volumi | Yo'q — yangi joyda qayta o'qitish mumkin, lekin AUC boshqacha chiqadi |

Redis ko'chirilmaydi: unda faqat sessiya, rate-limit hisoblagichlari va
xatti-harakat oynalari — hammasi o'zi qayta yig'iladi.

**Eski kompyuterda** (postgres ko'tarilgan holatda):

```bash
./scripts/migrate-machine.sh export ../seasmp-transfer
```

Hosil bo'lgan papkada ochiq sirlar bor. Ochiq kanal bilan yubormang —
USB yoki parol bilan arxivlangan fayl.

**Yangi kompyuterda** Docker va Node o'rnatilgandan keyin:

```bash
git clone https://github.com/nyxeldev/seasmp.git
cd seasmp
./scripts/migrate-machine.sh import ../seasmp-transfer
npm ci
npm --workspace apps/api run db:generate
```

Import `.env` ni joyiga qo'yadi, postgres va redis'ni ko'taradi, bazani
tiklaydi, ML modelini o'z volumiga yoyadi va analitikani quradi.

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
