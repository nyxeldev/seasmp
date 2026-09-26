/**
 * 2-qatlam: xatti-harakat anomaliyasini ballash — sof mantiq, bazaga bog'liq emas.
 *
 * Mavjud tizimda chegaralar qattiq yozilgan edi: SESSION_IP_LIMIT = 3,
 * soat 0–5, BULK_DELETE_LIMIT = 10. Ular hamma foydalanuvchi uchun bir xil.
 * Bu modul ularni HAR BIR FOYDALANUVCHINING O'Z profiliga almashtiradi:
 * kechasi ishlaydigan admin uchun soat 03:00 normal, kunduzgi talaba uchun emas.
 */

export interface BehaviorProfile {
  hourHistogram:    number[]                  // 24 ta chelak, so'rovlar soni
  weekdayHistogram: number[]                  // 7 ta chelak
  knownIps:         string[]
  knownUserAgents:  string[]
  resourceMix:      Record<string, number>    // resurs -> so'rovlar soni
  reqPerHourMean:   number
  reqPerHourStd:    number
  sampleCount:      number
}

export interface ObservedEvent {
  hour:        number          // 0–23, mahalliy vaqt
  weekday:     number          // 0–6
  ip:          string
  userAgent?:  string
  resource:    string
  reqLastHour: number          // shu foydalanuvchining oxirgi soatdagi so'rovlari
}

export interface AnomalyScore {
  score:    number                    // 0..1
  reasons:  string[]
  features: Record<string, number>
}

/** Profil ishonchli bo'lishi uchun minimal kuzatuv soni */
export const MIN_SAMPLES = 50

/** Ogohlantirish chiqariladigan chegara */
export const ALERT_THRESHOLD = 0.6

/**
 * Vaznlar — bitta signalning o'zi ogohlantirish bermasligi, lekin ikki-uchtasi
 * birgalikda chegaradan o'tishi uchun tanlangan.
 */
const WEIGHTS = { hour: 0.45, ip: 0.45, userAgent: 0.25, resource: 0.30, rate: 0.40 }

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Soat yadrosi — Gauss, ±5 soat.
 *
 * Ilgari yadro [0.25, 0.5, 0.25] edi va faqat ±1 soatga yetardi. Shuning uchun
 * quyidagi va'da amalda bajarilmasdi: 9-17 profilida 18:00 haqiqatan yumshoq
 * baholanardi (surprise 0.73), lekin 19:00 dan boshlab HAMMA soat 03:00 bilan
 * bir xil 0.968 chiqardi. Ya'ni "kechroq ishlash" bilan "tungi kirish"
 * farqlanmasdi — aynan shu farq esa xatti-harakat qatlamining butun ma'nosi.
 *
 * Kengroq yadro masofani haqiqatan kodlaydi:
 *   18:00 -> 0.54   19:00 -> 0.70   20:00 -> 0.82   22:00 -> 0.94   03:00 -> 0.97
 */
export const HOUR_KERNEL_HALF_WIDTH = 5
export const HOUR_KERNEL_SIGMA = 2.5

/** Normallashtirilgan Gauss yadrosi. Yig'indisi aniq 1 — silliqlash massani saqlaydi. */
export function gaussianKernel(
  halfWidth = HOUR_KERNEL_HALF_WIDTH, sigma = HOUR_KERNEL_SIGMA,
): number[] {
  const raw: number[] = []
  for (let i = -halfWidth; i <= halfWidth; i++) raw.push(Math.exp(-(i * i) / (2 * sigma * sigma)))
  const total = raw.reduce((a, b) => a + b, 0)
  return raw.map((x) => x / total)
}

export const HOUR_KERNEL = gaussianKernel()

/**
 * Doiraviy silliqlash. Soatlar tartibli kattalik: agar foydalanuvchi 17:00 gacha
 * ishlasa, 18:00 dagi faollik 03:00 dagidan ancha kam shubhali. Silliqlashsiz
 * ikkalasi ham bir xil "hech ko'rilmagan" deb baholanardi.
 */
export function smoothCircular(counts: number[], kernel: number[] = HOUR_KERNEL): number[] {
  const n = counts.length
  if (n === 0) return []
  const half = Math.floor(kernel.length / 2)
  const out = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let acc = 0
    for (let j = 0; j < kernel.length; j++) acc += counts[(i + j - half + n) % n] * kernel[j]
    out[i] = acc
  }
  return out
}

/**
 * Signallarni birlashtirish — "noisy-OR".
 * Vaznli yig'indi o'rniga shu ishlatiladi, chunki yig'indi mustaqil signallarni
 * o'rtachalaydi: uchta kuchli belgi ham chegaradan o'tolmay qolardi.
 */
export function combine(parts: number[]): number {
  let acc = 1
  for (const x of parts) acc *= 1 - clamp01(x)
  return clamp01(1 - acc)
}

/**
 * Laplace silliqlash bilan "kutilmaganlik" bali.
 * 0 — foydalanuvchining eng odatiy qiymati, 1 ga yaqin — hech ko'rilmagan.
 * Silliqlash kam ma'lumotda ham barqaror ishlashini ta'minlaydi.
 */
export function surprise(counts: number[], index: number): number {
  if (!counts || counts.length === 0) return 0
  const total = counts.reduce((a, b) => a + b, 0)
  const k = counts.length
  const observed = counts[index] ?? 0
  const peak = Math.max(...counts)
  const p = (observed + 1) / (total + k)
  const pMax = (peak + 1) / (total + k)
  if (pMax <= 0) return 0
  return clamp01(1 - p / pMax)
}

/** Resurs taqsimoti uchun xuddi shu mantiq, lekin lug'at ustida */
export function surpriseMap(mix: Record<string, number>, key: string): number {
  const keys = Object.keys(mix)
  if (keys.length === 0) return 0
  const counts = keys.map((k) => mix[k])
  const idx = keys.indexOf(key)
  if (idx === -1) {
    // Umuman ko'rilmagan resurs — silliqlangan nol chastota
    const total = counts.reduce((a, b) => a + b, 0)
    const k = keys.length + 1
    const peak = Math.max(...counts)
    return clamp01(1 - (1 / (total + k)) / ((peak + 1) / (total + k)))
  }
  return surprise(counts, idx)
}

/** Necha barobar oshsa ball 1 ga yetadi */
export const SPIKE_FACTOR = 20

/**
 * Chastota og'ishi — faqat yuqoriga chiqish muhim.
 *
 * z-ball emas, logarifmik nisbat ishlatiladi. Sabab amaliy: so'rov soni kichik
 * son (odatda 1–3 so'rov/soat), bunda z-ball juda tez to'yinadi — 8 ta ham,
 * 300 ta ham bir xil "1" beradi va normal xatti-harakat ham chegaradan oshadi.
 * Logarifmik nisbat esa 5 barobar va 200 barobar oshishni ajrata oladi.
 */
export function rateScore(observed: number, mean: number, _std = 0): number {
  const base = Math.max(mean, 1)
  if (observed <= base) return 0
  return clamp01(Math.log2(observed / base) / Math.log2(SPIKE_FACTOR))
}

/**
 * Yakuniy anomaliya bali.
 * Profil yetarli emas bo'lsa 0 qaytaradi — yangi foydalanuvchini ayblamaydi.
 */
export function scoreEvent(profile: BehaviorProfile, event: ObservedEvent): AnomalyScore {
  if (!profile || profile.sampleCount < MIN_SAMPLES) {
    return { score: 0, reasons: ['INSUFFICIENT_DATA'], features: {} }
  }

  const f = {
    hour:      surprise(smoothCircular(profile.hourHistogram), event.hour),
    ip:        profile.knownIps.includes(event.ip) ? 0 : 1,
    userAgent: !event.userAgent || profile.knownUserAgents.includes(event.userAgent) ? 0 : 1,
    resource:  surpriseMap(profile.resourceMix, event.resource),
    rate:      rateScore(event.reqLastHour, profile.reqPerHourMean),
  }

  const score = combine([
    f.hour * WEIGHTS.hour,
    f.ip * WEIGHTS.ip,
    f.userAgent * WEIGHTS.userAgent,
    f.resource * WEIGHTS.resource,
    f.rate * WEIGHTS.rate,
  ])

  const reasons: string[] = []
  if (f.hour > 0.7)      reasons.push('UNUSUAL_HOUR')
  if (f.ip === 1)        reasons.push('NEW_IP')
  if (f.userAgent === 1) reasons.push('NEW_DEVICE')
  if (f.resource > 0.7)  reasons.push('UNUSUAL_RESOURCE')
  if (f.rate > 0.6)      reasons.push('RATE_SPIKE')

  return { score, reasons, features: f }
}

/** Kuzatuvni profilga qo'shadi (onlayn yangilash) */
export function updateProfile(profile: BehaviorProfile, event: ObservedEvent): BehaviorProfile {
  const hours = [...(profile.hourHistogram.length === 24 ? profile.hourHistogram : new Array(24).fill(0))]
  const days = [...(profile.weekdayHistogram.length === 7 ? profile.weekdayHistogram : new Array(7).fill(0))]
  hours[event.hour] = (hours[event.hour] ?? 0) + 1
  days[event.weekday] = (days[event.weekday] ?? 0) + 1

  const mix = { ...profile.resourceMix }
  mix[event.resource] = (mix[event.resource] ?? 0) + 1

  const ips = profile.knownIps.includes(event.ip) ? profile.knownIps : [...profile.knownIps, event.ip]
  const uas = !event.userAgent || profile.knownUserAgents.includes(event.userAgent)
    ? profile.knownUserAgents
    : [...profile.knownUserAgents, event.userAgent]

  return {
    hourHistogram: hours,
    weekdayHistogram: days,
    knownIps: ips,
    knownUserAgents: uas,
    resourceMix: mix,
    reqPerHourMean: profile.reqPerHourMean,
    reqPerHourStd: profile.reqPerHourStd,
    sampleCount: profile.sampleCount + 1,
  }
}

/**
 * Ommaviy ma'lumot chiqarish — alohida qat'iy qoida.
 *
 * Kompozit ball nozik anomaliyalar uchun mo'ljallangan: u bir nechta zaif
 * signalni birlashtiradi. Qo'pol holat esa boshqa tabiatga ega — 200 barobar
 * chastota o'zi yetarli dalil va uni boshqa signallar bilan "muvozanatlash"
 * noto'g'ri bo'lardi. Shuning uchun u kompozit balldan chetda turadi.
 */
export const MASS_ACCESS_FACTOR = 20
export const MASS_ACCESS_FLOOR = 100

export function isMassAccess(reqLastHour: number, profileMean: number): boolean {
  return reqLastHour >= Math.max(profileMean * MASS_ACCESS_FACTOR, MASS_ACCESS_FLOOR)
}

export function emptyProfile(): BehaviorProfile {
  return {
    hourHistogram: new Array(24).fill(0),
    weekdayHistogram: new Array(7).fill(0),
    knownIps: [],
    knownUserAgents: [],
    resourceMix: {},
    reqPerHourMean: 0,
    reqPerHourStd: 0,
    sampleCount: 0,
  }
}
