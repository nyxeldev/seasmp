# SEASMP — Full Project Context for Claude

**Smart Education Analytics & Security Monitoring Platform**
Platform for managing an IT-education center: students, teachers, courses, attendance, grades, and ML-based dropout risk prediction.

---

## 1. Architecture Overview

```
seasmp/
├── apps/
│   ├── api/          Node.js + Fastify v5 + TypeScript  — REST API (port 4000)
│   ├── web/          Next.js 16 + shadcn/ui             — Frontend (port 3000)
│   └── analytics/    Python FastAPI + scikit-learn      — ML service (port 5000)
├── docker-compose.yml
├── nginx/nginx.conf
└── .env              # shared secrets
```

**Infrastructure:** PostgreSQL 17, Redis 7.4, all via Docker Compose.

---

## 2. Tech Stack

### API (`apps/api`)
| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 22, TypeScript 5.8 |
| Framework | Fastify v5 |
| ORM | Prisma v6 (PostgreSQL 17) |
| Auth | `jsonwebtoken` (manual, NOT @fastify/jwt) — access token (15m) + refresh token (7d, hashed SHA-256 in DB) |
| Password | bcryptjs, salt rounds 12 |
| 2FA | otplib (TOTP) + QRCode; secret stored AES-256-GCM encrypted |
| Cache/Queue | ioredis — rate limiting, QR tokens (60s TTL), 2FA pending tokens (5m TTL) |
| Validation | Zod |
| Logging | Winston |
| WebSockets | socket.io |
| Env | dotenv/config (imported at top of env.ts) |

### Web (`apps/web`)
| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6, React 19.2.4, TypeScript |
| UI | shadcn/ui v4 — uses **@base-ui/react** primitives (NOT Radix UI) |
| Styling | Tailwind CSS v4 |
| Icons | lucide-react v1.16 |
| Toasts | sonner v2 |
| Auth | Client-side JWT in localStorage, React Context (`lib/auth-context.tsx`) |

**Critical shadcn v4 API differences from older versions:**
- `Button` uses `render={<Link href="..." />}` instead of `asChild`
- `Select.onValueChange` receives `(value: string | null, eventDetails)` — must handle null
- Components import from `@base-ui/react/button`, `@base-ui/react/dialog`, etc.
- Animation uses `data-open` / `data-closed` (not `data-[state=open]`)

### Analytics (`apps/analytics`) — port 5000, **konteynerda ishlaydi**
| Layer | Technology |
|---|---|
| Framework | FastAPI 0.136.1 |
| DB | SQLAlchemy 2.0 sync + psycopg2-binary (PostgreSQL 17) |
| ML | scikit-learn 1.8 (RandomForestClassifier), numpy 2.4, joblib 1.5 |
| Queue | Celery 5.6 + Redis broker |
| Settings | `os.environ` + python-dotenv (`pydantic-settings` o'rnatilmagan) |
| Python | 3.13 (konteynerda; `docker compose up analytics -d`) |

**Ikkita ML yo'li bor, ular BIR XIL EMAS** — bu joy chalg'itadi:

| yo'l | xususiyatlar | model fayli |
|---|---|---|
| `src/services/ml_model.py` + `ml/train.py` (yangi, `/v1/...`) | `etl.FEATURE_COLS` — 8 ta, scaler bilan | `ml/models/latest_model.pkl` |
| `src/services/dropout_service.py` (eski, `/dropout/...`) | o'z SQL i — 7 ta, scalersiz | `ml/models/legacy_dropout_model.pkl` |

Ilgari ikkalasi bitta faylga yozardi va qaysi biri oxirgi o'qitgan bo'lsa,
boshqasi noto'g'ri o'lchamli vektor bilan chaqirilardi. Endi yo'llar ajratilgan.

O'qitilgan model `analytics_models` volumida (`/app/ml/models`), repoda emas.

---

## 3. Database Schema (PostgreSQL 17)

All table names are snake_case. Prisma maps camelCase models.

### `users`
```sql
id              UUID PK (gen_random_uuid())
email           VARCHAR(255) UNIQUE
password_hash   VARCHAR(255)
first_name      VARCHAR(100)
last_name       VARCHAR(100)
role            ENUM('SUPER_ADMIN','ADMIN','TEACHER','STUDENT')
avatar_url      TEXT nullable
is_active       BOOLEAN default true
two_factor_enabled BOOLEAN default false
two_factor_secret  VARCHAR nullable  -- AES-256-GCM encrypted TOTP secret
last_login_at   TIMESTAMPTZ nullable
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### `courses`
```sql
id              UUID PK
title           VARCHAR(255)
description     TEXT nullable
teacher_id      UUID FK→users
category        VARCHAR(100)
price           DECIMAL(10,2) default 0
duration_weeks  INT
max_students    INT default 30
status          ENUM('DRAFT','ACTIVE','COMPLETED','ARCHIVED')
schedule        JSONB nullable  -- { days: ["Monday"], time: "10:00", room: "A-1" }
created_at / updated_at TIMESTAMPTZ
```

### `enrollments`
```sql
id                UUID PK
student_id        UUID FK→users
course_id         UUID FK→courses
enrolled_at       TIMESTAMPTZ
status            ENUM('ACTIVE','COMPLETED','DROPPED')
dropout_risk_score DECIMAL(5,4) nullable  -- 0.0000–1.0000, written by Python service
final_grade       DECIMAL(5,2) nullable
UNIQUE(student_id, course_id)
```

### `attendance`
```sql
id              UUID PK
enrollment_id   UUID FK→enrollments (CASCADE)
lesson_date     DATE
status          ENUM('PRESENT','ABSENT','LATE','EXCUSED')
marked_by       UUID FK→users
qr_token        VARCHAR(64) UNIQUE nullable
marked_at       TIMESTAMPTZ
ip_address      VARCHAR(45)
UNIQUE(enrollment_id, lesson_date)
```

### `assessments`
```sql
id          UUID PK
course_id   UUID FK→courses (CASCADE)
title       VARCHAR(255)
type        ENUM('QUIZ','MIDTERM','FINAL','HOMEWORK')
max_score   DECIMAL(5,2) default 100
weight      DECIMAL(5,4) default 0.1  -- contribution to final grade (0–1)
due_date    TIMESTAMPTZ nullable
created_at  TIMESTAMPTZ
```

### `grades`
```sql
id              UUID PK
assessment_id   UUID FK→assessments (CASCADE)
enrollment_id   UUID FK→enrollments (CASCADE)
score           DECIMAL(5,2)
feedback        TEXT nullable
graded_by       UUID FK→users
graded_at       TIMESTAMPTZ
UNIQUE(assessment_id, enrollment_id)
```

### `refresh_tokens`
```sql
id          UUID PK
user_id     UUID FK→users (CASCADE)
token_hash  VARCHAR(255) UNIQUE  -- SHA-256 of raw token
user_agent  TEXT nullable
ip_address  VARCHAR(45)
expires_at  TIMESTAMPTZ
created_at  TIMESTAMPTZ
```

### `audit_logs`
```sql
id          BIGINT PK autoincrement
user_id     UUID FK→users nullable (SET NULL on delete)
action      ENUM('CREATE','UPDATE','DELETE','LOGIN','LOGOUT','LOGIN_FAILED',
                 'PASSWORD_CHANGE','ROLE_CHANGE','ENROLL','UNENROLL',
                 'GRADE_SUBMIT','ATTENDANCE_MARK')
resource    VARCHAR(100)   -- 'users','courses','enrollments', etc.
resource_id UUID nullable
old_data    JSONB nullable
new_data    JSONB nullable
ip_address  VARCHAR(45)
user_agent  TEXT nullable
created_at  TIMESTAMPTZ
```

---

## 4. API Endpoints (`apps/api` — Fastify v5, port 4000)

Base URL: `http://localhost:4000`  
All routes under `/v1/` except `/health`.

Auth: `Authorization: Bearer <accessToken>` header.  
Refresh token: HttpOnly cookie `refreshToken` (path `/v1/auth/refresh`).

### Auth (`/v1/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | — | Email+password login. Returns accessToken + sets refreshToken cookie. If 2FA enabled: returns `{requiresTwoFactor: true, twoFactorToken}` |
| POST | `/2fa/verify` | — | Submit TOTP code + twoFactorToken. Returns full tokens. |
| POST | `/refresh` | cookie | Rotate refresh token, returns new accessToken |
| POST | `/logout` | Bearer | Deletes refresh token from DB |
| GET | `/2fa/setup` | Bearer | Returns QR code data URL + raw secret |
| POST | `/2fa/confirm` | Bearer | Activates 2FA after user confirms code |

**Login response (no 2FA):**
```json
{ "success": true, "data": { "accessToken": "...", "user": { ...safeUser } } }
```
Note: `refreshToken` goes to cookie, NOT response body.

**Login response (with 2FA):**
```json
{ "success": true, "data": { "requiresTwoFactor": true, "twoFactorToken": "..." } }
```

### Users (`/v1/users`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/me` | any | Own profile |
| PATCH | `/me` | any | Update firstName/lastName/avatarUrl |
| PATCH | `/me/password` | any | Change password (requires oldPassword) |
| GET | `/` | ADMIN | List all users. Query: `?role=STUDENT&search=aziz&page=1&limit=20` |
| GET | `/:id` | ADMIN | Get user by ID |
| POST | `/` | ADMIN | Create user. Body: `{email, password, firstName, lastName, role}` → 201 |
| PATCH | `/:id` | ADMIN | Update user fields |
| PATCH | `/:id/toggle-status` | ADMIN | Toggle `isActive` |

### Courses (`/v1/courses`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | any | List courses. Admin sees all; teacher sees own; student sees ACTIVE. Query: `?status=ACTIVE&category=IT&limit=100` |
| GET | `/:id` | any | Course detail with `_count.enrollments` |
| POST | `/` | ADMIN/TEACHER | Create. Body: `{title, teacherId, category, durationWeeks, price?, maxStudents?, schedule?}` → 201 |
| PATCH | `/:id` | ADMIN/TEACHER | Update (teacher can only update own courses) |
| PATCH | `/:id/status` | ADMIN/TEACHER | Change status. Body: `{status: "ACTIVE"|"ARCHIVED"|...}` |
| DELETE | `/:id` | ADMIN | Soft delete (sets status=ARCHIVED) |

### Enrollments (`/v1/enrollments`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | any | List. Student sees own; teacher sees their courses'; admin sees all. |
| GET | `/:id` | any | Single enrollment (own or admin/teacher of that course) |
| POST | `/` | ADMIN/STUDENT | Enroll. Body: `{studentId, courseId}`. Returns 409 if duplicate. |
| PATCH | `/:id/status` | any | Change status to ACTIVE/COMPLETED/DROPPED |

### Attendance (`/v1/attendance`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | any | List records. Role-filtered. Query: `?enrollmentId=&courseId=&lessonDate=` |
| POST | `/` | ADMIN/TEACHER | Mark attendance. Body: `{enrollmentId, lessonDate (YYYY-MM-DD), status}` → 201. Returns 409 if already marked for that date. |
| GET | `/stats/:enrollmentId` | any | `{total, present, absent, late, rate}` |
| POST | `/qr/generate` | ADMIN/TEACHER | Generate QR token (60s TTL in Redis). Body: `{courseId, lessonDate}` |
| POST | `/qr/mark` | STUDENT | Student submits QR token. Body: `{token}` → 201. Returns 400 if token already used/expired. |

### Assessments (`/v1/assessments`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/course/:courseId` | any | List assessments for a course |
| POST | `/` | ADMIN/TEACHER | Create. Body: `{courseId, title, type (QUIZ/MIDTERM/FINAL/HOMEWORK), maxScore?, weight?, dueDate?}` → 201 |
| PATCH | `/:id` | ADMIN/TEACHER | Update title/maxScore/weight/dueDate |
| DELETE | `/:id` | ADMIN/TEACHER | Delete assessment |
| GET | `/:id/grades` | any | List grades. Student sees only own grade. |
| POST | `/:id/grades` | ADMIN/TEACHER | Upsert grade. Body: `{enrollmentId, score, feedback?}`. Returns 400 if score > maxScore. → 201 |

### Analytics (`/v1/analytics`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/dashboard` | ADMIN | `{totalUsers, totalCourses, totalEnrollments, activeEnrollments, totalAttendance, avgAttendanceRate}` |
| GET | `/courses/:courseId` | ADMIN/TEACHER | `{course, totalEnrollments, avgAttendanceRate, avgGrade}` |
| GET | `/students/:studentId` | any | Own stats or admin. `{user, enrollments, avgAttendanceRate, avgGrade}` |
| GET | `/attendance` | ADMIN/TEACHER | Attendance report. Query: `?courseId=&from=&to=` |

### Security (`/v1/security`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/audit-logs` | ADMIN | Paginated logs. Query: `?action=LOGIN&resource=courses&userId=&ipAddress=&from=&to=` |
| GET | `/audit-logs/:id` | ADMIN | Single log by BigInt ID |
| GET | `/sessions` | any | Own active refresh tokens |
| DELETE | `/sessions/:id` | any | Revoke one session |
| DELETE | `/sessions` | any | Revoke all sessions |
| POST | `/cleanup` | ADMIN | Delete expired refresh tokens from DB |

### Error format (all errors)
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```
Common codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `VALIDATION_ERROR` (400), `CONFLICT` (409), `NOT_FOUND` (404), `RATE_LIMIT_EXCEEDED` (429).

---

## 5. Middleware & Security Details

### Auth Middleware (`src/middlewares/auth.middleware.ts`)
Adds two decorators to Fastify instance:
- `app.authenticate` — verifies Bearer JWT, sets `request.user = {sub, role, iat, exp}`
- `app.requireRoles(...roles)` — checks `request.user.role` is in allowed list

Usage in routes:
```ts
app.get('/path', { onRequest: [app.authenticate, app.requireRoles('ADMIN')] }, handler)
```

### Rate Limiting
`@fastify/rate-limit`: 100 req/min per IP, in-memory (Redis integration removed due to API change).

### Brute Force Protection
Login attempts tracked in Redis: `login_attempts:{ip}` key, expires in 5 min, blocked after 10 attempts.

### Content Type Parser
Wildcard parser added to handle POST/PATCH without Content-Type header (bodyless routes):
```ts
app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
  if (!body) return done(null, {})
  try { done(null, JSON.parse(body as string)) } catch { done(null, {}) }
})
```

### BigInt Fix
AuditLog.id is BigInt. Patched globally:
```ts
(BigInt.prototype as any).toJSON = function () { return this.toString() }
```

---

## 6. Seed Data (test credentials)

```
admin@seasmp.uz       / Admin@1234    role: ADMIN
teacher1@seasmp.uz    / Teacher@1234  role: TEACHER
teacher2@seasmp.uz    / Teacher@1234  role: TEACHER
student1@seasmp.uz    / Student@1234  role: STUDENT
student2–5@seasmp.uz  / Student@1234  role: STUDENT
```

Seed also creates:
- 3 courses: "Web dasturlash asoslari" (teacher1), "Ma'lumotlar bazasi" (teacher1), "Ingliz tili A2-B1" (teacher2)
- 9 enrollments: students distributed across the 3 courses
- 2 assessments on course 1

Seed file: `apps/api/prisma/seed.ts` — run with `npm run db:seed` from `apps/api/`.

---

## 7. Frontend Pages (`apps/web`, Next.js 16, port 3000)

### Route Structure
```
app/
├── (auth)/login/page.tsx          — login form
├── (dashboard)/
│   ├── layout.tsx                 — auth guard + sidebar
│   ├── dashboard/page.tsx         — role-based home
│   ├── users/page.tsx             — user mgmt (admin only)
│   ├── courses/page.tsx           — course list
│   ├── courses/[id]/page.tsx      — course detail (enrollments + assessments)
│   ├── enrollments/page.tsx       — enrollment list
│   ├── attendance/page.tsx        — attendance records + mark + QR generate
│   ├── analytics/page.tsx         — stats (role-adaptive)
│   └── security/page.tsx          — audit logs (admin only)
├── layout.tsx                     — root layout with Providers
├── page.tsx                       — redirect to /dashboard
└── providers.tsx                  — AuthProvider + Toaster (client component)
```

### Auth Flow
1. `lib/auth-context.tsx` — React Context with `login()`, `logout()`, `refresh()`
2. JWT stored in `localStorage` (key: `accessToken`, `refreshToken`)
3. Dashboard layout: if no token on mount → redirect to `/login`
4. API client (`lib/api.ts`) reads token from localStorage on every request

### API Client (`lib/api.ts`)
Typed fetch wrapper. Base URL from `NEXT_PUBLIC_API_URL` env var (default `http://localhost:4000`).
```ts
api.get<T>(path)
api.post<T>(path, body)
api.patch<T>(path, body)
api.delete<T>(path)
// Throws ApiError(status, message, code) on non-2xx
```

Namespaced clients: `authApi`, `usersApi`, `coursesApi`, `enrollmentsApi`, `attendanceApi`, `assessmentsApi`, `analyticsApi`, `securityApi`.

### Sidebar (`components/nav/sidebar.tsx`)
Role-based navigation. Admin sees all 7 items. Teacher: Dashboard, Courses, Enrollments, Attendance, Analytics. Student: Dashboard, Courses, Enrollments, Attendance, Analytics.

---

## 8. Analytics Service (`apps/analytics`, port 5000)

**Status:** Fully built and tested. All endpoints verified against live DB.

### File Structure
```
apps/analytics/
├── main.py                        — FastAPI app, CORS, lifespan (model load on startup)
├── .env                           — DB + Redis credentials (same values as apps/api/.env)
├── requirements.txt               — all packages pinned
├── Dockerfile                     — python:3.13-slim, exposes 5000
├── start.ps1                      — dev: uvicorn main:app --reload --port 5000
├── start-worker.ps1               — celery worker
├── start-beat.ps1                 — celery beat (scheduler)
├── model/
│   └── rf_model.pkl               — joblib model file (created after first /dropout/train)
└── src/
    ├── config/
    │   ├── settings.py            — reads .env via os.environ + python-dotenv
    │   └── database.py            — SQLAlchemy engine, SessionLocal, get_db dependency
    ├── routes/
    │   ├── health.py              — GET /health
    │   ├── analytics.py           — student + course analytics
    │   └── dropout.py             — dropout risk endpoints
    ├── services/
    │   └── dropout_service.py     — RandomForest + rule-based fallback, CTE SQL queries
    └── tasks/
        └── celery_app.py          — Celery app + nightly beat schedule
```

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | `{status, model: "loaded"\|"rule_based_fallback"}` |
| GET | `/analytics/students/{student_id}` | Per-enrollment breakdown: attendance counts/rate + grade average |
| GET | `/analytics/courses/{course_id}` | Aggregate stats: enrollment counts, avg risk, avg grade, att rate, per-assessment breakdown |
| GET | `/dropout/risk/{enrollment_id}` | Single enrollment risk score + feature values |
| GET | `/dropout/batch/{course_id}` | Scores all ACTIVE enrollments in a course, writes to DB |
| GET | `/dropout/high-risk?threshold=0.65&limit=50` | Enrollments with score ≥ threshold, includes student + course details |
| POST | `/dropout/train` | Trains RandomForest on all historical data, saves `model/rf_model.pkl` |

### Dropout Risk Model
**Algorithm:** `RandomForestClassifier(n_estimators=100, max_depth=6)` — trained label: `enrollment.status == 'DROPPED'` → 1

**Features (7) — extracted via single CTE SQL query:**
| Feature | Description |
|---|---|
| `att_overall` | PRESENT count / total attendance records |
| `att_rate_30d` | attendance rate for last 30 days |
| `avg_grade_overall` | avg(score / max_score) normalized 0–1 |
| `late_submission_rate` | fraction of grades submitted after due_date |
| `submission_count` | total grades submitted |
| `total_assessments` | total assessments in the course |
| `days_since_login` | seconds since last_login_at / 86400 |

**Threshold:** score ≥ 0.65 → `isHighRisk: true`

**Rule-based fallback** (when `model/rf_model.pkl` does not exist):
```
score = 0.4*(1 - att_overall) + 0.4*(1 - avg_grade_overall) + 0.2*min(days_since_login/30, 1.0)
```

**Score written back to:** `enrollments.dropout_risk_score` (DECIMAL 5,4) after every prediction.

**Training skips** (returns `{status: "skipped"}`) when: fewer than 10 total samples, or fewer than 2 DROPPED enrollments in the dataset.

### Celery Nightly Task
- **Schedule:** `crontab(hour=2, minute=0)` UTC
- **Task name:** `src.tasks.celery_app.run_nightly_scoring`
- **Logic:** Fetch all ACTIVE enrollment IDs → call `predict_single()` for each → writes scores to DB
- **Error handling:** per-enrollment failures logged and skipped; task retries up to 3× (5-min delay) on full failure

### Settings (`src/config/settings.py`)
Uses `os.environ` + `python-dotenv` (NOT pydantic-settings — not installed).
```python
DATABASE_URL   = os.environ["DATABASE_URL"]      # required
REDIS_URL      = os.environ.get("REDIS_URL", "redis://localhost:6379")
MODEL_PATH     = os.environ.get("MODEL_PATH", "model/rf_model.pkl")
CORS_ORIGINS   = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
PORT           = int(os.environ.get("ANALYTICS_PORT", "5000"))
DROPOUT_THRESHOLD = float(os.environ.get("DROPOUT_THRESHOLD", "0.65"))
```

### Database Connection
Sync SQLAlchemy 2.0 + psycopg2-binary. Uses raw SQL (`text()`) — no ORM models defined.
All queries reference the same tables as the Prisma schema: `users`, `courses`, `enrollments`, `attendance`, `assessments`, `grades`.

---

## 9. Environment Variables

### `apps/api/.env`
```env
DATABASE_URL="postgresql://postgres:1111@localhost:5432/seasmp_db"
REDIS_URL="redis://:your_redis_password_here@localhost:6379"
JWT_ACCESS_SECRET=<64-char hex>
JWT_REFRESH_SECRET=<64-char hex>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
AES_ENCRYPTION_KEY=<64-char hex, 32 bytes>
NODE_ENV=development
API_PORT=4000
API_HOST=0.0.0.0
CORS_ORIGIN=http://localhost:3000
ANALYTICS_API_URL=http://localhost:8000
```

### `apps/web/.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### `apps/analytics/.env`
```env
DATABASE_URL="postgresql://postgres:1111@localhost:5432/seasmp_db"
REDIS_URL="redis://:your_redis_password_here@localhost:6379"
ANALYTICS_PORT=5000
CORS_ORIGINS=http://localhost:3000,http://localhost:4000
LOG_LEVEL=info
DROPOUT_THRESHOLD=0.65
MODEL_PATH=model/rf_model.pkl
```

Note: `apps/api/.env` has `ANALYTICS_API_URL=http://localhost:8000` — update to `http://localhost:5000` if the Node API ever calls the analytics service directly.

---

## 10. Known Issues / Quirks

Avvalgi ro'yxatdagi yettita band HAL QILINGAN (tekshirildi):

1. ✅ Root `package.json` dagi `apps/frontend` — endi `apps/web` to'g'ri
2. ✅ `apps/web/.git` ichma-ich repo — yo'q, bitta repo (`.git` faqat ildizda)
3. ✅ Jingalak qavsli axlat papkalar (`{apps...`) — mavjud emas
4. ✅ `apps/web/public/` — faqat `.gitkeep`, create-next-app qoldiqlari yo'q
5. ✅ `docker-compose.yml` dagi `apps/frontend` — `apps/web` ga tuzatilgan
6. ✅ `test-api.ps1` dagi refresh token izohi — endi README'da hujjatlashtirilgan
7. ✅ API→Analytics proksi — `apps/api/src/routes/analytics.routes.ts` da
   `PY_BASE = env.ANALYTICS_API_URL` orqali ishlaydi, `/v1/analytics/*`
   marshrutlari Python servisiga proksilanadi

Hozirgi holat — yangi topilgan cheklovlar:

1. **Xatti-harakat profili muvaffaqiyatli so'rovlardan o'rganadi.** Imtiyozli
   aktorning muvaffaqiyatli murojaati keyingi `profiles/refresh` da me'yor
   sifatida qabul qilinadi. Ya'ni sabrli ichki tahdid o'zini asta me'yorga
   aylantira oladi. Tizimning haqiqiy cheklovi, hujjatlashtirilgan.

2. **2-qatlam tarixsiz ishlamaydi.** Profil uchun 30 kunlik oyna va kamida 50
   kuzatuv kerak. Toza o'rnatishda `npm run db:seed:history` va keyin
   `POST /v1/security/profiles/refresh` bajarilmasa, CORRELATED hukm hech
   qachon chiqmaydi.

3. **Imtiyozli qamrov chegaralari o'lchanmagan.** `PRIVILEGED_SCOPE_FLOOR`
   (20), `SATURATION` (60), `CAP` (0.5) — boshlang'ich qiymatlar, haqiqiy
   trafikda qayta tekshirilishi kerak.

4. **Tezlik chegarasi jarayon xotirasida** (`@fastify/rate-limit`). Bir nechta
   API nusxasi ishlatilsa chegara har nusxada alohida hisoblanadi.

5. **Eksperiment stendi 12 ta qo'lda yozilgan stsenariyga tayanadi.**
   `src/tools/evaluate.ts` dagi F1=1.000 "gibrid mukammal" degani emas —
   faqat shu holatlarda alohida qatlamlar yiqilishini bildiradi.

6. **CD hech qachon ishlamagan**: `PROD_HOST`, `PROD_USER`, `SSH_KEY` yo'q.

7. **Git Bash tuzog'i**: `docker exec ... /app/...` va load-test ning
   `--path` argumenti MSYS_NO_PATHCONV=1 talab qiladi, aks holda yo'l
   Windows ko'rinishiga aylantiriladi va xato jimgina yuz beradi.

---

## 11. How to Run Locally

```powershell
# 1. Start infrastructure
docker-compose up postgres redis -d

# 2. API
cd apps/api
npm install
npx prisma migrate dev   # first time only
npm run db:seed          # first time only
npm run dev              # port 4000

# 3. Frontend
cd apps/web
npm run dev              # port 3000

# 4. Analytics service
cd apps/analytics
.\start.ps1                  # uvicorn on port 5000 with --reload

# 4b. Celery worker (separate terminal — required for nightly scoring)
.\start-worker.ps1

# 4c. Celery beat scheduler (separate terminal — required for nightly cron)
.\start-beat.ps1

# 5. Run API test suite
cd ../../    # back to root
.\test-api.ps1           # 86/86 tests passing
```

---

## 12. Test Coverage

`test-api.ps1` — PowerShell test suite, **86/86 tests passing**.

Covers: health, auth (login/2FA/logout/bad creds), users CRUD, courses CRUD+status, enrollments, attendance (manual mark + QR generate/scan/reuse), assessments + grades, analytics (all 3 roles), security (audit logs + sessions + cleanup).

Test data isolation: unique emails via `$ts = [int64](Get-Date -UFormat %s)`, unique attendance dates via `(Get-Date "2200-01-01").AddDays($ts % 50000)`, unique QR dates via `(Get-Date "2300-01-01").AddDays($ts % 50000)`.

---

## 13. Aniqlash qatlamlari (loyihaning yadrosi)

Bu bo'lim ilgari umuman yo'q edi, holbuki ishning ilmiy qismi shu yerda.

### Gipoteza

Avtorizatsiya qatlami "noto'g'ri obyekt" ni, xatti-harakat qatlami "noto'g'ri
namuna" ni tutadi. Ular turli tahdid sinflarini ko'radi, birgalikda esa
yolg'on ishoralar kamayadi. Mexanizm: yolg'iz qatlam ogohlantirishi uchun
KUCHLI dalil kerak (`SINGLE_THRESHOLD` 0.75), ikkala qatlam tasdiqlasa past
chegara yetarli (`CORRELATED_THRESHOLD` 0.50).

### 1-qatlam — avtorizatsiya

`services/ownershipResolver.ts`. Egalik `ownership_rules` jadvalidagi
deklarativ qoidalardan hisoblanadi: resurs turi + nuqtali yo'l
(`enrollment.course.teacherId`) + rol (OWNER / CUSTODIAN). Yo'l Prisma
`include` daraxtiga aylantiriladi.

Natija: `SELF | OWNER | CUSTODIAN | PRIVILEGED | FOREIGN | UNKNOWN`.

**Imtiyozli aktorlar uchun alohida yo'l.** Admin uchun begona obyekt
tushunchasi yo'q — hammasi unga ochiq, shuning uchun FOREIGN deb belgilash
jurnalni yolg'on signalga to'ldirardi. Uning o'rniga QAMROV o'lchanadi:
oynada nechta HAR XIL egaga tegdi (`signalWindow.recordPrivilegedScope`).
Qamrov riskining tepa chegarasi (`PRIVILEGED_SCOPE_CAP` 0.5) ataylab
`SINGLE_THRESHOLD` dan past — ya'ni keng qamrov yolg'iz o'zi hech qachon
ogohlantira olmaydi, faqat 2-qatlam tasdiqlasa hukm chiqadi.

### 2-qatlam — xatti-harakat

`services/behaviorScoring.ts` (sof mantiq) va `behaviorProfiler.ts` (profil).
Qattiq chegaralar o'rniga HAR BIR FOYDALANUVCHINING o'z profili: soat va
hafta kuni histogrammasi, tanish IP va qurilmalar, resurs aralashmasi,
soatiga so'rovlar o'rtachasi.

- soat doiraviy Gauss yadrosi bilan silliqlanadi (`HOUR_KERNEL`, ±5 soat)
- "kutilmaganlik" Laplace silliqlash bilan
- signallar noisy-OR bilan qo'shiladi
- chastota z-ball emas, logarifmik nisbat orqali
- profil `MIN_SAMPLES` (50) dan kam bo'lsa ball 0 — yangi foydalanuvchi ayblanmaydi

### Qaror — bitta nuqta

Qatlamlar ogohlantirish YARATMAYDI. Ular Redis'dagi 15 daqiqalik oynaga
(`signalWindow.ts`) faqat dalil yozadi; hukmni `correlationDetector.ts`
`correlate()` orqali bir marta chiqaradi. Bir qatlam bo'yicha 15 daqiqada
bitta ogohlantirish (sovish oynasi).

### Hodisa qamrovi

`services/requestAudit.ts` — `onResponse` hooki. Har bir `/v1/` so'rovi audit
logga yoziladi, 401/403 esa `ACCESS_DENIED` sifatida. `/v1/security` ataylab
chetda: aniqlash tizimining o'z sahifalarini qayd etsak, jurnalni ochishning
o'zi yangi yozuvlar yaratib, o'zini oziqlantirardi.

`DETECTION_ENABLED=false` butun qatlamni o'chiradi — audit yozuvi ham
to'xtaydi, shuni yodda tuting.

### Vositalar

| buyruq | nima qiladi |
|---|---|
| `npm run db:seed:history -w apps/api` | 2-qatlam uchun 30 kunlik tarix (ONSIZ qatlam jim) |
| `POST /v1/security/profiles/refresh` | profillarni qurish |
| `npx tsx src/tools/evaluate.ts` | ROC va ishlash nuqtasi jadvali |
| `npm run demo:behavior -w apps/api` | jonli profillar ustida namoyish |
| `npm run check:realtime -w apps/api` | soket shlyuzi tekshiruvi |
| `scripts/detection-demo.sql` | 1-qatlamning SQL namoyishi |

---

## 14. Real vaqt, bildirishnomalar va xato monitoringi

### Real vaqt (`apps/api/src/realtime/gateway.ts`)

Socket.io ulangan edi, lekin birorta `emit` yo'q edi — va ulanish umuman
autentifikatsiya qilinmasdi: xona nomi MIJOZ bergan identifikatordan
yasalardi, ya'ni istalgan odam istalgan kursning xonasiga kirardi.

Endi:

| xona | qanday qo'shiladi |
|---|---|
| `user:<sub>` | handshake dagi tekshirilgan tokendan, avtomatik |
| `role:<ROLE>` | tokendagi roldan, avtomatik |
| `course:<id>` | server tomonda tasdiqlangandan keyin: admin hammasiga, o'qituvchi o'zinikiga, talaba yozilganiga |

Hodisalar: `attendance:marked` (kurs xonasiga va talabaga),
`security:alert` (faqat imtiyozli rollarga), `notification:new` (faqat egasiga).

Tekshirish: `npm run check:realtime --workspace=apps/api` — ishlab turgan
serverga qarshi 12 ta tekshiruv. Soket qatlami jest bilan sinalmaydi: unit
testlar tashqi xizmatga ulanmaydi, integration to'plami esa Fastify'ni
`inject` bilan chaqiradi va WebSocket u yerdan o'tmaydi.

### Bildirishnomalar (`notifications` jadvali)

Qo'ng'iroq ilgari audit jurnalidan yasalardi va faqat ADMIN uchun ishlardi.
Sababi tub: audit jurnali harakatni KIM qilganini yozadi, bildirishnoma esa
xabar KIMGA tegishli ekanini talab qiladi.

Manbalar: baho qo'yilganda -> talabaga; davomat belgilanganda -> talabaga
(QR bilan O'ZI belgilagan holat bundan tashqari); kursga yozilganda ->
talaba va o'qituvchiga; xavfsizlik ogohlantirishi -> barcha faol adminlarga.

**Egalik marshrutda emas, tokenda.** `/v1/notifications` da `:userId` YO'Q —
kimniki ekani `request.user.sub` dan olinadi. Begona bildirishnomani
o'qilgan deb belgilashga urinish **404** qaytaradi (403 emas: boshqa odamda
bunday yozuv BOR ekanini bilib olish imkoni qolmasin).

### Xato monitoringi (`config/errorReporter.ts`)

Ikkita nosozlik yopildi:

1. `app.setErrorHandler(...)` marshrutlardan KEYIN turardi. Fastify bola
   kontekstga ro'yxatdan o'tish paytidagi ishlovchini beradi, shuning uchun
   maxsus ishlovchi `/v1` marshrutlarining BIRORTASIGA ham qo'llanmagan.
   500 xatolar Fastify ning standart ko'rinishida qaytardi va ichki xabarni
   oshkor qilardi. Ishlovchi endi marshrutlardan OLDIN o'rnatiladi.

2. 500 xatolar hech qayerda qayd etilmasdi. Endi metod, yo'l, foydalanuvchi
   va stack bilan yoziladi. 4xx lar qayd etilmaydi — ular kutilgan holat.

Sentry ATAYLAB majburiy emas: `SENTRY_DSN` bo'lmasa modul jim ishlaydi va
xatolar faqat Winston orqali yoziladi. Brauzer xatolari ham shu yo'ldan
o'tadi: `ErrorBoundary` -> `POST /v1/telemetry/client-error`.

---

## 15. Ilmiy validatsiya — E1 (tashqi benchmark) va E2 (ko'r baholash)

`evaluate.ts` dagi eng katta metodologik zaiflik: hujum/zararsiz stsenariylar
HAM, ularni baholovchi tizim (chegaralar, vaznlar) HAM bir xil loyihada, bir
xil odam tomonidan yozilgan — bu aylanma dalil, BMI himoyasida "tizim o'zi
yozgan testni o'tadi" degan e'tirozga ochiq. Ikkita mustaqil tekshiruv
qo'shildi.

### E2 — Ko'r baholash (`apps/api/src/tools/blindEval.ts`)

Ssenariylar FAQAT tahdid modeli nuqtai nazaridan yozilgan — yozish
jarayonida `correlation.ts` yoki `behaviorScoring.ts` fayllariga murojaat
qilinmagan. Har biri HAQIQIY HTTP so'rov bilan ishlab turgan API'ga
yuborilgan, natija esa productiondagi HAQIQIY `correlate()` funksiyasi
orqali o'qilgan (yangi hisoblash yo'q — deploy qilingan tizim o'lchandi).

**MUHIM CHEKLOV:** server real vaqtdan (`new Date()`) foydalanadi, skript
soatni sun'iy o'zgartira olmaydi — shuning uchun soat signali bu testda
ishtirok etmaydi. Faqat vaqtdan mustaqil signallar sinaldi: avtorizatsiya
(FOREIGN), notanish IP/qurilma, qamrov, chastota.

**Natija (N=14, 7 hujum / 7 zararsiz, `npm run eval:blind --workspace=apps/api`):**

| | |
|---|---|
| Confusion matrix | TP=6, FP=0, FN=1, TN=7 |
| Aniqlik (precision) | **1.000** |
| Qamrov (recall) | **0.857** |
| F1 | **0.923** |
| ROC AUC | **0.980** |

Yagona o'tkazib yuborilgan holat: "Vakolatdan tashqari resurslarga sayohat"
(o'qituvchi `/v1/users` ga ikki marta urinib, ikkalasida ham 403 oldi) —
zaif rad etish signali (2 ta, to'yinish 5 ta) + o'rtacha xatti-harakat bali
(0.47) birlashib ham `CORRELATED_THRESHOLD` (0.50) dan o'tolmadi. Haqiqiy,
hujjatlashtirilgan cheklov.

**Yo'l davomida topilgan metodologik xato:** birinchi yugurishlarda skript
o'zi yaratgan HTTP trafigi audit jurnaliga yozilib qolib, KEYINGI
`profiles/refresh` da aktorning me'yoriga qo'shilib ketgan — bu esa
"Ommaviy ma'lumot chiqarish" ssenariysini ikkinchi yugurishda aniqlanmay
qoldirgan (o'lchandi: reqPerHourMean 8.0/soat → MASS_ACCESS_FLOOR=160, 130
so'rov yetmadi; tozalangandan keyin 3.4/soat → chegara 100, to'g'ri
aniqlandi). Skript endi o'zini avtomatik tozalaydi (`--no-cleanup` bilan
o'chirish mumkin).

### E1 — Tashqi benchmark (`apps/api/src/tools/externalBenchmark.ts`)

Manba: **CMU CERT Insider Threat Test Dataset, release r4.2**
(https://kilthub.cmu.edu/articles/dataset/Insider_Threat_Test_Dataset/12841247,
DOI 10.1184/R1/12841247, CC BY 4.0). To'g'ridan-to'g'ri yuklanadi —
ro'yxatdan o'tish yoki so'rov formasi TALAB QILINMAYDI (dastlab shunday
deb taxmin qilingan edi, amalda tekshirilib rad etildi).

**Nega r4.2:** barcha versiyalar bo'yicha 191 ta belgilangan insayderdan 70
tasi (36.6%) aynan shu versiyada — boshqa versiyalar (r2: 1 ta, r3.x: 2
tadan, r4.1: 3 ta) statistik jihatdan ishonchsiz natija berardi.

**Xaritalash:** CERT `logon.csv` (foydalanuvchi, sana, PC, Logon/Logoff)
bizning HTTP so'rov oqimiga mos keladi; PC — IP+qurilma birlashtirilgan
holda; foydalanuvchining eng ko'p ishlatgan PC'si — OWNER (tanish IP)
ekvivalenti; boshqa PC'dan kirish — FOREIGN (1-qatlam signali). Baholovchi
kod productiondan O'ZGARTIRMASDAN import qilingan: `scoreEvent`,
`correlate`, `authzRisk`, `behaviorRisk` — maqsad yangi algoritm emas,
MAVJUDINI tashqi ma'lumotda o'lchash.

**Ochiq aytilgan soddalashtirishlar:**
- productionda signal 15 daqiqalik oynada to'planadi; CERT foydalanuvchisi
  kuniga 1-4 marta kiradi — shuning uchun har bir belgilangan SESSIYA
  (answers faylidagi boshlanish-tugash) bitta holat sifatida olinadi
- CERT da "rad etilgan urinish" tushunchasi yo'q (domenga kirish ochiq) —
  boshqa PC'dan kirish har doim `authzAllowed=1` (to'liq risk) sifatida
  hisoblanadi, `authzDenied` (qisman risk) ishlatilmaydi
- Salbiy sinf uchun tasodifiy 300 foydalanuvchi tanlanadi (down-sampling
  bosqichi kodda saqlandi, lekin amalda logon.csv da bor-yo'g'i 1000 ta
  noyob foydalanuvchi chiqdi — dastlab taxmin qilingan ~4000 emas; ya'ni
  salbiy sinf populyatsiyaning ~32%, kichik tasodifiy namuna emas)

**Natija (70 insayder + 300 tasodifiy zararsiz, jami 367 holat):**

| | |
|---|---|
| Confusion matrix | TP=19, FP=67, FN=51, TN=230 |
| Aniqlik | **0.221** |
| Qamrov | **0.271** |
| F1 | **0.244** |
| ROC AUC | **0.627** |

E2 dan (0.980) sezilarli past. Diagnostika: TP bo'lgan 19 ta holatning
HAMMASI risk=1 oldi (authzAllowed=1 -- sessiyada boshqa PC ishlatilgan),
bitta ham faqat xatti-harakat signali orqali tutilmagan. Matematik jihatdan
aniq: 19 / 70 = 0.2714 -- bu qamrov bilan bitta xonagacha mos keladi.

Sabab: bu yugurish FAQAT logon.csv dan foydalandi (hisoblash vaqtini
tejash uchun ataylab tanlangan qamrov qarori). CERT insayder
ssenariylarining aksariyati boshqa PC'ga jismoniy kirish bilan
CHEKLANMAYDI -- ular email orqali tashqariga yuborish, tashqi ish-qidiruv
saytlariga tashrif, USB orqali fayl ko'chirish kabi KANALLARDA namoyon
bo'ladi (email.csv, http.csv, device.csv -- bu yugurishda ishlatilmagan).
Qolgan 51 ta insayder logon.csv nuqtai nazaridan zararsiz ko'rinadi --
ularning haqiqiy zararli faoliyati boshqa kanalda.

FP tomonida ham xuddi shu mexanizm teskarisiga ishladi: 67 ta yolg'on
ishoraning aksariyati ham anyForeign=true dan kelib chiqadi -- ba'zi
zararsiz xodimlar ham vaqti-vaqti bilan boshqa PC ishlatadi (umumiy
kompyuter, IT yordami). Bizning LMS'da begona obyektga muvaffaqiyatli
murojaat hech qachon qonuniy bo'lmaydi, CERT'da boshqa PC ishlatish
bunday kafolatga ega emas -- xuddi shu vaznni ko'chirib olish noaniq
proksi yaratdi.

Xulosa (BMI muhokamasi uchun): past AUC gibrid-korrelyatsiya
gipotezasining o'zi noto'g'ri ekanini ko'rsatmaydi -- E2 aynan shu
gipotezani boy, ko'p signalli ma'lumotda tasdiqladi (AUC=0.980). E1 past
natijasi ma'lumot boyligi cheklovini ko'rsatadi: bitta zaif proksi-signal
(faqat PC identifikatori) productionda 5 xil signal bilan ishlaydigan
behaviorScoring.ts ni to'liq almashtira olmaydi. Kelgusi ish yo'nalishi:
email.csv/http.csv/device.csv ni ham qo'shib qayta o'lchash.

Ishlatish:
```bash
npx tsx apps/api/src/tools/externalBenchmark.ts --dir=<r4.2 papkasi>
```
