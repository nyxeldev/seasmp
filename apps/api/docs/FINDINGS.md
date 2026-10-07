# SEASMP Backend/API — Findings Register

Residual findings discovered during the Backend/API Fix phases that were
confirmed by code/evidence but **not fixed** in the run that discovered them,
either because they are out of that run's declared scope or because fixing
them requires a decision/design step beyond a minimal targeted change.

No findings in this file are fixed by editing this file. Status changes only
when a dedicated phase resolves the item (update the `Status` column then).

| ID | Phase found | Category | Status |
|----|-------------|----------|--------|
| R1 | Phase 2.1 closeout | Reliability | **RESOLVED** (Final Closeout; HTTP envelope proven — Closeout Correction) |
| R2 | Phase 2.1 closeout | Security scope | Open |
| R3 | Phase 2.1 closeout | Edge case | **MITIGATED** (Closeout Correction — see residual risk below) |
| R4 | Phase 2.1 closeout | Telemetry | **RESOLVED** (Closeout Correction — route-pattern-aware) |
| R5 | Phase 2.1 closeout | DevOps / Repository integrity | Open |
| R6 | Phase 2.1 closeout (Item 3) | Telemetry | **RESOLVED** (Closeout Correction — route-pattern-aware) |
| R7 | Phase 2.1 closeout (Item 1) | Reliability | **RESOLVED** (Final Closeout) |
| R8 | Final Closeout | Auth scope | Open |
| R9 | Closeout Correction | Telemetry | **RESOLVED** (same change as R4/R6 — see below) |
| R10 | Closeout Correction (cleanup round) | Security scope | Open — found, documented, NOT fixed this round |

---

## R1 — `refresh()` fails with 500 instead of 503 on a Redis outage

**Description:** `auth.service.ts`'s `refresh()` calls `redis.get('refresh_used:...')`
and `redis.setex('refresh_used:...', ...)` with no try/catch. If Redis is
unreachable, both calls reject and the whole `refresh()` call throws
uncaught, which the global error handler turns into a generic `500`.

**Evidence:** `apps/api/src/services/auth.service.ts` — the reuse-check
`redis.get(...)` call (reuse-detection branch) and the tombstone-write
`redis.setex(...)` call (success path) are both unwrapped.

**Impact:** Behavior is **fail-closed** — a Redis outage denies refresh
entirely rather than silently skipping reuse detection. This is the safe
direction, but the HTTP status code is misleading: an infrastructure outage
should surface as `503 Service Unavailable`, not `500 Internal Server
Error`, so monitoring/alerting and client retry logic can tell the two
apart.

**Target phase:** Error Handling & Edge Cases.

---

## R2 — `revokeAllSessions` only revokes refresh tokens, not live access tokens

**Description:** `securityService.revokeAllSessions(userId)` deletes
`RefreshToken` rows only (`prisma.refreshToken.deleteMany({ where: { userId
} })`). Access tokens are stateless JWTs with their own `exp` claim
(`JWT_ACCESS_EXPIRES_IN`, 15m default) and are never checked against a
denylist. So when reuse is confirmed and sessions are "revoked," any access
token issued before the incident remains valid for up to its own remaining
lifetime — the response does not actually terminate in-flight access.

**Evidence:** `apps/api/src/services/security.service.ts` —
`revokeAllSessions`; `apps/api/src/middlewares/auth.middleware.ts` —
`authenticate` validates the JWT signature/expiry only, no revocation check.

**Impact:** A confirmed-theft response revokes the ability to get a *new*
access token, but does not immediately cut off an *already-issued* one.
Needs a decision: shorten the access-token TTL further, or introduce an
access-token denylist (Redis, keyed by `jti` or user+issued-at) checked on
every authenticated request.

**Target phase:** Authentication/Authorization Audit.

---

## R3 — Tombstone-then-delete ordering leaves a window if the Prisma delete itself fails (MITIGATED, not fully closed)

**Description:** In `refresh()`, the Redis tombstone (`refresh_used:<hash>`)
is written *before* `prisma.refreshToken.delete(...)`. This ordering is
deliberate (a P2025 race-loser still sees the tombstone — see the P2025
guard added this session). But it creates a different, narrower edge case:
if the `setex` succeeds and the subsequent `delete` throws for a reason
*other* than P2025 (e.g. a transient DB error), the row is **not** removed —
the token is tombstoned in Redis but still present and valid in Postgres.
A later legitimate presentation of that same token would be found in the
DB (not hit the "not found → check tombstone" branch at all) and would
rotate normally, with no reuse alert, even though a tombstone exists for it.

**Evidence:** `apps/api/src/services/auth.service.ts` — `setex(...)` then
`try { delete(...) } catch { if P2025 ... }`; any non-P2025 error is
re-thrown, but the row is left in its pre-delete state either way.

**Impact:** Low-probability (requires a transient DB failure at that exact
line), and not a security hole — it just means the tombstone's presence is
not a reliable 100% signal if the delete partially fails. A fully robust
fix would combine the tombstone-write and the delete into a single
transaction, or treat "row still exists AND has a tombstone" as its own
explicit state.

**Target phase:** Error Handling & Edge Cases.

---

## R4 — `/v1/attendance/stats/:enrollmentId` is invisible to the detection layer

**Description:** `targetFromPath` (`requestAudit.ts`) extracts the literal
URL segment immediately before the UUID. For this route that segment is
`stats`, not a resource-type word, so `resource = 'stats'` — which matches
no entry in `MODEL_BY_RESOURCE` or `RESOURCE_TYPE_ALIASES`. Every access to
this endpoint is logged with `accessRelation = UNKNOWN` and can never be
flagged by `shouldRaiseForeign`/the correlation layer.

**Evidence:** `apps/api/src/routes/attendance.routes.ts:85` (route);
`apps/api/src/services/requestAudit.ts` (`targetFromPath`'s
"segment-before-UUID" heuristic).

**Impact:** **Telemetry only — not an authorization bypass.** The real
access-control decision is enforced independently inside
`apps/api/src/services/attendance.service.ts`'s `getStats()` (student must
own the enrollment, teacher must own its course, else 403), completely
unrelated to `resolveAccess`. Fixing the telemetry gap requires replacing
`targetFromPath`'s heuristic with route-pattern-aware extraction — a
materially larger change than M5's alias table.

**Target phase:** Security Audit.

---

## R5 — Prisma schema/migration state is uncommitted; live DB and repo have drifted

**Description:** `apps/api/prisma/schema.prisma` and `migration_lock.toml`
are modified in the working tree but not committed, and
`migrations/20261001194021_provenance_checks_and_cleanup/` is untracked.
The migration was applied to the local/live database (confirmed: the
columns and index it adds — `scoreModelVersion`, `scoredAt`, the
`[userId, createdAt]` audit index — are live and exercised by passing
tests), so the database and the committed repository are currently out of
sync. A deploy from a clean clone of the committed history would **not**
reproduce the current schema.

**Evidence (read-only, this session):**
```
$ git status --porcelain apps/api/prisma
 M apps/api/prisma/migrations/migration_lock.toml
 M apps/api/prisma/schema.prisma
?? apps/api/prisma/migrations/20261001194021_provenance_checks_and_cleanup/

$ git log --oneline -3 -- apps/api/prisma
292641d feat(security): Bosqich B — egalik munosabatlarini trafikdan avtomatik chiqarish
8ab7f0c feat(notifications): har bir foydalanuvchi uchun bildirishnomalar
11b555f feat(security): 2-qatlam uchun xatti-harakat tarixi — gipoteza endi jonli tizimda
```
The applied migration (`20261001194021_provenance_checks_and_cleanup`) does
**not** appear in git history at all — confirmed absent from the last 3
commits touching `apps/api/prisma`, and it is listed as untracked (`??`) in
`git status`, meaning no commit anywhere in this branch's history contains
it.

**Impact:** The Database phase's "no schema drift" conclusion holds only on
this local machine, not against the committed repository. Any fresh
deploy/clone would be missing this migration.

**Target phase:** DevOps / Production.

---

## R6 — Additional unmatched detection-pipeline resource strings beyond `enrollment`/`course`/`stats`

**Description:** Building the full writer/reader inventory for M5 (see the
Phase 2.1 closeout report, Item 3) surfaced three more route segments that
`targetFromPath` extracts as a "resource" but that match nothing in
`MODEL_BY_RESOURCE`/`RESOURCE_TYPE_ALIASES`, in the same way `stats` does:

- `teacher` — from `GET /v1/analytics/teacher/:teacherId/kpi`
  (`apps/api/src/routes/analytics.routes.ts:174`)
- `students` — from `GET /v1/analytics/students/:studentId`
  (`apps/api/src/routes/analytics.routes.ts:213`)
- `notifications` — from `PATCH /v1/notifications/:id/read`
  (`apps/api/src/routes/notification.routes.ts:27`) — this one never even
  reaches a UUID match since notification ids are BigInt, not UUID-shaped,
  so it falls back to the route's first segment regardless.

**Impact:** Same classification as R4 in every case — **telemetry only**.
Each of these routes enforces its real authorization check independently,
inside the relevant service (`analyticsService.studentStats`,
`analyticsService.*` teacher-ownership checks, `notificationService.markRead`'s
`userId` match), not through `resolveAccess`. None of these are aliasable
(none are singular/plural forms of a real resource type — `teacher` and
`students` are role/collection words, not the `users` resource's own name,
and `notifications` has no ownership-rule entry at all in this system).

**Target phase:** Security Audit (bundle with R4 — same root cause, same
fix shape).

---

## R7 — Other routes passing an id into `BigInt()` without an upper-bound check

**Description:** The audit-logs route's BigInt-overflow guard (see Phase
2.1 closeout, Item 1) was fixed. Two other routes construct a `BigInt` from
a path param and were **not** fixed in that run (out of its declared
scope — "fix only the audit-logs route").

- `apps/api/src/routes/notification.routes.ts:30` — `PATCH /:id/read`:
  wraps `BigInt(id)` in try/catch, so a non-numeric id is caught (400), but
  there is **no upper-bound check** — a numeric string beyond Postgres
  bigint range (`> 9223372036854775807`) still parses successfully and
  would raise SQLSTATE 22003 when it reaches `notificationService.markRead`,
  falling through to a generic 500.
- `apps/api/src/routes/security.routes.ts:76` — `PATCH /alerts/:id/resolve`:
  calls `BigInt(id)` directly with **no validation at all** — neither a
  digits-only check nor an upper-bound check. Both a non-numeric id and an
  overflow id currently produce an unhandled exception and fall through to
  a raw 500.

**Impact:** Same defect class as the original L1 finding, confirmed present
in two more places by code inspection (not yet reproduced with a live probe
for these two routes).

**Target phase:** Error Handling & Edge Cases (bundle with R1/R3 — same
general "validate before it reaches Postgres" theme).

**Resolution (Final Closeout):**
- `apps/api/src/routes/notification.routes.ts` — added `BigInt(id) > PG_BIGINT_MAX` upper-bound check after the existing syntax-error try/catch.
- `apps/api/src/routes/security.routes.ts` — added `!/^\d+$/.test(id)` + `BigInt(id) > PG_BIGINT_MAX` guard before `securityService.resolveAlert`.
- `apps/api/src/lib/prismaErrors.ts` — added `export const PG_BIGINT_MAX = 9223372036854775807n`; imported in both route files.
- **Tests:** `src/tests/integration/notifications.integration.test.ts` (6 tests), `src/tests/integration/security.integration.test.ts` — new `describe('PATCH /v1/security/alerts/:id/resolve')` block (5 tests).

---

## R1 — Resolution notes

**Fix:** Wrapped `redis.get(...)` (reuse-detection branch) and `redis.setex(...)` (success path) in individual try/catch blocks in `apps/api/src/services/auth.service.ts`. Each catch throws `Object.assign(new Error(...), { statusCode: 503 })`. Updated global error handler in `apps/api/src/app.ts` to map `statusCode === 503` to `'SERVICE_UNAVAILABLE'`.

**Tests:** `src/tests/security/refreshRedisFailure.test.ts` — `R1 — Redis get failure → 503 (fail-closed)` (2 tests), `R1 — Redis setex failure → 503 (fail-closed)` (1 test). These prove `authService.refresh()` throws `{ statusCode: 503 }`, not that the client receives a 503.

**HTTP envelope (Item 2b, Closeout Correction):** the above only proved the thrown object, not the response `app.ts`'s error handler actually sends. `src/tests/integration/refreshServiceUnavailable.integration.test.ts` drives a real `POST /v1/auth/refresh` through the real app (Redis mocked at the client boundary via `jest.spyOn(redis, 'get')`, restored after) and asserts the actual HTTP response: status `503`, body `{ success: false, error: { code: 'SERVICE_UNAVAILABLE' } }`. A second control test (healthy Redis, same unknown token) asserts the ordinary `401`, proving the 503 above is specifically attributable to the Redis failure.

---

## R3 — Resolution notes (MITIGATED — Closeout Correction)

**Fix:** In `apps/api/src/services/auth.service.ts` `refresh()`, the non-P2025 branch of the delete try/catch now calls `await redis.del(\`refresh_used:\${tokenHash}\`).catch(() => {})` before rethrowing, removing the phantom tombstone.

**Decision (Item 2a — option (b), explicitly, not (a)):** Invariant (ii) — "no tombstoned-but-usable token" — holds ONLY when that `redis.del()` succeeds. It is best-effort by design: the FORBIDDEN list for this round disallows a distributed lock, a retry loop, or a transaction boundary around Redis, and no design closes this window without one of those (the tombstone write and the Postgres delete are two different systems; making their outcome atomic requires exactly the primitives that are forbidden). Given that constraint, (a) — closing R3 so the invariant holds unconditionally — is not achievable without inventing something fragile. R3 is therefore reclassified **MITIGATED**, not RESOLVED.

**Residual risk, written out:** if the Redis `setex` tombstone write succeeds, the Postgres `delete` then fails for a non-P2025 reason (a transient DB error), AND the subsequent best-effort `redis.del()` cleanup ALSO fails (e.g. the same infra incident took out both), the token is left tombstoned in Redis but still present and valid in Postgres. A later legitimate presentation of that token is found in the DB directly (the "not found → check tombstone" branch is never reached), so it rotates normally with **no reuse alert** — silently reverting to R3's original described behavior. This is the same low-probability, correlated-double-failure window as originally described; it is not widened or narrowed by this round, only explicitly accepted instead of implicitly asserted away.

**Both-failures test (required by Item 2a):** `src/tests/security/refreshRedisFailure.test.ts` → `R3 — non-P2025 delete failure → tombstone removed (best effort)` → `'even if del also fails, the original error is still thrown (fail-closed)'`. Asserts: when both `prisma.refreshToken.delete` and `redis.del` reject, `refresh()` rejects with the ORIGINAL Prisma error (`message: 'DB error'`), unmodified and with no `statusCode` — the generic case, so `app.ts`'s handler falls through to `500 INTERNAL_SERVER_ERROR`. **This outcome is judged acceptable**: a bare infra 500 (not a silently-successful rotation, and not a false reuse accusation) is the honest result of two independent systems failing at once, and matches R1's own fail-closed philosophy — the request does not succeed, the client must retry.

**Tests:** `src/tests/security/refreshRedisFailure.test.ts` — `R3 — non-P2025 delete failure → tombstone removed (best effort)` (2 tests, including the both-failures case above), `R3 — P2025 benign race is unchanged` (1 test).

---

## R4 + R6 — Resolution notes (Closeout Correction — supersedes the prior round's fix)

**Why the prior fix was rejected:** the previous round kept the "segment before the id" heuristic and bolted a denylist (`UNOWNABLE_SEGMENTS = {'teacher','students'}`) onto it. That denylist mapped `/analytics/teacher/:teacherId/kpi` and `/analytics/students/:studentId` to `'_unownable'` — but `teacherId`/`studentId` ARE user ids, so this turned a real cross-owner-access blind spot into a permanent, deliberate one, and any future route with a new descriptor segment would still degrade to UNKNOWN. Reported as RESOLVED at the time; it was not.

**Fix (this round):** `targetFromPath` no longer reads the resource type from the live request path at all. It now takes the Fastify-registered route PATTERN as its second argument — `request.routeOptions.url` (Fastify 5; confirmed via `node_modules/fastify/types/request.d.ts`, `readonly routeOptions: Readonly<RequestRouteOptions<...>>` with `url: string | undefined`) — and derives the resource type from that pattern plus the matched param name:

1. `findIdParam(routePattern)` walks the PATTERN's segments (not the path) and returns the last `:param` segment's name plus the literal segment immediately preceding it in the pattern.
2. `PARAM_NAME_TO_RESOURCE` maps semantic param names directly: `enrollmentId→enrollments`, `courseId→courses`, and now also `teacherId→users`, `studentId→users`, `userId→users` (a teacher/student id IS a user id — this is the actual R6 fix, not a denylist entry).
3. For generic `:id` routes, the param name doesn't disambiguate, so the literal segment preceding `:id` IN THE PATTERN is used instead (e.g. `/v1/courses/:id` → `'courses'`) — this is pattern-derived, not path-derived, so it cannot be fooled by anything in the live URL.
4. `UNOWNABLE_PATTERNS` (exact registered patterns only) replaces `UNOWNABLE_SEGMENTS`. It now has exactly one entry — see R9 below — because every route that previously relied on the `teacher`/`students` denylist entries is now correctly mapped to `users` instead.
5. `RESOURCE_TYPE_ALIASES` in `ownershipResolver.ts` is unchanged and unpruned (Item 1.4) — it is no longer exercised by any live route (every route whose preceding literal segment is singular — `course`, `enrollment` — now has a semantic param name that resolves via (2) first), but it remains as a defensive normalizer inside `resolveAccess` for any resource string reaching it from elsewhere.

**Complete route → bucket table** (every route reaching `recordRequest`; `/v1/security/*` and `/v1/internal/*` are skipped entirely via `SKIP_PREFIXES` before `targetFromPath` is ever called):

| Route (registered pattern) | Param | Bucket | Resource |
|---|---|---|---|
| `GET /v1/attendance/stats/:enrollmentId` | enrollmentId | canonical | enrollments |
| `GET /v1/attendance/courses/:courseId` | courseId | canonical | courses |
| `GET /v1/analytics/students/:studentId/enrollment/:enrollmentId` | enrollmentId (last) | canonical | enrollments |
| `GET /v1/analytics/courses/:courseId`, `/courses/:courseId/simple` | courseId | canonical | courses |
| `GET /v1/analytics/teacher/:teacherId/kpi` | teacherId | canonical (was unownable) | **users** |
| `GET /v1/analytics/students/:studentId` | studentId | canonical (was unownable) | **users** |
| `GET/PATCH/DELETE /v1/courses/:id`, `PATCH /:id/status`, `POST /:id/enroll` | id | canonical (preceding literal) | courses |
| `GET /v1/enrollments/:id`, `PATCH /:id/status` | id | canonical (preceding literal) | enrollments |
| `GET/PATCH/DELETE /v1/users/:id`, `PATCH /:id/toggle-status` | id | canonical (preceding literal) | users |
| `PATCH/DELETE /v1/assessments/:id`, `GET/POST /:id/grades` | id | canonical (preceding literal) | assessments |
| `GET /v1/assessments/course/:courseId[/grades]` | courseId | canonical | courses |
| `GET /v1/assessments/enrollment/:enrollmentId/grades` | enrollmentId | canonical | enrollments |
| `PATCH /v1/notifications/:id/read` | id (BigInt) | canonical, no rule configured (preceding literal) | notifications |
| `GET/HEAD /v1/uploads/avatars/*` (@fastify/static) | none (`*`) | **unownable** (R9) | `_unownable` |
| All other `/v1/*` routes with no id-bearing param (`/me`, lists, `/login`, `/dashboard`, …) | — | no object specified | first path segment, `resourceId` undefined → `resolveAccess` returns its own distinct UNKNOWN ("no id", not a type-mapping failure) |

No route lands in UNKNOWN through a resource-TYPE mapping failure. `notifications` lands in UNKNOWN today only because no `ownership_rules` row exists for that type (a data/config gap, not an extraction gap — same as the prior round's documented R6 notifications case).

**Unit tests:** `src/tests/security/requestTarget.test.ts` — one `it` per table row above, plus the UNOWNABLE_PATTERNS case and the no-param fallback cases (16 tests total). `src/tests/security/resolveAccessUsers.test.ts` (new) — proves `resolveAccess('users', ...)` classifies a cross-owner access as FOREIGN (not UNKNOWN) and SELF/PRIVILEGED correctly, with Prisma mocked (pure unit) — this is the actual payoff of mapping `teacherId`/`studentId`→`users`.

**Integration regression:** `src/tests/integration/requestAuditRouteRegression.integration.test.ts` (new) — real HTTP, before/after status table in the report (Section A). `notifications` regression is unchanged and already covered by the pre-existing `notifications.integration.test.ts`.

**Alias regression (unchanged):** `src/tests/integration/resourceAliases.integration.test.ts` — untouched, still passing; proves `RESOURCE_TYPE_ALIASES` behavior in `resolveAccess` is unaffected by this round (Item 1, "existing alias cases unchanged").

---

## R9 — `@fastify/static` avatar route had no explicit bucket (new, found while auditing every route per Item 1.3)

**Description:** `GET/HEAD /v1/uploads/avatars/*` (registered by `@fastify/static`, confirmed pattern `prefix + '*'` from `node_modules/@fastify/static/index.js:177`) reaches `recordRequest` (starts with `/v1/`, not in `SKIP_PREFIXES`) but has no Fastify named param — the id is encoded in the filename, not a route param — so it could never be resolved by the id-param logic above. Before this round it silently fell through to the generic no-param fallback and read as `resource: 'uploads'`, a real string matching no `ownership_rules` type — UNKNOWN via heuristic failure, the same defect class as R4/R6, just never named. Not previously flagged because it was never an authorization concern (SAFE method, `hasOwnerRule` false, `shouldRaiseForeign` already returned false) — purely a telemetry gap, found only because Item 1.3 requires classifying every route that reaches `resolveAccess`.

**Fix:** Added to `UNOWNABLE_PATTERNS` by its exact registered pattern (`/v1/uploads/avatars/*`), giving it the explicit `_unownable` label instead of the arbitrary `'uploads'` string.

**Impact:** Telemetry only. Zero authorization change (GET/HEAD, public asset, no route-level access check exists or is needed).

**Tests:** `src/tests/security/requestTarget.test.ts` — the `UNOWNABLE_PATTERNS` describe block.

---

## R8 — Password-reset flow does not exist

**Description:** No password-reset endpoint is implemented anywhere in the codebase. Users who forget their password or whose credentials are compromised have no recovery path short of manual DB intervention.

**Evidence:** `grep -r "password.*reset\|reset.*password\|forgotPassword\|forgot_password" apps/api/src/routes/` returns no route definitions. The `emailService` has a `sendEmail` helper but no reset-link flow.

**Impact:** Usability and account-recovery gap. Not a security regression (no bad-path vulnerability — just a missing feature). Requires: token generation, email delivery, token validation, and password-update endpoint. Involves schema change (a `PasswordResetToken` model or a field on `User`).

**Target phase:** Auth — new feature, not a fix.

**Status:** Open — outside Final Closeout scope per spec.

---

## R10 — `GET /v1/analytics/students/:studentId` grants any TEACHER access to any student's analytics, no relationship check

**Description:** This is the same defect family as H3 (teacher cross-course exposure on `/v1/analytics/dropout-risk`, fixed in an earlier round by requiring `course_id` and verifying the requesting teacher owns that course). It was evidently not applied to this route. Found while writing the Item 1 regression table (Closeout Correction) — not introduced by this round's `targetFromPath` change, and not a telemetry gap like R4/R6/R9: this is a real, live authorization gap, confirmed genuinely unrestricted by reading the code (not inferred from the test passing).

**Evidence — route:** `apps/api/src/routes/analytics.routes.ts:213-219`
```ts
app.get('/students/:studentId', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { studentId } = request.params as { studentId: string }
    const data = await analyticsService.studentStats(studentId, request.user.sub, request.user.role)
    return reply.send({ success: true, data })
  })
```
No `app.requireRoles(...)` at all — any authenticated role reaches the handler.

**Evidence — service (the only authorization check that exists):** `apps/api/src/services/analytics.service.ts:242-250`
```ts
async studentStats(studentId: string, actorId: string, actorRole: UserRole) {
    if (actorRole === 'STUDENT' && studentId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, firstName: true, lastName: true, email: true, role: true } })
    if (!student || student.role !== 'STUDENT') {
      throw Object.assign(new Error("Talaba topilmadi"), { statusCode: 404 })
    }
```
The ONLY actor-relationship check in this function is `actorRole === 'STUDENT' && studentId !== actorId`. There is no `else if (actorRole === 'TEACHER') { ...verify studentId is enrolled in a course this teacher teaches... }` branch anywhere in the function (confirmed by reading the full function body, not just this excerpt) — `TEACHER` and `ADMIN`/`SUPER_ADMIN` fall through identically, with no further check, straight to building and returning the student's full cross-course stats (every enrollment, every course, all attendance, all grades).

**Is this genuinely unrestricted, or did a check exist that the test happened to satisfy?** Genuinely unrestricted for `TEACHER`. The regression test fixture (`teacherAId`) was never enrolled with, assigned to, or given any course relationship to `studentAId` beyond both existing in the same test run — no incidental check was "satisfied." The 200 is the direct, sole result of `TEACHER` hitting the fall-through path with zero relationship checks.

**Regression test case demonstrating the 200:** `src/tests/integration/requestAuditRouteRegression.integration.test.ts` → `describe('R6 — GET /v1/analytics/students/:studentId — before/after identical')` → `it('TEACHER viewing any student stats → 200 (unchanged — no role restriction in studentStats)')`.

**Classification:** Potential authorization gap — same family as H3 (teacher cross-course exposure), not yet fixed for this route.

**Target phase:** Authentication/Authorization Audit.

**Status:** Open — found and documented this round; explicitly NOT fixed (forbidden this round — would be a new authorization-logic change, out of the declared cleanup+commit scope).
