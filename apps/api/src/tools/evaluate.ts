/**
 * Eksperiment stendi — gipotezani o'lchaydi.
 *
 * Ishga tushirish:  npx tsx src/tools/evaluate.ts [--seed=42] [--n=200]
 *
 * Belgilangan stsenariylar generatsiya qilinadi (hujum va zararsiz), keyin
 * uchta konfiguratsiya taqqoslanadi: faqat 1-qatlam, faqat 2-qatlam, gibrid.
 * Har biri uchun precision, recall, F1 va yolg'on ishoralar soni hisoblanadi.
 *
 * Natija takrorlanadigan: bir xil seed bir xil raqam beradi. Yozma ishda
 * shu jadval keltiriladi.
 */
import {
  scoreEvent, isMassAccess, emptyProfile,
  type BehaviorProfile,
} from '../services/behaviorScoring'
import {
  correlate, singleLayerVerdict,
  SINGLE_THRESHOLD, CORRELATED_THRESHOLD,
  type LayerSignals,
} from '../services/correlation'

// ── Takrorlanadigan tasodifiy sonlar ────────────────────────────────────────
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

// ── Personalar ──────────────────────────────────────────────────────────────
function dayProfile(): BehaviorProfile {
  const p = emptyProfile()
  for (let h = 9; h <= 17; h++) p.hourHistogram[h] = 30
  p.knownIps = ['10.0.0.5']; p.knownUserAgents = ['Chrome']
  p.resourceMix = { courses: 150, enrollments: 90, attendance: 30 }
  p.reqPerHourMean = 3; p.reqPerHourStd = 1.2; p.sampleCount = 270
  return p
}
function nightProfile(): BehaviorProfile {
  const p = emptyProfile()
  for (const h of [22, 23, 0, 1, 2, 3]) p.hourHistogram[h] = 35
  p.knownIps = ['10.0.0.9']; p.knownUserAgents = ['Firefox']
  p.resourceMix = { users: 140, security: 70 }
  p.reqPerHourMean = 4; p.reqPerHourStd = 1.5; p.sampleCount = 210
  return p
}

interface Case { name: string; attack: boolean; signals: LayerSignals }

/** Bitta holat uchun ikkala qatlam signalini hisoblaydi */
function build(
  name: string, attack: boolean, profile: BehaviorProfile,
  ev: { hour: number; ip: string; ua: string; resource: string; req: number },
  authzDenied: number, authzAllowed: number,
  privilegedOwners = 0,
): Case {
  const s = scoreEvent(profile, {
    hour: ev.hour, weekday: 2, ip: ev.ip, userAgent: ev.ua,
    resource: ev.resource, reqLastHour: ev.req,
  })
  return {
    name, attack,
    signals: {
      authzDenied, authzAllowed,
      behaviorScore: s.score,
      massAccess: isMassAccess(ev.req, profile.reqPerHourMean),
      privilegedOwners,
    },
  }
}

function generate(seed: number, n: number): Case[] {
  const r = rng(seed)
  const out: Case[] = []
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)]

  for (let i = 0; i < n; i++) {
    const day = dayProfile(), night = nightProfile()

    // ── ZARARSIZ ──────────────────────────────────────────────────────────
    out.push(build('Odatdagi ish kuni', false, day,
      { hour: 9 + Math.floor(r() * 9), ip: '10.0.0.5', ua: 'Chrome', resource: pick(['courses', 'enrollments']), req: 2 + Math.floor(r() * 3) }, 0, 0))

    out.push(build('Yangi telefon (qonuniy)', false, day,
      { hour: 10 + Math.floor(r() * 6), ip: '10.0.0.5', ua: 'Safari-Mobile', resource: 'courses', req: 3 }, 0, 0))

    out.push(build('Kechroq ishlash', false, day,
      { hour: 18 + Math.floor(r() * 2), ip: '10.0.0.5', ua: 'Chrome', resource: 'courses', req: 3 }, 0, 0))

    out.push(build('Tungi admin (o\'z odati)', false, night,
      { hour: pick([22, 23, 0, 1, 2, 3]), ip: '10.0.0.9', ua: 'Firefox', resource: 'users', req: 4 }, 0, 0))

    out.push(build('O\'qituvchi ko\'p talabani ko\'radi', false, day,
      { hour: 11, ip: '10.0.0.5', ua: 'Chrome', resource: 'enrollments', req: 12 }, 0, 0))

    // Shovqinli zararsiz holatlar — bir nechta zaif signal, lekin hujum emas.
    //
    // Bu ssenariy ilgari QATTIQ YOZILGAN edi (hour:20, req:3, tasodifsiz),
    // shuning uchun ko'p yugurishli barqarorlik tekshiruvida uning bali HAR
    // DOIM bir xil chiqardi va std=0 ko'rsatardi — bu chegara qanchalik
    // barqaror emasligini yashirardi. Endi soat va chastota bir oz suzadi:
    // aynan shu ssenariy SINGLE_THRESHOLD ga eng yaqin turadigan zararsiz
    // holat (bal ~0.7), shuning uchun uning haqiqiy tarqalishi muhim.
    out.push(build('Uydan, yangi qurilmada, kechqurun', false, day,
      { hour: 19 + Math.floor(r() * 3), ip: '78.40.1.55', ua: 'Safari-Mobile', resource: 'courses', req: 2 + Math.floor(r() * 3) }, 0, 0))

    out.push(build('Yangi bo\'limga qiziqish (qonuniy)', false, day,
      { hour: 15, ip: '10.0.0.5', ua: 'Chrome', resource: 'users', req: 4 }, 0, 0))

    // Imtiyozli aktor keng qamrov bilan — bu ADMIN UCHUN ODATIY ISH.
    // 1-qatlam endi bu yerda ham signal beradi, lekin ataylab zaif: yolg'iz
    // o'zi hech qachon ogohlantira olmaydi.
    out.push(build('Admin kundalik ko\'rikdan o\'tkazadi', false, night,
      { hour: pick([22, 23, 0, 1]), ip: '10.0.0.9', ua: 'Firefox', resource: 'users', req: 6 }, 0, 0, 45))

    // ── HUJUM ─────────────────────────────────────────────────────────────
    out.push(build('IDOR paypaslash (rad etilgan)', true, day,
      { hour: 13, ip: '10.0.0.5', ua: 'Chrome', resource: 'enrollments', req: 6 }, 8, 0))

    out.push(build('Muvaffaqiyatli IDOR', true, day,
      { hour: 14, ip: '10.0.0.5', ua: 'Chrome', resource: 'grades', req: 4 }, 0, 2))

    // Bu ham ilgari qattiq yozilgan edi (hour:3, req:5) — aynan shu bal
    // yuqoridagi zararsiz holat bilan SINGLE_THRESHOLD ni ikki tomondan
    // siqib turadi. Endi u ham suzadi.
    out.push(build('O\'g\'irlangan hisob', true, day,
      { hour: pick([2, 3, 4]), ip: '203.0.113.9', ua: 'curl/8.0', resource: 'courses', req: 4 + Math.floor(r() * 3) }, 0, 0))

    out.push(build('Ommaviy ma\'lumot chiqarish', true, day,
      { hour: 12, ip: '10.0.0.5', ua: 'Chrome', resource: 'enrollments', req: 250 }, 0, 0))

    // O'g'irlangan ADMIN hisobi: qamrov keng, lekin yolg'iz o'zi yetarli emas —
    // notanish IP va begona qurilma bilan birga tasdiqlanadi. Ilgari 1-qatlam
    // imtiyozli aktor uchun umuman jim edi, ya'ni bu holat faqat 2-qatlamga
    // qolardi.
    out.push(build('Admin hisobidan ma\'lumot chiqarish', true, night,
      { hour: 3, ip: '198.51.100.7', ua: 'python-requests', resource: 'users', req: 8 }, 0, 0, 70))

    // Eng muhim holat: ikkala signal ham zaif, faqat birgalikda ko'rinadi
    out.push(build('Ehtiyotkor ichki tahdid', true, day,
      { hour: 19, ip: '10.0.0.7', ua: 'Chrome', resource: 'users', req: 6 }, 2, 0))
  }
  return out
}

// ── Baholash: uzluksiz ball, ROC va AUC ────────────────────────────────────
//
// Qat'iy chegarada taqqoslash noto'g'ri bo'lardi: har bir konfiguratsiyaning
// o'z chegarasi bor va natija chegara tanloviga bog'liq bo'lib qoladi.
// Shuning uchun ballar uzluksiz olinadi va butun ROC egri chizig'i solishtiriladi.

import { authzRisk, behaviorRisk, combineRisk } from '../services/correlation'

type Scorer = (s: LayerSignals) => number
const SCORERS: Array<[string, Scorer]> = [
  ['Faqat 1-qatlam (avtorizatsiya)', (x) => authzRisk(x)],
  ['Faqat 2-qatlam (xatti-harakat)', (x) => behaviorRisk(x)],
  ['Gibrid (korrelyatsiya)',          (x) => combineRisk([authzRisk(x), behaviorRisk(x)])],
]

interface Point { fpr: number; tpr: number; threshold: number; fp: number; tp: number }

function rocCurve(scored: Array<{ score: number; attack: boolean }>): Point[] {
  const pos = scored.filter((x) => x.attack).length
  const neg = scored.length - pos
  const thresholds = [...new Set(scored.map((x) => x.score))].sort((a, b) => b - a)
  const pts: Point[] = [{ fpr: 0, tpr: 0, threshold: Infinity, fp: 0, tp: 0 }]
  for (const t of thresholds) {
    let tp = 0, fp = 0
    for (const x of scored) if (x.score >= t) { if (x.attack) tp++; else fp++ }
    pts.push({ fpr: neg ? fp / neg : 0, tpr: pos ? tp / pos : 0, threshold: t, fp, tp })
  }
  return pts
}

/** Trapetsiya usuli bilan egri chiziq ostidagi yuza */
function auc(pts: Point[]): number {
  const s = [...pts].sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr)
  let area = 0
  for (let i = 1; i < s.length; i++) area += (s[i].fpr - s[i - 1].fpr) * (s[i].tpr + s[i - 1].tpr) / 2
  return area
}

/** Berilgan recall ga yetish uchun qancha yolg'on ishora kerak */
function fpAtRecall(pts: Point[], target: number): { fp: number; threshold: number } | null {
  const ok = pts.filter((p) => p.tpr >= target).sort((a, b) => a.fp - b.fp)
  return ok.length ? { fp: ok[0].fp, threshold: ok[0].threshold } : null
}

/** Dashboard uchun mashina o'qiydigan chiqish */
function emitJson(cases: Case[], seed: number, attacks: number): void {
  const configs = SCORERS.map(([name, scorer]) => {
    const scored = cases.map((c) => ({ score: scorer(c.signals), attack: c.attack }))
    const pts = rocCurve(scored)
    return {
      name,
      auc: auc(pts),
      roc: pts.map((p) => ({ fpr: +p.fpr.toFixed(4), tpr: +p.tpr.toFixed(4) })),
      fpAt80: fpAtRecall(pts, 0.8)?.fp ?? null,
      fpAt100: fpAtRecall(pts, 1.0)?.fp ?? null,
    }
  })

  const byName = new Map<string, { attack: boolean; sums: number[]; n: number }>()
  for (const c of cases) {
    const e = byName.get(c.name) ?? { attack: c.attack, sums: [0, 0, 0], n: 0 }
    e.n++
    SCORERS.forEach(([, f], i) => { e.sums[i] += f(c.signals) })
    byName.set(c.name, e)
  }
  const scenarios = [...byName].map(([name, e]) => ({
    name, attack: e.attack,
    scores: e.sums.map((x) => +(x / e.n).toFixed(4)),
  }))

  console.log(JSON.stringify({
    seed, total: cases.length, attacks,
    configs, scenarios,
    generatedAt: new Date().toISOString(),
  }, null, 2))
}

// ── Ishlash nuqtasi: AYNAN ishlab chiqarishdagi qaror ───────────────────────
//
// ROC butun egri chiziqni beradi, ya'ni "chegara eng yaxshi qilib tanlansa"
// degan taxminda. Ishlab chiqarishda esa chegara qat'iy: correlation.ts dagi
// SINGLE_THRESHOLD va CORRELATED_THRESHOLD. Ikkisi bir xil narsa emas —
// AUC 1.000 bo'lsa ham qat'iy chegarada yolg'on ishora chiqishi mumkin.
//
// Shuning uchun yozma ishda AYNAN shu jadval keltirilishi kerak: u tizim
// haqiqatan qanday qaror qabul qilishini ko'rsatadi.

interface Confusion { tp: number; fp: number; fn: number; tn: number }

type Decider = (s: LayerSignals) => boolean

const DECIDERS: Array<[string, Decider]> = [
  ['Faqat 1-qatlam (avtorizatsiya)', (s) => singleLayerVerdict(s, 'AUTHORIZATION')],
  ['Faqat 2-qatlam (xatti-harakat)', (s) => singleLayerVerdict(s, 'BEHAVIOR')],
  ['Gibrid (korrelyatsiya)',          (s) => correlate(s).alert],
]

function confusion(cases: Case[], decide: Decider): Confusion {
  const c: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 }
  for (const x of cases) {
    const alert = decide(x.signals)
    if (x.attack) { if (alert) c.tp++; else c.fn++ }
    else          { if (alert) c.fp++; else c.tn++ }
  }
  return c
}

function prf(c: Confusion): { precision: number; recall: number; f1: number } {
  const precision = c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : 0
  const recall    = c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : 0
  const f1        = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { precision, recall, f1 }
}

/** Qaysi stsenariylar noto'g'ri baholanadi — chegarani muhokama qilish uchun */
function misclassified(cases: Case[], decide: Decider): { fp: string[]; fn: string[] } {
  const fp = new Set<string>(), fn = new Set<string>()
  for (const x of cases) {
    const alert = decide(x.signals)
    if (!x.attack && alert) fp.add(x.name)
    if (x.attack && !alert) fn.add(x.name)
  }
  return { fp: [...fp], fn: [...fn] }
}

function reportOperatingPoint(cases: Case[]): void {
  console.log(`
Ishlash nuqtasi (yolg'iz qatlam >= ${SINGLE_THRESHOLD}, korrelyatsiya >= ${CORRELATED_THRESHOLD}):
`)
  console.log('konfiguratsiya'.padEnd(34), '  TP    FP    FN   aniqlik  qamrov      F1')
  console.log('-'.repeat(34), '-'.repeat(46))
  for (const [name, decide] of DECIDERS) {
    const c = confusion(cases, decide)
    const m = prf(c)
    console.log(
      name.padEnd(34),
      String(c.tp).padStart(4), String(c.fp).padStart(5), String(c.fn).padStart(5),
      m.precision.toFixed(3).padStart(9), m.recall.toFixed(3).padStart(8), m.f1.toFixed(3).padStart(8),
    )
  }

  for (const [name, decide] of DECIDERS) {
    const { fp, fn } = misclassified(cases, decide)
    if (fp.length === 0 && fn.length === 0) continue
    console.log(`
  ${name}:`)
    for (const x of fp) console.log(`    yolg'on ishora  : ${x}`)
    for (const x of fn) console.log(`    o'tkazib yubordi: ${x}`)
  }
  console.log()
}

// ── Ko'p yugurishli barqarorlik: chegaralarni asoslash ──────────────────────
//
// Bitta seed = bitta raqam muammosi: F1=1.000 degan da'vo bitta tasodifiy
// chizishga tayangan bo'lishi mumkin. Bu qism bir xil ishlash nuqtasini ko'p
// marta, har safar boshqa seed bilan hisoblaydi va natijaning qanchalik
// BARQAROR ekanini (standart og'ish orqali) ko'rsatadi. Yozma ishda
// "F1=1.000" o'rniga "F1=1.000±0.000, N=30 yugurish" deyish mumkin bo'ladi —
// bu ancha kuchli da'vo.

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}
function stdev(xs: number[]): number {
  if (xs.length === 0) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

interface TrialStats { precision: number[]; recall: number[]; f1: number[]; fp: number[]; fn: number[] }

/** Katta tub son bilan siljitish — ketma-ket seedlar bir-biriga o'xshab qolmasin */
const SEED_STRIDE = 7919

function runTrials(baseSeed: number, trials: number, n: number): Map<string, TrialStats> {
  const stats = new Map<string, TrialStats>()
  for (const [name] of DECIDERS) stats.set(name, { precision: [], recall: [], f1: [], fp: [], fn: [] })

  for (let t = 0; t < trials; t++) {
    const cases = generate(baseSeed + t * SEED_STRIDE, n)
    for (const [name, decide] of DECIDERS) {
      const c = confusion(cases, decide)
      const m = prf(c)
      const s = stats.get(name)!
      s.precision.push(m.precision); s.recall.push(m.recall); s.f1.push(m.f1)
      s.fp.push(c.fp); s.fn.push(c.fn)
    }
  }
  return stats
}

function reportTrials(stats: Map<string, TrialStats>, trials: number, n: number): void {
  console.log("")
  console.log(`${trials} MARTA TAKRORLANGAN ISHLASH NUQTASI (har safar boshqa seed, holat/yugurish=${n * 12})`)
  console.log("")
  console.log("Standart og'ish qancha kichik bo'lsa, ishlash nuqtasi shuncha barqaror —")
  console.log("ya'ni natija tasodifiy chizishga emas, tizimning o'ziga tegishli.")
  console.log("")
  console.log("konfiguratsiya".padEnd(34), "aniqlik (o'rt±std)", "qamrov (o'rt±std)", "   F1 (o'rt±std)", "  FP (o'rt, min-max)")
  console.log("-".repeat(34), "-".repeat(95))
  for (const [name, s] of stats) {
    console.log(
      name.padEnd(34),
      `${mean(s.precision).toFixed(3)}±${stdev(s.precision).toFixed(3)}`.padStart(20),
      `${mean(s.recall).toFixed(3)}±${stdev(s.recall).toFixed(3)}`.padStart(20),
      `${mean(s.f1).toFixed(3)}±${stdev(s.f1).toFixed(3)}`.padStart(20),
      `${mean(s.fp).toFixed(1)} (${Math.min(...s.fp)}-${Math.max(...s.fp)})`.padStart(20),
    )
  }
  console.log("")
}

// ── Chegara grid-qidiruvi ────────────────────────────────────────────────────
//
// SINGLE_THRESHOLD=0.75 va CORRELATED_THRESHOLD=0.50 correlation.ts da
// QOTIRILGAN qiymatlar edi — hech qachon boshqa nuqta bilan solishtirilmagan.
// Bu funksiya ikkala chegarani mustaqil o'zgartirib, har nuqtada jami
// (FP+FN) ni ko'p yugurish bo'yicha o'rtachalab beradi. correlate() ning o'zi
// TEGILMAYDI — mantiq shu yerda authzRisk/behaviorRisk/combineRisk dan qayta
// yig'iladi, faqat chegara qiymati parametr bo'ladi.

function decideWithThresholds(s: LayerSignals, singleT: number, corrT: number): boolean {
  const a = authzRisk(s)
  const b = behaviorRisk(s)
  if (a <= 0 && b <= 0) return false
  const both = a > 0 && b > 0
  const risk = combineRisk([a, b])
  return risk >= (both ? corrT : singleT)
}

function sweepThresholds(baseSeed: number, trials: number, n: number): void {
  const singleGrid = [0.60, 0.65, 0.70, 0.75, 0.80, 0.85]
  const corrGrid   = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]

  const allTrials: Case[][] = []
  for (let t = 0; t < trials; t++) allTrials.push(generate(baseSeed + t * SEED_STRIDE, n))
  const totalCases = allTrials.reduce((a, c) => a + c.length, 0)

  console.log("")
  console.log(`CHEGARA GRID-QIDIRUVI (${trials} yugurish x ${n} takror, jami ${totalCases} holat/nuqta)`)
  console.log("")
  console.log("Har katakcha: jami FP+FN (kichikroq — yaxshiroq). '-' — korrelyatsiya chegarasi")
  console.log("yolg'iz chegaradan past bo'lishi SHART (gipoteza: birgalikda past chegara")
  console.log("yetarli), shuning uchun teskarisi sinalmaydi. Joriy ishlab chiqarish qiymati [*].")
  console.log("")

  const header = ["korrelyatsiya \\ yolg'iz"].concat(singleGrid.map((v) => v.toFixed(2)))
  console.log(header.map((h, i) => (i === 0 ? h.padEnd(24) : h.padStart(8))).join(""))

  let best: { s: number; c: number; cost: number } | null = null

  for (const corrT of corrGrid) {
    const row: string[] = [corrT.toFixed(2).padEnd(24)]
    for (const singleT of singleGrid) {
      if (corrT >= singleT) { row.push("-".padStart(8)); continue }
      let totalFp = 0, totalFn = 0
      for (const cases of allTrials) {
        for (const c of cases) {
          const alert = decideWithThresholds(c.signals, singleT, corrT)
          if (!c.attack && alert) totalFp++
          if (c.attack && !alert) totalFn++
        }
      }
      const cost = totalFp + totalFn
      const isProd = Math.abs(singleT - SINGLE_THRESHOLD) < 1e-9 && Math.abs(corrT - CORRELATED_THRESHOLD) < 1e-9
      row.push((isProd ? `${cost}*` : String(cost)).padStart(8))
      if (!best || cost < best.cost) best = { s: singleT, c: corrT, cost }
    }
    console.log(row.join(""))
  }

  console.log("")
  console.log(`Eng kam xato: SINGLE=${best?.s.toFixed(2)}, CORRELATED=${best?.c.toFixed(2)} (jami xato: ${best?.cost})`)
  console.log(`Joriy ishlab chiqarish:  SINGLE=${SINGLE_THRESHOLD}, CORRELATED=${CORRELATED_THRESHOLD}`)
  console.log("")
  console.log("DIQQAT: bu grid ATAYLAB ishlab chiqarish qiymatini o'zgartirmaydi — faqat")
  console.log("tanlovni asoslaydi yoki muqobil nuqtani ko'rsatadi. Chegarani shu stend")
  console.log("natijasiga moslashtirish o'sha stendning o'zi o'lchayotgan narsaga")
  console.log("moslashtirish bo'lardi — haqiqiy o'zgartirish haqiqiy trafik talab qiladi.")
  console.log("")
}

function main(): void {
  const args = process.argv.slice(2)
  const seed = Number(args.find((a) => a.startsWith('--seed='))?.split('=')[1] ?? 42)
  const n    = Number(args.find((a) => a.startsWith('--n='))?.split('=')[1] ?? 100)

  // --trials=K: bitta seed emas, K ta seed bilan barqarorlikni tekshiradi.
  // --sweep: shu yordamida chegara grid-qidiruvini ham ishga tushiradi.
  const trialsArg = args.find((a) => a.startsWith('--trials='))
  if (trialsArg) {
    const trials = Number(trialsArg.split('=')[1])
    const stats = runTrials(seed, trials, n)
    reportTrials(stats, trials, n)
    if (args.includes('--sweep')) sweepThresholds(seed, trials, n)
    return
  }

  const cases = generate(seed, n)
  const attacks = cases.filter((c) => c.attack).length
  const asJson = args.includes('--json')

  if (asJson) { emitJson(cases, seed, attacks); return }

  console.log(`\nSEASMP — qatlamlarni taqqoslash (ROC)   seed=${seed}, holatlar=${cases.length}, hujumlar=${attacks}\n`)
  console.log('konfiguratsiya'.padEnd(34), '  AUC    FP@recall=0.80   FP@recall=1.00')
  console.log('-'.repeat(34), '-'.repeat(40))

  const curves: Array<[string, Point[]]> = []
  for (const [name, scorer] of SCORERS) {
    const scored = cases.map((c) => ({ score: scorer(c.signals), attack: c.attack }))
    const pts = rocCurve(scored)
    curves.push([name, pts])
    const a80 = fpAtRecall(pts, 0.80)
    const a100 = fpAtRecall(pts, 1.0)
    console.log(
      name.padEnd(34),
      auc(pts).toFixed(3).padStart(6),
      (a80 ? String(a80.fp) : 'yetib bormaydi').padStart(14),
      (a100 ? String(a100.fp) : 'yetib bormaydi').padStart(16),
    )
  }

  reportOperatingPoint(cases)
  console.log('\nTahdid sinflari bo\'yicha o\'rtacha ball:\n')
  const byName = new Map<string, { attack: boolean; sums: number[]; n: number }>()
  for (const c of cases) {
    const e = byName.get(c.name) ?? { attack: c.attack, sums: [0, 0, 0], n: 0 }
    e.n++
    SCORERS.forEach(([, f], i) => { e.sums[i] += f(c.signals) })
    byName.set(c.name, e)
  }
  console.log('stsenariy'.padEnd(34), 'turi      1-qat  2-qat  gibrid')
  console.log('-'.repeat(34), '-'.repeat(30))
  for (const [name, e] of byName) {
    const v = e.sums.map((x) => (x / e.n).toFixed(2).padStart(6)).join(' ')
    console.log(name.padEnd(34), (e.attack ? 'HUJUM   ' : 'zararsiz'), v)
  }
  console.log()
}

main()
