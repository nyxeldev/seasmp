/**
 * Xatti-harakat profillarini audit loglardan quradi va saqlaydi.
 *
 * Profil har bir foydalanuvchining o'z me'yori: qaysi soatlarda ishlaydi,
 * qaysi IP va qurilmalardan kiradi, qaysi resurslarga murojaat qiladi,
 * soatiga nechta so'rov yuboradi.
 */
import { prisma } from '../config/prisma'
import { logger } from '../config/logger'
import { emptyProfile, MIN_SAMPLES, type BehaviorProfile } from './behaviorScoring'

/** Profil soatlari shu mintaqada hisoblanadi */
export const PROFILE_TIMEZONE = 'Asia/Tashkent'

/** Profil quriladigan oyna */
export const WINDOW_DAYS = 30

/**
 * IP yoki qurilma "ma'lum" hisoblanishi uchun minimal uchrash soni.
 * Bitta so'rov profilga kirib qolmasligi kerak — aks holda hujumchining IP si
 * o'z-o'zidan normal deb o'rganiladi.
 */
export const MIN_OCCURRENCES = 3

interface Row { kind: string; key: string | null; n: number }

/**
 * Bitta so'rovda barcha agregatlar. Natija (kind, key, n) uchligi ko'rinishida
 * qaytadi va JS tomonida profilga yig'iladi.
 *
 * Muhim: rad etilgan va begona murojaatlar profilga KIRMAYDI — tizim shubhali
 * xatti-harakatni "normal" deb o'rganmasligi kerak.
 */
async function aggregate(userId: string, windowDays: number): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`
    WITH ev AS (
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE ${PROFILE_TIMEZONE})::int AS hh,
             EXTRACT(DOW  FROM created_at AT TIME ZONE ${PROFILE_TIMEZONE})::int AS dw,
             ip_address, user_agent, resource,
             date_trunc('hour', created_at) AS hr
      FROM audit_logs
      WHERE user_id = ${userId}::uuid
        AND created_at > now() - (${windowDays} || ' days')::interval
        AND (status_code IS NULL OR status_code < 400)
        AND (access_relation IS NULL OR access_relation <> 'FOREIGN')
    )
    SELECT 'hour' AS kind, hh::text AS key, count(*)::int AS n FROM ev GROUP BY hh
    UNION ALL SELECT 'dow', dw::text,                 count(*)::int FROM ev GROUP BY dw
    UNION ALL SELECT 'ip',  ip_address,               count(*)::int FROM ev GROUP BY ip_address
    UNION ALL SELECT 'ua',  user_agent,               count(*)::int FROM ev GROUP BY user_agent
    UNION ALL SELECT 'res', resource,                 count(*)::int FROM ev GROUP BY resource
    UNION ALL SELECT 'rate', to_char(hr,'YYYYMMDDHH24'), count(*)::int FROM ev GROUP BY hr
  `
}

/** (kind, key, n) qatorlaridan profil yig'adi */
export function rowsToProfile(rows: Row[]): BehaviorProfile {
  const p = emptyProfile()
  const rates: number[] = []

  for (const r of rows) {
    const n = Number(r.n)
    switch (r.kind) {
      case 'hour': { const i = Number(r.key); if (i >= 0 && i < 24) p.hourHistogram[i] = n; break }
      case 'dow':  { const i = Number(r.key); if (i >= 0 && i < 7)  p.weekdayHistogram[i] = n; break }
      case 'ip':   if (r.key && n >= MIN_OCCURRENCES) p.knownIps.push(r.key); break
      case 'ua':   if (r.key && n >= MIN_OCCURRENCES) p.knownUserAgents.push(r.key); break
      case 'res':  if (r.key) p.resourceMix[r.key] = n; break
      case 'rate': rates.push(n); break
    }
  }

  p.sampleCount = p.hourHistogram.reduce((a, b) => a + b, 0)

  if (rates.length > 0) {
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length
    const varc = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length
    p.reqPerHourMean = mean
    p.reqPerHourStd = Math.sqrt(varc)
  }
  return p
}

export async function buildProfile(userId: string, windowDays = WINDOW_DAYS): Promise<BehaviorProfile> {
  return rowsToProfile(await aggregate(userId, windowDays))
}

export async function saveProfile(userId: string, p: BehaviorProfile, windowDays = WINDOW_DAYS): Promise<void> {
  const now = new Date()
  const data = {
    hourHistogram:    p.hourHistogram as any,
    weekdayHistogram: p.weekdayHistogram as any,
    knownIps:         p.knownIps as any,
    knownUserAgents:  p.knownUserAgents as any,
    resourceMix:      p.resourceMix as any,
    reqPerHourMean:   p.reqPerHourMean,
    reqPerHourStd:    p.reqPerHourStd,
    sampleCount:      p.sampleCount,
    windowStart:      new Date(now.getTime() - windowDays * 86_400_000),
    windowEnd:        now,
    modelVersion:     'behavior-1.0.0',
    trainedAt:        now,
  }
  await (prisma as any).userBehaviorProfile.upsert({
    where:  { userId },
    create: { userId, ...data },
    update: data,
  })
}

/** Barcha faol foydalanuvchilar uchun profilni yangilaydi (kechasi ishlatiladi) */
export async function refreshAll(windowDays = WINDOW_DAYS): Promise<{ built: number; skipped: number }> {
  let built = 0, skipped = 0
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } })
  for (const u of users) {
    try {
      const p = await buildProfile(u.id, windowDays)
      if (p.sampleCount < MIN_SAMPLES) { skipped++; continue }
      await saveProfile(u.id, p, windowDays)
      built++
    } catch (err) {
      logger.warn({ msg: 'Profil qurishda xato', userId: u.id, err: (err as Error).message })
      skipped++
    }
  }
  logger.info({ msg: 'Profillar yangilandi', built, skipped })
  return { built, skipped }
}

/** Saqlangan profilni o'qiydi; yo'q bo'lsa bo'sh profil qaytaradi */
export async function loadProfile(userId: string): Promise<BehaviorProfile> {
  try {
    const row = await (prisma as any).userBehaviorProfile.findUnique({ where: { userId } })
    if (!row) return emptyProfile()
    return {
      hourHistogram:    Array.isArray(row.hourHistogram) ? row.hourHistogram : new Array(24).fill(0),
      weekdayHistogram: Array.isArray(row.weekdayHistogram) ? row.weekdayHistogram : new Array(7).fill(0),
      knownIps:         Array.isArray(row.knownIps) ? row.knownIps : [],
      knownUserAgents:  Array.isArray(row.knownUserAgents) ? row.knownUserAgents : [],
      resourceMix:      row.resourceMix ?? {},
      reqPerHourMean:   Number(row.reqPerHourMean ?? 0),
      reqPerHourStd:    Number(row.reqPerHourStd ?? 0),
      sampleCount:      row.sampleCount ?? 0,
    }
  } catch (err) {
    logger.warn({ msg: 'Profilni o\'qishda xato', userId, err: (err as Error).message })
    return emptyProfile()
  }
}
