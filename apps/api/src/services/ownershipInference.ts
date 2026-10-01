/**
 * Egalik munosabatlarini trafikdan avtomatik chiqarish — Bosqich B.
 *
 * Bosqich A (`ownershipResolver.ts`) qo'lda yozilgan qoidalarga tayanadi:
 * kimdir "grades uchun enrollment.studentId = OWNER" deb bilib, uni
 * `ownership_rules` jadvaliga qo'lda kiritadi. Bu ishlaydi, lekin yangilik
 * emas — xuddi shunday qoidani har qanday tizim uchun qo'lda yozish mumkin.
 *
 * Bu modul boshqacha savolga javob beradi: qoidani ODAM YOZMASDAN, faqat
 * (a) Prisma sxemasining o'zidan (qaysi yo'llar umuman mumkin) va (b) audit
 * jurnalidagi haqiqiy trafikdan (qaysi yo'l qaysi rol uchun statistik
 * jihatdan "egalik"ni ishonchli bashorat qiladi) chiqarib bo'ladimi?
 *
 * Ikki bosqich:
 *   1. discoverCandidatePaths — DMMF orqali modeldan foydalanuvchiga
 *      olib boradigan BARCHA to-one yo'llarni topadi. Resurs turiga xos
 *      hech narsa yozilmagan — faqat sxema grafigi bo'ylab yurish.
 *   2. scoreResourceType — har bir nomzod yo'l uchun audit jurnalidan
 *      ishonch (necha foizda yo'l aktyorning o'ziga to'g'ri keladi) va
 *      tayanch (necha marta kuzatilgan) hisoblaydi.
 *
 * Natija hech qachon avtomatik faollashtirilmaydi (`active=false` bilan
 * yoziladi) — trafikdan o'rganilgan qoidani production avtorizatsiyasiga
 * so'zsiz qo'llash xavfsizlik nuqtai nazaridan noto'g'ri bo'lardi. Qoida
 * taklif qilinadi, inson tasdiqlaydi.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { logger } from '../config/logger'
import {
  buildInclude, mergeIncludes, aggregateCandidateScores,
  type CandidateScore, type RoleScore,
} from './ownershipPaths'

export type { CandidateScore, RoleScore }

/** Resurs turi (URL segmenti) -> Prisma model nomi. ownershipResolver.ts bilan bir xil. */
export const MODEL_BY_RESOURCE: Record<string, string> = {
  courses:     'Course',
  enrollments: 'Enrollment',
  assessments: 'Assessment',
  attendance:  'Attendance',
  grades:      'Grade',
}

/** `enrollment.course.teacherId` kabi uch segmentgacha — mavjud qo'lda qoidalarning eng chuquri misoli shu. */
const MAX_SEGMENTS = 3
/** Rol bo'yicha ishonchni hisobga olish uchun shu rolda kamida shuncha hodisa kerak */
const MIN_ROLE_SUPPORT = 10
const OWNER_CONFIDENCE_THRESHOLD = 0.8
const CUSTODIAN_CONFIDENCE_THRESHOLD = 0.6

export interface CandidatePath {
  /** "studentId", "course.teacherId" — nuqtali yo'l, resurs jadvalining o'zidan boshlanadi */
  path: string
  segments: number
}

/**
 * Modeldan foydalanuvchiga (User) olib boradigan barcha to-one yo'llarni
 * topadi — faqat FK ushlab turuvchi tomon bo'ylab (has-many tomonga
 * yurilmaydi, chunki u bitta skalyar qiymatga tushmaydi).
 *
 * Hech qanday resurs turiga xos bilim yo'q — faqat `Prisma.dmmf` orqali
 * sxemaning o'zidan o'qiladi. Shu sababli "oldindan spetsifikatsiyasiz".
 */
export function discoverCandidatePaths(modelName: string, maxSegments = MAX_SEGMENTS): CandidatePath[] {
  const models = Prisma.dmmf.datamodel.models
  const byName = new Map(models.map((m) => [m.name, m]))
  const out: CandidatePath[] = []
  const seen = new Set<string>()

  function walk(currentModel: string, prefix: string[], visited: Set<string>) {
    if (prefix.length >= maxSegments) return
    const model = byName.get(currentModel)
    if (!model) return

    for (const f of model.fields) {
      if (f.kind !== 'object' || f.isList) continue
      // Faqat shu model FK ni o'zida ushlab turgan tomon — aks holda bitta
      // qiymatga emas, ro'yxatga tushamiz (masalan User.enrollments).
      if (!f.relationFromFields || f.relationFromFields.length !== 1) continue
      const fk = f.relationFromFields[0]

      if (f.type === 'User') {
        const path = [...prefix, fk].join('.')
        if (!seen.has(path)) { seen.add(path); out.push({ path, segments: prefix.length + 1 }) }
        continue
      }
      if (visited.has(f.type)) continue // tsiklik bog'lanishdan saqlanish
      walk(f.type, [...prefix, f.name], new Set([...visited, f.type]))
    }
  }

  walk(modelName, [], new Set([modelName]))
  return out
}

/**
 * `CandidateScore.byRole`/`bestRole` haqida muhim izoh:
 *
 * Umumiy (barcha rollar aralash) ishonch chalg'itadi. Masalan
 * "courses -> teacherId" CUSTODIAN qoidasi uchun ishonch faqat TEACHER
 * rolidagi aktyorlar orasida ma'noli — STUDENT rolidagi aktyorlar o'z
 * kursini ochganda ularning ID'si hech qachon teacherId bilan mos
 * kelmaydi, bu esa qoidani noto'g'ri emas, shunchaki BOSHQA rol uchun
 * ekanini bildiradi. Shu sabab bilan taklif/tasdiqlash ENG YAXSHI rol
 * bo'yicha ishonchga (`bestRole`) asoslanadi, umumiy ishonchga emas.
 */
export interface InferenceResult {
  resourceType: string
  modelName: string
  candidates: CandidateScore[]
  /** Mavjud qoidalar (MANUAL yoki INFERRED) — taqqoslash uchun */
  existingRules: { ownerPath: string; role: string; source: string; active: boolean }[]
  /** Chegaradan o'tgan, lekin hali bazaga YOZILMAGAN takliflar */
  proposals: { ownerPath: string; role: 'OWNER' | 'CUSTODIAN'; actorRole: string; confidence: number; supportCount: number }[]
}

/**
 * Bitta resurs turi uchun: nomzod yo'llarni topadi, audit jurnalidan
 * ularning ishonchini o'lchaydi, mavjud qoidalar bilan solishtiradi.
 *
 * Samaradorlik: har bir nomzod uchun alohida so'rov EMAS — barcha
 * yo'llarning include daraxti birlashtiriladi (`mergeIncludes`), har bir
 * noyob resourceId uchun BITTA so'rov bilan qator olinadi, keyin xotirada
 * barcha nomzodlar bo'yicha hisoblanadi.
 */
export async function scoreResourceType(resourceType: string): Promise<InferenceResult | null> {
  const modelName = MODEL_BY_RESOURCE[resourceType]
  if (!modelName) return null

  const candidates = discoverCandidatePaths(modelName)
  if (candidates.length === 0) return null

  const events = await prisma.auditLog.findMany({
    where: { resource: resourceType, resourceId: { not: null }, action: 'ACCESS' },
    select: { resourceId: true, userId: true, user: { select: { role: true } } },
  })

  const existingRules = await (prisma as any).ownershipRule.findMany({
    where: { resourceType },
    select: { ownerPath: true, role: true, source: true, active: true },
  })

  if (events.length === 0) {
    return {
      resourceType, modelName,
      candidates: candidates.map((c) => ({ ...c, matches: 0, total: 0, confidence: 0, byRole: [], bestRole: null })),
      existingRules, proposals: [],
    }
  }

  const distinctIds = [...new Set(events.map((e) => e.resourceId!))]
  const include = mergeIncludes(candidates.map((c) => buildInclude(c.path)))
  const model = (prisma as any)[modelName.charAt(0).toLowerCase() + modelName.slice(1)]

  const rows = await model.findMany({
    where: { id: { in: distinctIds } },
    ...(include ? { include } : {}),
  })
  const rowById = new Map<string, any>(rows.map((r: any) => [r.id, r]))

  const scoreEvents = events
    .filter((e) => e.resourceId)
    .map((e) => ({ resourceId: e.resourceId!, userId: e.userId, role: e.user?.role ?? null }))

  const candidateScores = aggregateCandidateScores(candidates, scoreEvents, rowById, MIN_ROLE_SUPPORT)

  // Taklif/tasdiqlash ENG YAXSHI rol bo'yicha ishonchga asoslanadi (pastga
  // qarang: CandidateScore.byRole izohi) — umumiy, rollar aralashgan
  // ishonch emas. Masalan "courses -> teacherId" barcha aktyorlar bo'yicha
  // 0.10 bo'lishi mumkin (chunki ko'pchilik so'rov talabalardan), lekin
  // aynan TEACHER rolidagi aktyorlar orasida 1.00 bo'ladi — shu ikkinchisi
  // qoidani asoslaydi.
  const existingPaths = new Set(existingRules.map((r: any) => r.ownerPath))
  const proposals: InferenceResult['proposals'] = []
  for (const c of candidateScores) {
    if (!c.bestRole) continue
    if (existingPaths.has(c.path)) continue // allaqachon qoidada bor — taklif emas, tasdiqlash
    if (c.segments === 1 && c.bestRole.confidence >= OWNER_CONFIDENCE_THRESHOLD) {
      proposals.push({ ownerPath: c.path, role: 'OWNER', actorRole: c.bestRole.role, confidence: c.bestRole.confidence, supportCount: c.bestRole.total })
    } else if (c.segments >= 2 && c.bestRole.confidence >= CUSTODIAN_CONFIDENCE_THRESHOLD) {
      proposals.push({ ownerPath: c.path, role: 'CUSTODIAN', actorRole: c.bestRole.role, confidence: c.bestRole.confidence, supportCount: c.bestRole.total })
    }
  }

  return { resourceType, modelName, candidates: candidateScores, existingRules, proposals }
}

export async function scoreAllResourceTypes(): Promise<InferenceResult[]> {
  const out: InferenceResult[] = []
  for (const resourceType of Object.keys(MODEL_BY_RESOURCE)) {
    const r = await scoreResourceType(resourceType)
    if (r) out.push(r)
  }
  return out
}

/**
 * Taklifni bazaga yozadi — HAR DOIM `active=false`, `source='INFERRED'`
 * bilan. Mavjud qoida (MANUAL yoki INFERRED) ustidan yozilmaydi — faqat
 * unique (resourceType, ownerPath) kaliti band bo'lmaganda qo'shiladi.
 */
export async function writeProposal(
  resourceType: string,
  ownerPath: string,
  role: 'OWNER' | 'CUSTODIAN',
  confidence: number,
  supportCount: number,
): Promise<boolean> {
  try {
    await (prisma as any).ownershipRule.create({
      data: {
        resourceType, ownerPath, role,
        source: 'INFERRED', active: false,
        confidence, supportCount,
      },
    })
    return true
  } catch (err) {
    logger.warn({ msg: 'Taklifni yozishda xato (ehtimol allaqachon mavjud)', resourceType, ownerPath, err: (err as Error).message })
    return false
  }
}
