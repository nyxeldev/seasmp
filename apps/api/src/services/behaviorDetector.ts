/**
 * 2-qatlam detektori — jonli so'rovni foydalanuvchining o'z profiliga solishtiradi.
 *
 * Diqqat: bu modul ogohlantirish YARATMAYDI. U faqat dalil to'playdi va uni
 * signal oynasiga yozadi. Qaror `correlationDetector` da qabul qilinadi — shunda
 * 2-qatlamning zaif signali 1-qatlamning signali bilan birga baholanadi va
 * yolg'iz turganda bostiriladi.
 */
import { logger } from '../config/logger'
import { redis } from '../config/redis'
import { loadProfile, PROFILE_TIMEZONE } from './behaviorProfiler'
import { recordBehavior, recordMassAccess } from './signalWindow'
import {
  scoreEvent, isMassAccess,
  type BehaviorProfile, type ObservedEvent,
} from './behaviorScoring'

export const DETECTOR_VERSION = 'behavior-1.0.0'

/** Profil keshi — har bir so'rovda bazaga bormaslik uchun */
const PROFILE_TTL = 300_000
const profileCache = new Map<string, { p: BehaviorProfile; at: number }>()

export function clearProfileCache(): void { profileCache.clear() }

async function cachedProfile(userId: string): Promise<BehaviorProfile> {
  const hit = profileCache.get(userId)
  if (hit && Date.now() - hit.at < PROFILE_TTL) return hit.p
  const p = await loadProfile(userId)
  profileCache.set(userId, { p, at: Date.now() })
  return p
}

/** Foydalanuvchining joriy soatdagi so'rovlar sonini oshiradi va qaytaradi */
async function bumpHourlyCount(userId: string): Promise<number> {
  const bucket = Math.floor(Date.now() / 3_600_000)
  const key = `req_hour:${userId}:${bucket}`
  const n = await redis.incr(key)
  if (n === 1) await redis.expire(key, 7200)
  return n
}

/** Toshkent vaqtidagi soat va hafta kuni */
export function localParts(d: Date = new Date()): { hour: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: PROFILE_TIMEZONE, hour: 'numeric', hour12: false, weekday: 'short',
  })
  const parts = fmt.formatToParts(d)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weekday = Math.max(0, names.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'))
  return { hour, weekday }
}

export interface BehaviorObservation {
  score:      number
  massAccess: boolean
  reasons:    string[]
}

/**
 * Har bir so'rov uchun chaqiriladi (requestAudit ichidan).
 * Hech qachon istisno tashlamaydi — monitoring so'rovni buzmasligi kerak.
 */
export async function inspect(
  userId: string, _ip: string, userAgent: string | undefined, resource: string,
): Promise<BehaviorObservation> {
  const none: BehaviorObservation = { score: 0, massAccess: false, reasons: [] }
  try {
    const reqLastHour = await bumpHourlyCount(userId)
    const profile = await cachedProfile(userId)
    const { hour, weekday } = localParts()

    // Qo'pol holat — kompozit balldan mustaqil qat'iy qoida
    const massAccess = isMassAccess(reqLastHour, profile.reqPerHourMean)
    if (massAccess) {
      // Faqat oynadagi birinchi hodisa yoziladi — aks holda toshqin davomida
      // har bir so'rov uchun bitta qator chiqib, logni bosib ketardi.
      if (await recordMassAccess(userId)) {
        logger.warn({ msg: 'Ommaviy ma\'lumot chiqarish', userId, reqLastHour })
      }
      return { score: 1, massAccess: true, reasons: ['MASS_ACCESS'] }
    }

    const event: ObservedEvent = { hour, weekday, ip: _ip, userAgent, resource, reqLastHour }
    const { score, reasons } = scoreEvent(profile, event)
    await recordBehavior(userId, score)
    return { score, massAccess: false, reasons }
  } catch (err) {
    logger.warn({ msg: 'behaviorDetector.inspect xatosi', err: (err as Error).message })
    return none
  }
}
