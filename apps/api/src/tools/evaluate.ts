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

    // Shovqinli zararsiz holatlar — bir nechta zaif signal, lekin hujum emas
    out.push(build('Uydan, yangi qurilmada, kechqurun', false, day,
      { hour: 20, ip: '78.40.1.55', ua: 'Safari-Mobile', resource: 'courses', req: 3 }, 0, 0))

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

    out.push(build('O\'g\'irlangan hisob', true, day,
      { hour: 3, ip: '203.0.113.9', ua: 'curl/8.0', resource: 'courses', req: 5 }, 0, 0))

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

function main(): void {
  const args = process.argv.slice(2)
  const seed = Number(args.find((a) => a.startsWith('--seed='))?.split('=')[1] ?? 42)
  const n    = Number(args.find((a) => a.startsWith('--n='))?.split('=')[1] ?? 100)

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
