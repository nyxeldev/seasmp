/**
 * Korrelyatsiya detektori — ogohlantirish yaratishning YAGONA qaror nuqtasi.
 *
 * Ilgari har bir qatlam o'zi mustaqil ogohlantirish yaratardi: 1-qatlam begona
 * obyektni ko'rsa darhol, 2-qatlam ball 0.6 dan oshsa darhol. Bunda `correlation.ts`
 * dagi gipoteza — "ikkala qatlam tasdiqlasa past chegara yetarli, yolg'iz qatlam
 * uchun kuchli dalil kerak" — hech qachon ishlamas edi: zaif yolg'iz signal
 * baribir o'tib ketardi va yolg'on ishoralar kamaymasdi.
 *
 * Endi qatlamlar faqat DALIL to'playdi (signalWindow), qaror esa shu yerda
 * `correlate()` orqali bir marta qabul qilinadi.
 */
import type { AlertType, AlertSeverity } from '@prisma/client'
import { prisma } from '../config/prisma'
import { redis } from '../config/redis'
import { logger } from '../config/logger'
import {
  correlate, privilegedScopeRisk,
  type CorrelationVerdict, type LayerSignals,
} from './correlation'
import { readSignals } from './signalWindow'
import { emitSecurityAlert } from '../realtime/gateway'
import { notifyAdmins } from './notification.service'

export const DETECTOR_VERSION = 'correlation-1.0.0'

/** Bir xil qatlam bo'yicha takroriy ogohlantirishni bostirish oynasi */
const ALERT_COOLDOWN = 900 // 15 daqiqa

/**
 * Ogohlantirish turi eng kuchli dalilga qarab tanlanadi.
 * Qaysi qatlam(lar) ishlaganini `layer` ustuni alohida saqlaydi.
 */
export function alertTypeFor(s: LayerSignals): AlertType {
  if (s.authzAllowed > 0) return 'UNAUTHORIZED_OBJECT_ACCESS'
  if (s.massAccess)       return 'MASS_DATA_ACCESS'
  if (s.authzDenied > 0)  return 'UNAUTHORIZED_OBJECT_ACCESS'
  // Imtiyozli aktorning keng qamrovi — ruxsatsiz murojaat emas, shuning uchun
  // UNAUTHORIZED_OBJECT_ACCESS noto'g'ri bo'lardi. Bu ko'p sub'ektning
  // ma'lumotiga tegish, ya'ni ommaviy murojaat tabiatiga yaqin.
  if (privilegedScopeRisk(s.privilegedOwners) > 0) return 'MASS_DATA_ACCESS'
  return 'BEHAVIOR_ANOMALY'
}

/** Daraja riskdan kelib chiqadi — chegaralar `correlation.ts` bilan moslangan */
export function severityFor(risk: number): AlertSeverity {
  if (risk >= 0.90) return 'CRITICAL'
  if (risk >= 0.75) return 'HIGH'
  if (risk >= 0.50) return 'MEDIUM'
  return 'LOW'
}

/** Sovish oynasi — bir qatlam bo'yicha 15 daqiqada bir marta */
async function shouldAlert(userId: string, layer: string): Promise<boolean> {
  const key = `corr_alert:${userId}:${layer}`
  if (await redis.get(key)) return false
  await redis.setex(key, ALERT_COOLDOWN, '1')
  return true
}

async function persist(
  userId: string, ip: string, verdict: CorrelationVerdict, signals: LayerSignals,
): Promise<void> {
  const created = await prisma.securityAlert.create({
    data: {
      type:            alertTypeFor(signals),
      severity:        severityFor(verdict.risk),
      layer:           verdict.layer as any,
      score:           verdict.risk,
      detectorVersion: DETECTOR_VERSION,
      userId,
      ipAddress:       ip,
      details: {
        reasons:       verdict.reasons,
        signals,
        risk:          verdict.risk,
        correlated:    verdict.layer === 'CORRELATED',
      } as any,
    },
  })

  // Adminlarning qo'ng'irog'iga tushsin. Bu audit jurnalidan yasalgan eski
  // manbadan farqli: qator aynan qabul qiluvchi uchun yoziladi va o'qilgani
  // belgilanadi.
  await notifyAdmins({
    type:  'SECURITY_ALERT',
    title: `Xavfsizlik: ${created.type}`,
    body:  `${created.severity}${created.layer ? ` — ${created.layer}` : ''}`,
    link:  '/security',
    data:  { alertId: created.id.toString(), type: created.type, severity: created.severity },
  })

  // Xavfsizlik paneli ogohlantirishni sahifani yangilamasdan ko'rsin.
  // Faqat imtiyozli rollarga boradi — batafsili realtime/gateway.ts da.
  emitSecurityAlert({
    id:        created.id.toString(),
    type:      created.type,
    severity:  created.severity,
    layer:     created.layer ?? null,
    score:     created.score === null ? null : Number(created.score),
    userId:    created.userId,
    createdAt: created.createdAt.toISOString(),
  })
}

/**
 * Oynadagi to'plangan signallarni baholaydi va kerak bo'lsa ogohlantirish yaratadi.
 * Hech qachon istisno tashlamaydi — monitoring so'rovni buzmasligi kerak.
 */
export async function evaluate(userId: string, ip: string): Promise<CorrelationVerdict | null> {
  try {
    const signals = await readSignals(userId)
    const verdict = correlate(signals)
    if (!verdict.alert || !verdict.layer) return verdict

    if (!(await shouldAlert(userId, verdict.layer))) return verdict

    await persist(userId, ip, verdict, signals)
    logger.warn({
      msg: 'Xavfsizlik ogohlantirishi', userId,
      layer: verdict.layer, risk: Number(verdict.risk.toFixed(4)), reasons: verdict.reasons,
    })
    return verdict
  } catch (err) {
    logger.error({ msg: 'Korrelyatsiya detektorida xato', err: (err as Error).message })
    return null
  }
}
