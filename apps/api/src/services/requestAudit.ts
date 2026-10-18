/**
 * To'liq hodisa qamrovi (ikkala qatlam uchun manba) va 1-qatlam dalilini yig'ish.
 *
 * Nega kerak: audit log hozirgacha faqat qo'lda, tanlab yozilardi. Rad etilgan
 * urinishlar (401/403) esa umuman yozilmasdi — ya'ni foydalanuvchi boshqa
 * odamning obyektini ketma-ket so'rab ko'rsa, tizimda hech qanday iz qolmasdi.
 *
 * Bu modul ham ogohlantirish yaratmaydi: dalilni signal oynasiga yozadi va
 * qarorni `correlationDetector` ga topshiradi.
 */
import type { FastifyRequest, FastifyReply } from 'fastify'
import { logger } from '../config/logger'
import { auditService } from './audit.service'
import { resolveAccess, type OwnershipVerdict } from './ownershipResolver'
import { inspect as inspectBehavior } from './behaviorDetector'
import { recordAuthz, recordPrivilegedScope } from './signalWindow'
import { evaluate as correlationEvaluate } from './correlationDetector'

// Qayd etilmaydigan yo'llar — shovqinni kamaytirish uchun.
// /v1/security — aniqlash tizimining o'z sahifalari: ularni qayd etsak,
// audit jurnalini ochishning o'zi yangi yozuvlar yaratib, o'zini oziqlantiradi.
const SKIP_PREFIXES = ['/health', '/v1/internal', '/v1/security']

// Obyekt holatini o'zgartirmaydigan metodlar
const SAFE_METHODS = new Set(['GET', 'HEAD'])

/**
 * Parametr nomi → kanonik resurs turi.
 *
 * R4/R6 FIX: ilgari resurs turi "UUID'dan oldingi segment" degan heuristika
 * bilan HAQIQIY so'rov yo'lidan o'qilardi — yangi tavsiflovchi segment
 * (`stats`, `teacher`, `students`...) qo'shilgan har bir marshrut shu
 * heuristikani qayta buzardi. Endi manba — Fastify'ning RO'YXATDAN
 * O'TGAN marshrut shabloni (`request.routeOptions.url`, Fastify 5),
 * HAQIQIY so'rov yo'li EMAS. Jadval quyidagi haqiqiy marshrut fayllaridan
 * qo'lda tuzilgan (har biri parametr nomi bilan birga):
 *
 *   attendance.routes.ts   — GET /stats/:enrollmentId
 *   assessment.routes.ts   — GET /course/:courseId[/grades], GET /enrollment/:enrollmentId/grades
 *   analytics.routes.ts    — GET /students/:studentId/enrollment/:enrollmentId,
 *                             GET /courses/:courseId[/simple], GET /teacher/:teacherId/kpi,
 *                             GET /students/:studentId
 *   course.routes.ts       — GET/PATCH/DELETE /:id, PATCH /:id/status, POST /:id/enroll (param name "id")
 *   enrollment.routes.ts   — GET /:id, PATCH /:id/status (param name "id")
 *   user.routes.ts         — GET/PATCH/DELETE /:id, PATCH /:id/toggle-status (param name "id")
 *   assessment.routes.ts   — PATCH/DELETE /:id, GET/POST /:id/grades (param name "id")
 *   notification.routes.ts — PATCH /:id/read (param name "id", BigInt — not UUID)
 *
 * Only `teacherId`/`studentId`/`userId`/`enrollmentId`/`courseId` are
 * semantic enough to map on PARAM NAME alone. The generic `:id` routes
 * above are resolved instead from the LITERAL segment that precedes the
 * param IN THE PATTERN (see `findIdParam`) — e.g. `/v1/courses/:id` →
 * preceding segment 'courses', already the MODEL_BY_RESOURCE key. For the
 * two routes with a singular literal predecessor (`/course/:courseId`,
 * `/enrollment/:enrollmentId/grades`), the PARAM NAME table below wins
 * first, so RESOURCE_TYPE_ALIASES in ownershipResolver.ts is no longer
 * exercised by any live route — it is kept as a defensive normalizer for
 * any future/other caller of `resolveAccess`, per Item 1.4 (not pruned).
 */
const PARAM_NAME_TO_RESOURCE: Record<string, string> = {
  enrollmentId: 'enrollments',
  courseId:     'courses',
  // teacherId/studentId/userId all denote the `users` resource — a teacher
  // or student id IS a user id. Previously (incorrectly) denylisted as
  // "unownable" (UNOWNABLE_SEGMENTS), which made cross-teacher/cross-student
  // access on these routes permanently invisible to the correlation layer.
  teacherId: 'users',
  studentId: 'users',
  userId:    'users',
}

/**
 * Registered-route patterns that reach the detection hook but have NO
 * ownable object at all — matched against `request.routeOptions.url`
 * (the Fastify-registered pattern), never against the live path. Each
 * entry must be justified in FINDINGS.md (R4/R6 resolution notes).
 *
 *  - `/v1/uploads/avatars/*` — @fastify/static serving publicly-readable
 *    avatar files (confirmed via @fastify/static source: it registers
 *    `path: prefix + '*'`, i.e. exactly this pattern). No Fastify named
 *    param exists here (the id is encoded in the filename, not a route
 *    param), so it can never be resolved via `findIdParam` below; without
 *    this explicit entry it would silently fall through to the generic
 *    no-param branch and read as `resource: 'uploads'` — a real string
 *    that matches no ownership-rule type, i.e. UNKNOWN by heuristic
 *    failure, exactly the defect class R4/R6 exist to close.
 */
const UNOWNABLE_PATTERNS = new Set<string>([
  '/v1/uploads/avatars/*',
])

/** Marshrutga egalik qoidasi bo'lmagan, lekin aniqlash qatlamiga yetib
 *  keladigan resurslar uchun aniq belgi (UNKNOWN heuristika muvaffaqiyatsizligi
 *  emas — bu ataylab egasiz ob'ekt). */
export const UNOWNABLE_RESOURCE = '_unownable'

export const DETECTOR_VERSION = 'authz-1.1.0'

/**
 * Ro'yxatdan o'tgan marshrut SHABLONIDAN (haqiqiy yo'ldan emas) oxirgi
 * `:param` segmentini va undan oldingi LITERAL segmentni topadi.
 *
 * Shablon ichida qidirish — haqiqiy so'rov yo'lida emas — shuning uchun ID
 * shakli (UUID yoki BigInt) ahamiyatsiz: parametr nomi ro'yxatdan o'tishda
 * qat'iy belgilangan, hech qachon "o'xshamay qoladi".
 */
function findIdParam(
  routePattern: string | undefined,
): { paramName: string; precedingSegment: string | null } | null {
  if (!routePattern) return null
  const segments = routePattern.split('/').filter(Boolean)
  for (let k = segments.length - 1; k >= 0; k--) {
    if (segments[k].startsWith(':')) {
      const paramName  = segments[k].slice(1)
      const prevRaw    = k > 0 ? segments[k - 1] : null
      const precedingSegment = prevRaw && !prevRaw.startsWith(':') ? prevRaw : null
      return { paramName, precedingSegment }
    }
  }
  return null
}

/**
 * Yo'ldan murojaat qilingan obyektni ajratadi.
 *
 * `routePattern` — `request.routeOptions.url` (Fastify 5): ro'yxatdan
 * o'tgan marshrut shabloni, masalan `/v1/attendance/stats/:enrollmentId`.
 * Bu HAQIQIY so'rov yo'li emas (undan hech qachon ID shakli — UUID yoki
 * BigInt — o'qilmaydi), shuning uchun heuristika yangi tavsiflovchi
 * segmentlarga sezilmas (R4/R6 ildiz sababi).
 *
 * Shablonda `:param` bo'lmasa (ro'yxat/`me`/statik/login kabi marshrutlar,
 * yoki haqiqiy 404 — `routePattern` shunda `undefined`), bu yerda
 * ko'rsatiladigan OBYEKT umuman yo'q: `pathname`dan birinchi real segment
 * olinadi, `resourceId` esa aniqlanmay qoladi. `resolveAccess` buni
 * (resurs turi noto'g'ri emas, shunchaki OBYEKT ID berilmagan) alohida,
 * o'ziga xos UNKNOWN sifatida qaytaradi — bu R4/R6'ning "resurs TURI xato
 * aniqlanishi" muammosidan butunlay boshqa, kutilgan holat.
 */
export function targetFromPath(
  pathname: string,
  routePattern: string | undefined,
  params: Record<string, string> = {},
): { resource: string; resourceId?: string } {
  if (routePattern && UNOWNABLE_PATTERNS.has(routePattern)) {
    return { resource: UNOWNABLE_RESOURCE }
  }

  const idParam = findIdParam(routePattern)
  if (idParam) {
    const resourceId = params[idParam.paramName]
    const resource = PARAM_NAME_TO_RESOURCE[idParam.paramName] ?? idParam.precedingSegment
    if (resource) return { resource, resourceId }
  }

  const parts = pathname.split('/').filter(Boolean)
  const i = parts.indexOf('v1')
  const segments = i >= 0 ? parts.slice(i + 1) : parts
  return { resource: segments[0] ?? 'unknown' }
}

/**
 * Eng muhim signal: so'rov MUVAFFAQIYATLI bo'ldi, lekin obyekt begona.
 * Ya'ni egalik tekshiruvi bu endpointda yo'q — real IDOR zaifligi.
 *
 * Istisno: OWNER qoidasi yo'q resurs (kurs katalogi, topshiriqlar) — umumiy
 * ma'lumot, uni O'QISH ataylab hamma uchun ochiq, shuning uchun u yerda
 * FOREIGN normal holat. Aks holda har bir talaba har bir kursni ochganda
 * CRITICAL ogohlantirish yaratilib, jurnal yolg'on signalga to'lardi.
 * O'sha resursni begona aktor O'ZGARTIRSA — bu baribir zaiflik.
 */
export function shouldRaiseForeign(
  verdict: Pick<OwnershipVerdict, 'relation' | 'hasOwnerRule'>,
  method: string,
  denied: boolean,
): boolean {
  if (denied || verdict.relation !== 'FOREIGN') return false
  if (!verdict.hasOwnerRule && SAFE_METHODS.has(method)) return false
  return true
}

/**
 * onResponse hook. Javob yuborilgandan keyin ishlaydi, shuning uchun
 * foydalanuvchi ko'radigan kechikishga ta'sir qilmaydi.
 */
export async function recordRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const pathname = (request.url ?? '').split('?')[0]
    if (request.method === 'OPTIONS') return
    if (!pathname.startsWith('/v1/')) return
    if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return

    const status = reply.statusCode
    const denied = status === 401 || status === 403
    const userId = request.user?.sub ?? null
    const { resource, resourceId } = targetFromPath(
      pathname,
      request.routeOptions.url,
      (request.params as Record<string, string> | null) ?? {},
    )

    // 1-QATLAM: aktor va obyekt o'rtasidagi munosabatni aniqlash
    const verdict = await resolveAccess(resource, resourceId, userId, request.user?.role ?? null)

    await auditService.log({
      userId,
      action:     denied ? ('ACCESS_DENIED' as any) : ('ACCESS' as any),
      resource,
      resourceId,
      resourceOwnerId: verdict.ownerId,
      accessRelation:  verdict.relation,
      ipAddress:  request.ip,
      userAgent:  request.headers['user-agent'],
      httpMethod: request.method,
      path:       pathname,
      statusCode: status,
      durationMs: Math.round(reply.elapsedTime ?? 0),
    })

    if (!userId) return

    // 2-QATLAM: xatti-harakatni foydalanuvchining o'z profiliga solishtirish.
    // Dalilni signal oynasiga yozadi, ogohlantirish yaratmaydi.
    await inspectBehavior(userId, request.ip, request.headers['user-agent'], resource)

    // 1-QATLAM dalili — IMTIYOZLI aktor uchun qamrov.
    // Admin uchun begona obyekt yo'q, shuning uchun hodisa emas, o'n besh
    // daqiqalik oynada nechta HAR XIL egaga teganini o'lchaymiz. O'zining
    // obyekti hisobga olinmaydi.
    if (verdict.relation === 'PRIVILEGED' && verdict.ownerId && verdict.ownerId !== userId) {
      await recordPrivilegedScope(userId, verdict.ownerId)
    }

    // 1-QATLAM dalili — begona obyektga urinish rad etilgan yoki o'tib ketgan
    if (denied && verdict.relation === 'FOREIGN') {
      await recordAuthz(userId, 'DENIED')
      logger.info({ msg: 'Begona obyektga urinish rad etildi', userId, pathname })
    } else if (shouldRaiseForeign(verdict, request.method, denied)) {
      await recordAuthz(userId, 'ALLOWED')
      logger.error({
        msg: 'Ruxsatsiz obyektga MUVAFFAQIYATLI murojaat — endpointda egalik tekshiruvi yo\'q',
        userId, pathname, resource, ownerId: verdict.ownerId,
      })
    }

    // QAROR: ikkala qatlamning oynadagi dalili birgalikda baholanadi
    await correlationEvaluate(userId, request.ip)
  } catch (err) {
    // Monitoring hech qachon so'rovni buzmasligi kerak
    logger.warn({ msg: 'recordRequest xatosi', err: (err as Error).message })
  }
}
