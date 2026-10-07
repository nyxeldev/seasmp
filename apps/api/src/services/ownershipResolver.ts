/**
 * Egalik hal qiluvchisi — 1-qatlamning yadrosi.
 *
 * Tizimda egalik mantiqi mavjud edi, lekin u servis kodi ichida ~22 ta alohida
 * `if` ko'rinishida tarqoq yozilgan. Bu modul o'sha bilimni `ownership_rules`
 * jadvalidagi deklarativ modelga ko'chiradi va uni umumiy tarzda hisoblaydi.
 *
 * Qoida: resurs turi + nuqtali yo'l (masalan `enrollment.course.teacherId`) +
 * rol (OWNER yoki CUSTODIAN). Yo'l Prisma `include` daraxtiga aylantiriladi.
 *
 * MANUAL qoidalar qo'lda kiritiladi (Bosqich A). INFERRED qoidalar keyinchalik
 * trafikdan avtomatik chiqariladi (Bosqich B) — ishning ilmiy yangiligi shunda.
 */
import { prisma } from '../config/prisma'
import { logger } from '../config/logger'
import { buildInclude, mergeIncludes, readPath } from './ownershipPaths'

export { buildInclude, mergeIncludes, readPath }

export type AccessRelation = 'SELF' | 'OWNER' | 'CUSTODIAN' | 'PRIVILEGED' | 'FOREIGN' | 'UNKNOWN'

export interface OwnershipVerdict {
  relation: AccessRelation
  /** Asosiy egasi (OWNER qoidasi bo'yicha) — audit logga yoziladi */
  ownerId: string | null
  /** Qaysi qoida ishladi — tahlil va nosozlikni topish uchun */
  matchedPath?: string
  /**
   * Bu resurs turida OWNER qoidasi bormi.
   *
   * Faqat CUSTODIAN qoidasi bo'lgan turlar (kurslar, topshiriqlar) — umumiy
   * katalog: ularni o'qish hamma uchun ochiq, egasi yo'q. Shunday turda
   * FOREIGN o'qish zaiflik emas. OWNER qoidasi bor turlarda esa (baholar,
   * davomat, ro'yxatdan o'tish) FOREIGN o'qish — haqiqiy IDOR belgisi.
   */
  hasOwnerRule: boolean
}

/** Resurs turi (URL segmenti) -> Prisma model nomi */
const MODEL_BY_RESOURCE: Record<string, string> = {
  users:       'user',
  courses:     'course',
  enrollments: 'enrollment',
  assessments: 'assessment',
  attendance:  'attendance',
  grades:      'grade',
}

const PRIVILEGED_ROLES = ['ADMIN', 'SUPER_ADMIN']

/**
 * M5: ba'zi ichma-ich/ikkinchi darajali yo'llar (masalan
 * `/v1/analytics/students/:id/enrollment/:id`, `/v1/assessments/course/:id`)
 * resurs so'zini BIRLIKDA yozadi, holbuki `ownership_rules.resource_type`
 * va `MODEL_BY_RESOURCE` kaliti har doim asosiy marshrut prefiksiga mos —
 * KO'PLIKDA (`enrollments`, `courses`). `targetFromPath` (requestAudit.ts)
 * UUID'dan oldingi so'zni o'zgartirmasdan qaytaradi (bu to'g'ri — u sof
 * URL ajratuvchi), shuning uchun normallashtirish shu yerda, iste'molchida
 * bajariladi.
 *
 * Faqat HAQIQATAN mavjud bo'lgan, qoidasi bor kelishmovchiliklar ro'yxatga
 * olingan — keng ko'lamli "har doim -s qo'sh" generatsiyasi emas (masalan
 * `attendance`'ning ko'pligi yo'q, `teacher`/`students` uchun umuman
 * egalik qoidasi mavjud emas — ularni bu yerga qo'shish soxta signal
 * yaratardi).
 */
const RESOURCE_TYPE_ALIASES: Record<string, string> = {
  enrollment: 'enrollments',
  course:     'courses',
}

function normalizeResourceType(resourceType: string): string {
  return RESOURCE_TYPE_ALIASES[resourceType] ?? resourceType
}

interface Rule {
  resourceType: string
  ownerPath:    string
  role:         'OWNER' | 'CUSTODIAN'
}

// ── Qoidalar keshi ──────────────────────────────────────────────────────────
let cache: Map<string, Rule[]> | null = null
let cacheAt = 0
const CACHE_TTL = 60_000

export async function loadRules(force = false): Promise<Map<string, Rule[]>> {
  if (!force && cache && Date.now() - cacheAt < CACHE_TTL) return cache
  const map = new Map<string, Rule[]>()
  try {
    const rows = await (prisma as any).ownershipRule.findMany({ where: { active: true } })
    for (const r of rows) {
      const list = map.get(r.resourceType) ?? []
      list.push({ resourceType: r.resourceType, ownerPath: r.ownerPath, role: r.role })
      map.set(r.resourceType, list)
    }
  } catch (err) {
    logger.warn({ msg: 'Egalik qoidalarini yuklashda xato', err: (err as Error).message })
  }
  cache = map
  cacheAt = Date.now()
  return map
}

function unknown(): OwnershipVerdict {
  return { relation: 'UNKNOWN', ownerId: null, hasOwnerRule: false }
}

/** Imtiyozli aktor, lekin resurs turi uchun qoida yo'q yoki obyekt ko'rsatilmagan */
function privilegedUnknown(): OwnershipVerdict {
  return { relation: 'PRIVILEGED', ownerId: null, hasOwnerRule: false }
}

/**
 * Aktor va resurs o'rtasidagi munosabatni aniqlaydi.
 * FOREIGN — ruxsatsiz obyektga murojaat belgisi.
 * UNKNOWN — bu resurs turi uchun qoida yo'q, ya'ni qamrov bo'shlig'i.
 */
export async function resolveAccess(
  resourceType: string,
  resourceId: string | null | undefined,
  actorId: string | null,
  actorRole: string | null,
): Promise<OwnershipVerdict> {
  if (!actorId) return unknown()
  resourceType = normalizeResourceType(resourceType)

  // Ilgari bu yerda imtiyozli rol uchun darhol qaytish bor edi: egalik umuman
  // hisoblanmasdi va ownerId null bo'lib qolardi. Ikkita oqibati bor edi.
  //
  // Birinchisi audit: admin KIMNING obyektiga tegganini jurnal saqlamasdi,
  // ya'ni `resource_owner_id` adminlar uchun doim bo'sh edi — tekshiruvda eng
  // kerakli ustun aynan o'sha.
  //
  // Ikkinchisi aniqlash: 1-qatlam adminlar uchun HECH QANDAY signal
  // bermasdi, shuning uchun korrelyatsiya ham ishlamasdi — admin uchun
  // hukm faqat 2-qatlamdan chiqishi mumkin edi. Ichki tahdid haqidagi
  // da'vo esa aynan imtiyozli rollar haqida.
  //
  // Endi egalik hamma uchun hisoblanadi. Imtiyozli aktor uchun natija
  // baribir PRIVILEGED (u haqiqatan ham haqli), lekin ownerId bilan —
  // qamrovni requestAudit o'shandan o'lchaydi.
  const privileged = !!actorRole && PRIVILEGED_ROLES.includes(actorRole)

  const rules = (await loadRules()).get(resourceType)
  if (!rules || rules.length === 0) return privileged ? privilegedUnknown() : unknown()
  if (!resourceId) return privileged ? privilegedUnknown() : unknown()

  const hasOwnerRule = rules.some((r) => r.role === 'OWNER')

  if (resourceType === 'users') {
    if (resourceId === actorId) {
      return { relation: 'SELF', ownerId: actorId, matchedPath: 'id', hasOwnerRule }
    }
    // `users` da obyektning o'zi ega — bazaga borish shart emas
    return { relation: privileged ? 'PRIVILEGED' : 'FOREIGN', ownerId: resourceId, hasOwnerRule }
  }

  const modelName = MODEL_BY_RESOURCE[resourceType]
  if (!modelName) return unknown()

  let row: any
  try {
    const include = mergeIncludes(rules.map((r) => buildInclude(r.ownerPath)))
    row = await (prisma as any)[modelName].findUnique({
      where: { id: resourceId },
      ...(include ? { include } : {}),
    })
  } catch (err) {
    logger.warn({ msg: 'Egalikni aniqlashda xato', resourceType, err: (err as Error).message })
    return unknown()
  }
  if (!row) return unknown()

  const ownerRule = rules.find((r) => r.role === 'OWNER')
  const ownerId = ownerRule ? readPath(row, ownerRule.ownerPath) : null

  for (const r of rules) {
    if (readPath(row, r.ownerPath) === actorId) {
      return { relation: r.role, ownerId, matchedPath: r.ownerPath, hasOwnerRule }
    }
  }
  return { relation: privileged ? 'PRIVILEGED' : 'FOREIGN', ownerId, hasOwnerRule }
}
