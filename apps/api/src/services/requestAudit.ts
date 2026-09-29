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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Qayd etilmaydigan yo'llar — shovqinni kamaytirish uchun.
// /v1/security — aniqlash tizimining o'z sahifalari: ularni qayd etsak,
// audit jurnalini ochishning o'zi yangi yozuvlar yaratib, o'zini oziqlantiradi.
const SKIP_PREFIXES = ['/health', '/v1/internal', '/v1/security']

// Obyekt holatini o'zgartirmaydigan metodlar
const SAFE_METHODS = new Set(['GET', 'HEAD'])

export const DETECTOR_VERSION = 'authz-1.0.0'

/**
 * Yo'ldan murojaat qilingan obyektni ajratadi.
 *
 * Muhimi: resurs turi va identifikator BIR juftlikdan olinishi kerak. Ilgari
 * tur birinchi segmentdan, ID esa oxirgi UUID'dan olinardi — ichma-ich yo'lda
 * (`/v1/courses/<cid>/enrollments/<eid>`) bu `course.findUnique(eid)` degan
 * mos kelmaydigan so'rovni berardi va natija jimgina UNKNOWN bo'lardi.
 *
 * Endi oxirgi `<to'plam>/<uuid>` juftligi olinadi — u aynan so'rov tegishli
 * bo'lgan obyekt:
 *   /v1/courses/<cid>/enrollments/<eid> -> enrollments, <eid>
 *   /v1/courses/<cid>/enrollments       -> courses,     <cid>
 *   /v1/courses                         -> courses,     undefined
 */
export function targetFromPath(pathname: string): { resource: string; resourceId?: string } {
  const parts = pathname.split('/').filter(Boolean)
  const i = parts.indexOf('v1')
  const segments = i >= 0 ? parts.slice(i + 1) : parts

  for (let k = segments.length - 1; k >= 1; k--) {
    if (UUID_RE.test(segments[k])) {
      return { resource: segments[k - 1], resourceId: segments[k] }
    }
  }
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
    const { resource, resourceId } = targetFromPath(pathname)

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
