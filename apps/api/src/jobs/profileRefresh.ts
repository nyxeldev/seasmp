/**
 * Xatti-harakat profillarini davriy yangilash — 2-qatlamning yoqilishi.
 *
 * Nega kerak: `behaviorProfiler.refreshAll()` yozilgan edi, lekin uni hech kim
 * chaqirmasdi. Profil bo'lmasa `loadProfile()` bo'sh profil qaytaradi,
 * `scoreEvent()` esa sampleCount < MIN_SAMPLES bo'lgani uchun doim 0 ball
 * beradi — ya'ni 2-qatlam yozilgan, lekin amalda o'chiq turardi.
 *
 * Profil audit jurnalining oxirgi 30 kunidan quriladi, shuning uchun uni
 * tez-tez qayta hisoblashning ma'nosi yo'q: sutkada bir marta yetarli.
 */
import { redis } from '../config/redis'
import { logger } from '../config/logger'
import { refreshAll } from '../services/behaviorProfiler'
import { clearProfileCache } from '../services/behaviorDetector'

/** Yangilanish oralig'i — profil 30 kunlik oynaga tayanadi, sutkalik yetarli */
const INTERVAL_MS = 24 * 60 * 60 * 1000

/** Yuklanishdan keyin birinchi qurish — server to'liq ko'tarilishini kutadi */
const FIRST_RUN_DELAY_MS = 30_000

/**
 * Bir vaqtda faqat bitta nusxa ishlashi uchun qulf.
 *
 * `incr` atomik va MemRedis'da ham, haqiqiy Redis'da ham bir xil ishlaydi:
 * qiymatni 1 ga oshirgan birinchi chaqiruvchi qulfni oladi.
 */
async function acquireLock(ttlSeconds: number): Promise<boolean> {
  const key = 'job_lock:profile_refresh'
  const n = await redis.incr(key)
  if (n === 1) {
    await redis.expire(key, ttlSeconds)
    return true
  }
  return false
}

async function releaseLock(): Promise<void> {
  await redis.del('job_lock:profile_refresh')
}

async function runOnce(): Promise<void> {
  // Qulf TTL — jarayon qulash holatida ham qulf abadiy qolib ketmasin
  if (!(await acquireLock(3600))) {
    logger.info({ msg: 'Profil yangilash o\'tkazib yuborildi — boshqa nusxa bajarmoqda' })
    return
  }
  try {
    const started = Date.now()
    const { built, skipped } = await refreshAndInvalidate()
    logger.info({ msg: 'Xatti-harakat profillari yangilandi', built, skipped, ms: Date.now() - started })
  } catch (err) {
    // Fon vazifasi hech qachon serverni to'xtatmasligi kerak
    logger.error({ msg: 'Profil yangilashda xato', err: (err as Error).message })
  } finally {
    await releaseLock()
  }
}

/**
 * Yangi qurilgan profillar darhol kuchga kirishi uchun detektor keshini bo'shatadi.
 * Aks holda 2-qatlam yana 5 daqiqa eski (ko'pincha bo'sh) profil bilan ishlaydi.
 */
async function refreshAndInvalidate(): Promise<{ built: number; skipped: number }> {
  const result = await refreshAll()
  clearProfileCache()
  return result
}

/** Qo'lda ishga tushirish — admin endpointi va demo uchun */
export async function refreshProfilesNow(): Promise<{ built: number; skipped: number }> {
  return refreshAndInvalidate()
}

/**
 * Davriy yangilashni boshlaydi. To'xtatuvchi funksiyani qaytaradi.
 * Taymerlar `unref` qilingan — ular jarayonni tirik ushlab turmaydi.
 */
export function startProfileRefresh(): () => void {
  const first = setTimeout(() => { void runOnce() }, FIRST_RUN_DELAY_MS)
  const timer = setInterval(() => { void runOnce() }, INTERVAL_MS)
  first.unref?.()
  timer.unref?.()

  logger.info({ msg: 'Profil yangilash rejalashtirildi', everyHours: INTERVAL_MS / 3_600_000 })

  return () => { clearTimeout(first); clearInterval(timer) }
}
