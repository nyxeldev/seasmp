/**
 * Korrelyatsiya qatlami — ikkala qatlamning signallarini birlashtiradi.
 *
 * Ishning gipotezasi shu yerda amalga oshadi: avtorizatsiya qatlami "noto'g'ri
 * obyekt" ni, xatti-harakat qatlami "noto'g'ri namuna" ni tutadi. Ular turli
 * tahdid sinflarini ko'radi, birgalikda esa yolg'on ishoralar kamayadi.
 *
 * Mexanizm: yolg'iz qatlam ogohlantirishi uchun KUCHLI dalil talab qilinadi,
 * ikkala qatlam bir vaqtda ishora bersa esa past chegara yetarli. Ya'ni zaif
 * signal yolg'iz turganda bostiriladi, tasdiqlanganda esa o'tkaziladi.
 */

export interface LayerSignals {
  /** FOREIGN + 403 — rad etilgan ruxsatsiz urinishlar soni */
  authzDenied: number
  /** FOREIGN + 200 — muvaffaqiyatli ruxsatsiz murojaat (endpointda tekshiruv yo'q) */
  authzAllowed: number
  /** Oynadagi eng yuqori xatti-harakat anomaliyasi bali, 0..1 */
  behaviorScore: number
  /** Ommaviy ma'lumot chiqarish qoidasi ishladimi */
  massAccess: boolean
}

export type Layer = 'AUTHORIZATION' | 'BEHAVIOR' | 'CORRELATED'

export interface CorrelationVerdict {
  risk:     number
  layer:    Layer | null
  alert:    boolean
  reasons:  string[]
}

/** Yolg'iz qatlam uchun chegara — kuchli dalil talab qilinadi */
export const SINGLE_THRESHOLD = 0.75
/** Ikkala qatlam tasdiqlaganda — past chegara yetarli */
export const CORRELATED_THRESHOLD = 0.50
/** Nechta rad etishdan keyin avtorizatsiya riski to'liq bo'ladi */
export const DENIED_SATURATION = 5

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Mustaqil signallarni birlashtirish (behaviorScoring dagi bilan bir xil g'oya) */
export function combineRisk(parts: number[]): number {
  let acc = 1
  for (const x of parts) acc *= 1 - clamp01(x)
  return clamp01(1 - acc)
}

/** Avtorizatsiya qatlamining riski */
export function authzRisk(s: LayerSignals): number {
  if (s.authzAllowed > 0) return 1
  return clamp01((s.authzDenied / DENIED_SATURATION) * 0.8)
}

/** Xatti-harakat qatlamining riski */
export function behaviorRisk(s: LayerSignals): number {
  return s.massAccess ? 1 : clamp01(s.behaviorScore)
}

export function correlate(s: LayerSignals): CorrelationVerdict {
  const a = authzRisk(s)
  const b = behaviorRisk(s)
  const reasons: string[] = []

  if (s.authzAllowed > 0) reasons.push('FOREIGN_OBJECT_ALLOWED')
  else if (s.authzDenied > 0) reasons.push('FOREIGN_OBJECT_DENIED')
  if (s.massAccess) reasons.push('MASS_ACCESS')
  else if (s.behaviorScore > 0) reasons.push('BEHAVIOR_ANOMALY')

  if (a <= 0 && b <= 0) return { risk: 0, layer: null, alert: false, reasons: [] }

  const both = a > 0 && b > 0
  const risk = combineRisk([a, b])
  const layer: Layer = both ? 'CORRELATED' : a > 0 ? 'AUTHORIZATION' : 'BEHAVIOR'
  const threshold = both ? CORRELATED_THRESHOLD : SINGLE_THRESHOLD

  return { risk, layer, alert: risk >= threshold, reasons }
}

/**
 * Taqqoslash uchun: agar faqat bitta qatlam ishlaganda nima bo'lardi.
 * Eksperimentda gibrid modelni alohida qatlamlar bilan solishtirishga xizmat qiladi.
 */
export function singleLayerVerdict(s: LayerSignals, layer: 'AUTHORIZATION' | 'BEHAVIOR'): boolean {
  const r = layer === 'AUTHORIZATION' ? authzRisk(s) : behaviorRisk(s)
  return r >= SINGLE_THRESHOLD
}
