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
  /**
   * Imtiyozli aktor (ADMIN/SUPER_ADMIN) oynada NECHTA har xil egaga tegdi.
   *
   * Oddiy foydalanuvchi uchun begona obyektga murojaat o'zi belgidir. Admin
   * uchun esa bu — ish tavsifi, shuning uchun uni FOREIGN deb belgilash
   * jurnalni yolg'on signalga to'ldirardi. Admin uchun signal boshqa:
   * bitta talabaning yozuvini ochish odatiy, o'n besh daqiqada oltmish xil
   * talabaning yozuvini ochish esa yo'q.
   */
  privilegedOwners: number
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

/**
 * Imtiyozli qamrov: shu sondan kam egaga tegish umuman signal emas.
 * Admin bir necha talabaning yozuvini ko'rishi — kundalik ish.
 */
export const PRIVILEGED_SCOPE_FLOOR = 20
/** Shu sondan keyin qamrov riski to'yinadi */
export const PRIVILEGED_SCOPE_SATURATION = 60
/**
 * Qamrov riskining TEPA CHEGARASI — ataylab SINGLE_THRESHOLD dan past.
 *
 * Ya'ni keng qamrov YOLG'IZ o'zi hech qachon ogohlantirish bermaydi: adminning
 * ko'p talabani ko'rishi jinoyat emas. Lekin u endi nolga teng emas, shuning
 * uchun xatti-harakat qatlami ham ishora bersa (notanish IP, tungi soat)
 * ikkalasi birga CORRELATED_THRESHOLD dan o'tadi. Ishning gipotezasi aynan
 * shu: yolg'iz zaif dalil bostiriladi, tasdiqlangani o'tkaziladi.
 *
 * Bu uchta son boshlang'ich qiymat — haqiqiy trafikda qayta o'lchanishi kerak.
 */
export const PRIVILEGED_SCOPE_CAP = 0.5

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Mustaqil signallarni birlashtirish (behaviorScoring dagi bilan bir xil g'oya) */
export function combineRisk(parts: number[]): number {
  let acc = 1
  for (const x of parts) acc *= 1 - clamp01(x)
  return clamp01(1 - acc)
}

/**
 * Imtiyozli aktorning qamrov riski: oynada nechta har xil egaga tegdi.
 * Chiqish [0, PRIVILEGED_SCOPE_CAP] oralig'ida — yolg'iz ogohlantira olmaydi.
 */
export function privilegedScopeRisk(distinctOwners: number): number {
  if (!(distinctOwners > PRIVILEGED_SCOPE_FLOOR)) return 0
  const span = PRIVILEGED_SCOPE_SATURATION - PRIVILEGED_SCOPE_FLOOR
  return clamp01((distinctOwners - PRIVILEGED_SCOPE_FLOOR) / span) * PRIVILEGED_SCOPE_CAP
}

/** Avtorizatsiya qatlamining riski */
export function authzRisk(s: LayerSignals): number {
  if (s.authzAllowed > 0) return 1
  const denied = clamp01((s.authzDenied / DENIED_SATURATION) * 0.8)
  const scope  = privilegedScopeRisk(s.privilegedOwners)
  return combineRisk([denied, scope])
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
  if (privilegedScopeRisk(s.privilegedOwners) > 0) reasons.push('PRIVILEGED_BROAD_SCOPE')
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
