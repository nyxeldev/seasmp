/**
 * Qatlam signallarining sirpanuvchi oynasi.
 *
 * Korrelyatsiya ikkita qatlamning signalini BIR vaqtda ko'rishi kerak, lekin
 * ular turli so'rovlarda paydo bo'ladi: aktor 16:02 da begona obyektni so'raydi,
 * 16:05 da esa notanish IP dan kiradi. Har bir so'rovni alohida baholasak,
 * ikkala signal hech qachon uchrashmaydi.
 *
 * Shuning uchun signallar foydalanuvchi bo'yicha qisqa oynada to'planadi va
 * korrelyatsiya o'sha to'plangan manzaraga qaraydi.
 *
 * Redis'da saqlanadi — jarayon qayta ishga tushsa ham oyna yo'qolmaydi va
 * bir nechta API nusxasi bir xil manzarani ko'radi.
 */
import { redis } from '../config/redis'
import type { LayerSignals } from './correlation'

/** Oyna uzunligi — ogohlantirish sovish oynasi bilan bir xil */
export const WINDOW_SECONDS = 900 // 15 daqiqa

const keyDenied   = (u: string) => `sig:authz_denied:${u}`
const keyAllowed  = (u: string) => `sig:authz_allowed:${u}`
const keyBehavior = (u: string) => `sig:behavior:${u}`
const keyMass     = (u: string) => `sig:mass:${u}`
const keyScope    = (u: string) => `sig:priv_scope:${u}`

/** Hisoblagichni oshiradi va birinchi marta oyna muddatini o'rnatadi */
async function bump(key: string): Promise<void> {
  const n = await redis.incr(key)
  if (n === 1) await redis.expire(key, WINDOW_SECONDS)
}

/**
 * 1-QATLAM signali.
 * ALLOWED — begona obyektga MUVAFFAQIYATLI murojaat (endpointda tekshiruv yo'q).
 * DENIED  — rad etilgan urinish (himoya ishladi, lekin urinish o'zi dalil).
 */
export async function recordAuthz(userId: string, outcome: 'ALLOWED' | 'DENIED'): Promise<void> {
  await bump(outcome === 'ALLOWED' ? keyAllowed(userId) : keyDenied(userId))
}

/**
 * 2-QATLAM signali — oynadagi ENG YUQORI anomaliya bali saqlanadi.
 *
 * O'rtacha emas, maksimum: bitta kuchli anomaliyani keyingi o'nlab oddiy
 * so'rovlar "yuvib" yubormasligi kerak.
 */
export async function recordBehavior(userId: string, score: number): Promise<void> {
  if (!(score > 0)) return
  const key = keyBehavior(userId)
  const prev = Number((await redis.get(key)) ?? 0)
  if (score <= prev) return
  await redis.setex(key, WINDOW_SECONDS, String(score))
}

/**
 * 2-QATLAM ning qat'iy qoidasi — ommaviy ma'lumot chiqarish.
 *
 * Oynada BIRINCHI marta belgilangan bo'lsa `true` qaytaradi. Chaqiruvchi
 * shunga qarab log yozadi: ommaviy chiqarish paytida har bir so'rov uchun
 * qator yozilsa, aniqlash tizimining o'zi toshqinni kuchaytirgan bo'lardi.
 */
export async function recordMassAccess(userId: string): Promise<boolean> {
  const key = keyMass(userId)
  const alreadySet = await redis.get(key)
  await redis.setex(key, WINDOW_SECONDS, '1')
  return !alreadySet
}

/**
 * 1-QATLAM signali — IMTIYOZLI aktor uchun.
 *
 * Admin uchun begona obyekt tushunchasi yo'q: hammasi unga ochiq. Shuning
 * uchun bu yerda hodisa emas, QAMROV o'lchanadi — oynada nechta HAR XIL
 * egaga tegdi. Hisoblagich emas, to'plam: bitta talabaning yozuvini yuz
 * marta yangilash bitta ega bo'lib qoladi.
 *
 * Oynadagi har xil egalar sonini qaytaradi.
 */
export async function recordPrivilegedScope(userId: string, ownerId: string): Promise<number> {
  const key = keyScope(userId)
  await redis.sadd(key, ownerId)
  const size = await redis.scard(key)
  // Muddat faqat to'plam yaratilganda o'rnatiladi. Har safar yangilansa oyna
  // admin ishlagani sayin cho'zilib, hech qachon tugamasdi.
  if (size === 1) await redis.expire(key, WINDOW_SECONDS)
  return size
}

/** Oynadagi to'plangan manzara — korrelyatsiya shunga qaraydi */
export async function readSignals(userId: string): Promise<LayerSignals> {
  const [denied, allowed, behavior, mass, scope] = await Promise.all([
    redis.get(keyDenied(userId)),
    redis.get(keyAllowed(userId)),
    redis.get(keyBehavior(userId)),
    redis.get(keyMass(userId)),
    redis.scard(keyScope(userId)),
  ])
  return {
    authzDenied:      Number(denied  ?? 0),
    authzAllowed:     Number(allowed ?? 0),
    behaviorScore:    Number(behavior ?? 0),
    massAccess:       mass === '1',
    privilegedOwners: Number(scope ?? 0),
  }
}

/** Oynani tozalash — testlar va qo'lda aralashuv uchun */
export async function clearSignals(userId: string): Promise<void> {
  await redis.del(
    keyDenied(userId), keyAllowed(userId), keyBehavior(userId),
    keyMass(userId), keyScope(userId),
  )
}
