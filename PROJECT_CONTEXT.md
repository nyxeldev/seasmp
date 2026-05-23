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

### Analytics (`apps/analytics`) — **FULLY BUILT, port 5000**
| Layer | Technology |
|---|---|
| Framework | FastAPI 0.136.1 |
| DB | SQLAlchemy 2.0 sync + psycopg2-binary (PostgreSQL 17) |
| ML | scikit-learn 1.8 (RandomForestClassifier), numpy 2.4, joblib 1.5 |
| Queue | Celery 5.6 + Redis broker (nightly beat at 02:00 UTC) |
| Settings | `os.environ` + python-dotenv (`pydantic-settings` not installed) |
| Python | 3.14.0 (venv at `apps/analytics/venv/`) |
| Packages | All installed in venv. See `requirements.txt`. |

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

1. **Root `package.json`** references `apps/frontend` (wrong — it's `apps/web`) and `packages/*` (doesn't exist). Scripts `dev:frontend` and `build` are broken at root level. Each app is run independently.

2. **`apps/web/.git/`** — `create-next-app` created a nested git repo. Root project has no `.git`. One or the other needs to be resolved.

3. **Junk directories** at root: `{apps` and `{apps/{api,analytics,frontend},packages/shared,nginx,docker}` — literal brace-named dirs from a failed PowerShell mkdir. Safe to delete.

4. **`apps/web/public/`** contains 5 unused SVG placeholders from create-next-app (next.svg, vercel.svg, etc.).

5. **`docker-compose.yml`** references `apps/frontend` (should be `apps/web`). Analytics `Dockerfile` now exists at `apps/analytics/Dockerfile`.

6. **Refresh token in test script**: `test-api.ps1` sends `refreshToken` in the JSON body for login because PowerShell can't easily read HttpOnly cookies. The `authApi.login()` in the web frontend also returns only `accessToken` from the body (refreshToken goes to cookie automatically).

7. **Analytics service not yet called by the Node API**: `ANALYTICS_API_URL=http://localhost:5000` is set in `apps/api/.env` but no Fastify routes currently proxy to it. The frontend dashboard hits the analytics service directly if needed, or it can be called from the browser against port 5000.

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
