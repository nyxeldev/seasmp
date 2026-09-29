/**
 * E1 — TASHQI BENCHMARK: CMU CERT Insider Threat Test Dataset (release r4.2).
 *
 * evaluate.ts dagi eng katta zaiflik: hujum va zararsiz stsenariylar HAM,
 * ularni baholovchi tizim HAM bir xil loyihada, bir xil odam tomonidan
 * yozilgan — bu aylanma dalil. Bu skript boshqacha: tashqi, mustaqil, CMU
 * SEI tomonidan DARPA sponsorligida yaratilgan sun'iy insayder-tahdid
 * ma'lumotlari ustida ishlaydi. Foydalanuvchilar, PC'lar, kunlar — bizning
 * loyihamizga hech qanday aloqasi yo'q.
 *
 * MANBA:
 *   https://kilthub.cmu.edu/articles/dataset/Insider_Threat_Test_Dataset/12841247
 *   DOI: 10.1184/R1/12841247, litsenziya: CC BY 4.0, to'g'ridan-to'g'ri
 *   yuklanadi (ro'yxatdan o'tish yoki forma talab qilinmaydi).
 *
 * NEGA r4.2: 191 ta jami belgilangan insayder barcha versiyalar bo'yicha,
 * ulardan 70 tasi (36.6%) aynan r4.2 da — bu boshqa kichikroq versiyalarga
 * (r2: 1 ta, r3.1/r3.2: 2 tadan, r4.1: 3 ta) qaraganda ANCHA boy belgilangan
 * to'plam. Kichikroq versiyalar statistik jihatdan ishonchsiz natija berardi
 * (1-3 ta musbat holat bilan precision/recall ma'nosiz).
 *
 * XARITALASH — bizning access_relation/behavior_profile modeliga:
 *
 *   CERT logon.csv        <->  bizning HTTP so'rov oqimi
 *   PC (kompyuter nomi)    <->  IP manzil + qurilma birlashtirilgan holda
 *                               (CERT da alohida user-agent tushunchasi yo'q)
 *   foydalanuvchining ENG  <->  bizning "known IP" — profildagi tanish
 *   KO'P ishlatgan PC'si        manzil
 *   boshqa PC'dan kirish   <->  FOREIGN (1-qatlam signali, authzRisk)
 *   soat/hafta kuni        <->  bizning hourHistogram/weekdayHistogram
 *   javob: answers/*.csv   <->  haqiqiy yorliq (attack=true/false)
 *
 * MUHIM SODDALASHTIRISH (ochiq aytiladi): productionda signal 15 daqiqalik
 * Redis oynasida TO'PLANADI (bir nechta HTTP so'rovi bo'ylab). CERT
 * foydalanuvchisi kuniga odatda 1-4 marta kirish/chiqish qiladi — "oyna"
 * tushunchasi mos kelmaydi. Shuning uchun bu yerda BIR SESSIYA (answers
 * faylidagi boshlanish-tugash oralig'i) BITTA holat sifatida olinadi va
 * o'sha oraliqdagi barcha logon hodisalari bo'yicha ENG YUQORI authzRisk va
 * behaviorRisk hisoblanadi — bu evaluate.ts dagi "har stsenariy = bitta
 * holat" yondashuviga mos, productiondagi oyna mexanizmiga esa yaqin.
 *
 * ISHLATILGAN KOD — productiondan O'ZGARTIRMASDAN import qilinadi:
 *   authzRisk, behaviorRisk, combineRisk, correlate  (services/correlation)
 *   surprise, smoothCircular, combine, rateScore      (services/behaviorScoring,
 *                                                       correlate ichida bilvosita)
 * Bu ataylab shunday: maqsad YANGI algoritm sinash emas, MAVJUD algoritmni
 * tashqi ma'lumotda o'lchash.
 *
 * QAMROV HAQIDA HALOLLIK: r4.2 logon.csv da 1000 ta noyob foydalanuvchi bor
 * (dastlab ~4000 deb taxmin qilingan edi — amalda o'lchab rad etildi),
 * 854,859 qator. Bu skript BARCHA 70 ta belgilangan insayderni ISHLATADI
 * (to'liq musbat sinf), lekin salbiy sinf uchun tasodifiy tanlangan
 * NEGATIVE_SAMPLE_USERS (300) ta zararsiz foydalanuvchi ishlatiladi — bu
 * ~930 nomzoddan (1000 - 70 insayder) ~32%, to'liq populyatsiya emas. Bu
 * standart va qonuniy amaliyot (down-sampling), lekin ochiq aytiladi:
 * natija BARCHA foydalanuvchi ustida emas, tasodifiy namunada.
 *
 * Ishlatish:
 *   npx tsx apps/api/src/tools/externalBenchmark.ts --dir=<CERT r4.2 papkasi>
 *   npx tsx apps/api/src/tools/externalBenchmark.ts --dir=... --json > natija.json
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import {
  authzRisk, behaviorRisk, correlate,
  SINGLE_THRESHOLD, CORRELATED_THRESHOLD,
  type LayerSignals,
} from '../services/correlation'
import {
  scoreEvent, smoothCircular, emptyProfile, MIN_SAMPLES,
  type BehaviorProfile, type ObservedEvent,
} from '../services/behaviorScoring'

const NEGATIVE_SAMPLE_USERS = 300
const RNG_SEED = 20260928

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

// ── CSV oqim o'qish (fayllar bir necha GB bo'lishi mumkin — streaming shart) ──

async function* readCsvLines(filePath: string): AsyncGenerator<string[]> {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity })
  let first = true
  for await (const line of rl) {
    if (first) { first = false; continue } // sarlavha qatori
    if (!line) continue
    yield parseCsvLine(line)
  }
}

/** Oddiy CSV parser — CERT fayllarida qo'shtirnoq ichida vergul uchraydi (masalan PC nomi kamdan-kam, lekin xavfsiz bo'lish uchun) */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}

// ── Javob kaliti: qaysi (user, sana oralig'i) insayder ─────────────────────────

interface InsiderLabel { dataset: string; scenario: string; user: string; start: Date; end: Date }

function loadInsiders(answersDir: string): InsiderLabel[] {
  const csvPath = path.join(answersDir, 'insiders.csv')
  const text = fs.readFileSync(csvPath, 'utf-8')
  const lines = text.split('\n').slice(1).filter(Boolean)
  const out: InsiderLabel[] = []
  for (const line of lines) {
    const [dataset, scenario, , user, start, end] = parseCsvLine(line)
    if (dataset !== '4.2') continue
    out.push({ dataset, scenario, user, start: new Date(start), end: new Date(end) })
  }
  return out
}

// ── Uch manba (logon/http/email) dan yagona hodisa oqimi ────────────────────────
//
// Boshlang'ich yugurish FAQAT logon.csv dan foydalandi va 70 insayderdan
// atigi 19 tasini (27%) tutdi — sabab aniq o'lchandi: qolgan 51 tasining
// zararli faoliyati boshqa kanalda (email orqali tashqariga yuborish, tashqi
// veb-saytlarga tashrif) edi, logon.csv da umuman ko'rinmasdi. Bu boyitilgan
// versiya uchta manbani BIR profilga birlashtiradi.

const COMPANY_DOMAIN = 'dtaa.com' // LDAP snapshotidan tasdiqlangan

interface SourceEvent {
  date: Date
  pc: string
  resource: 'logon' | 'http' | 'email'
  /** Faqat email uchun: qabul qiluvchilardan biri kompaniya domenidan tashqarida */
  external: boolean
}

/** Foydalanuvchi -> uning barcha hodisalari (xotira tejash uchun faqat kerakli userlar saqlanadi) */
async function loadLogonsForUsers(logonCsv: string, wantedUsers: Set<string>): Promise<Map<string, SourceEvent[]>> {
  const byUser = new Map<string, SourceEvent[]>()
  let rows = 0
  for await (const row of readCsvLines(logonCsv)) {
    rows++
    const [, dateStr, user, pc, activity] = row
    if (!wantedUsers.has(user)) continue
    if (activity !== 'Logon') continue // faqat kirish hodisalari — soat/PC signali uchun yetarli
    const list = byUser.get(user) ?? []
    list.push({ date: new Date(dateStr), pc, resource: 'logon', external: false })
    byUser.set(user, list)
    if (rows % 2_000_000 === 0) console.log(`  ... ${(rows / 1e6).toFixed(1)}M qator o'qildi`)
  }
  console.log(`  logon.csv: jami ${rows} qator o'qildi, ${byUser.size} ta kerakli foydalanuvchi topildi`)
  return byUser
}

/** http.csv: id,date,user,pc,url,content — faqat resurs xilma-xilligi va soat/PC signali uchun */
async function loadHttpForUsers(httpCsv: string, wantedUsers: Set<string>, into: Map<string, SourceEvent[]>): Promise<void> {
  let rows = 0, matched = 0
  for await (const row of readCsvLines(httpCsv)) {
    rows++
    const [, dateStr, user, pc] = row
    if (wantedUsers.has(user)) {
      const list = into.get(user) ?? []
      list.push({ date: new Date(dateStr), pc, resource: 'http', external: false })
      into.set(user, list)
      matched++
    }
    if (rows % 5_000_000 === 0) console.log(`  ... ${(rows / 1e6).toFixed(0)}M qator (http.csv, 14.5 GB — eng katta fayl)`)
  }
  console.log(`  http.csv: jami ${rows} qator o'qildi, ${matched} ta mos hodisa qo'shildi`)
}

/** email.csv: id,date,user,pc,to,cc,bcc,from,size,attachments,content */
async function loadEmailForUsers(emailCsv: string, wantedUsers: Set<string>, into: Map<string, SourceEvent[]>): Promise<void> {
  let rows = 0, matched = 0, externalCount = 0
  for await (const row of readCsvLines(emailCsv)) {
    rows++
    const [, dateStr, user, pc, to, cc, bcc] = row
    if (!wantedUsers.has(user)) continue
    const recipients = `${to};${cc};${bcc}`.split(';').map((s) => s.trim()).filter(Boolean)
    const external = recipients.some((addr) => !addr.toLowerCase().endsWith(`@${COMPANY_DOMAIN}`))
    if (external) externalCount++
    const list = into.get(user) ?? []
    list.push({ date: new Date(dateStr), pc, resource: 'email', external })
    into.set(user, list)
    matched++
  }
  console.log(`  email.csv: jami ${rows} qator o'qildi, ${matched} ta mos hodisa (${externalCount} ta tashqi qabul qiluvchi bilan)`)
}

/**
 * Foydalanuvchining eng ko'p ishlatgan PC'si — OWNER ekvivalenti.
 *
 * MUHIM: bu funksiya boyitilgan yugurishda logon+http+email BIRLASHGAN
 * hodisalar ustida ishlaydi (har uchalasi ham CERT'da o'z `pc` ustuniga
 * ega). Demak "email/http faqat xatti-harakat profilini boyitadi,
 * avtorizatsiya mantig'i o'zgarmaydi" degan ta'rif TO'LIQ TO'G'RI EMAS:
 * qaysi PC "asosiy" (demak qaysi PC "begona"/FOREIGN) ekanligi ham
 * ko'proq ma'lumot asosida qayta hisoblanadi. 3-variantda FP'ning
 * 67 -> 59 ga tushishi shu sabab bilan (aniqroq primaryPc hisoblanishi),
 * behaviorScore o'zgarishi bilan EMAS izohlanishi mumkin — chunki
 * authzAllowed=1 bo'lganda correlate() riskni har doim 1 ga tenglashtiradi
 * va behaviorScore ta'sir qilmaydi (correlation.ts: authzRisk/correlate).
 * PROJECT_CONTEXT.md §15 da bu aniqlashtirilgan.
 */
function primaryPc(events: SourceEvent[]): string {
  const counts = new Map<string, number>()
  for (const e of events) counts.set(e.pc, (counts.get(e.pc) ?? 0) + 1)
  let best = '', bestN = -1
  for (const [pc, n] of counts) if (n > bestN) { best = pc; bestN = n }
  return best
}

/** CERT sanasi format: MM/DD/YYYY HH:mm:ss — soat va hafta kunini ajratadi */
function parts(d: Date): { hour: number; weekday: number } {
  return { hour: d.getHours(), weekday: d.getDay() }
}

/**
 * Trening oynasidagi hodisalardan profil quradi — behaviorProfiler.ts dagi
 * rowsToProfile bilan bir xil mantiq. Endi uch manba (logon/http/email)
 * birlashtirilgan holda keladi — resourceMix endi haqiqiy xilma-xillik
 * ko'rsatadi (bitta 'logon' emas), bu esa "surpriseMap" signalini
 * ma'noli qiladi.
 */
function buildProfile(events: SourceEvent[]): BehaviorProfile {
  const p = emptyProfile()
  const pcCounts = new Map<string, number>()
  const rateByDay = new Map<string, number>()

  for (const e of events) {
    const { hour, weekday } = parts(e.date)
    p.hourHistogram[hour] = (p.hourHistogram[hour] ?? 0) + 1
    p.weekdayHistogram[weekday] = (p.weekdayHistogram[weekday] ?? 0) + 1
    pcCounts.set(e.pc, (pcCounts.get(e.pc) ?? 0) + 1)
    p.resourceMix[e.resource] = (p.resourceMix[e.resource] ?? 0) + 1
    const dayKey = e.date.toISOString().slice(0, 10)
    rateByDay.set(dayKey, (rateByDay.get(dayKey) ?? 0) + 1)
  }

  // MIN_OCCURRENCES ekvivalenti — kamida 2 marta ko'rilgan PC "tanish"
  for (const [pc, n] of pcCounts) if (n >= 2) p.knownIps.push(pc)
  p.knownUserAgents = ['cert-logon'] // CERT da alohida qurilma signali yo'q — doim "tanish"

  p.sampleCount = events.length

  const rates = [...rateByDay.values()]
  if (rates.length > 0) {
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length
    p.reqPerHourMean = mean / 24 // kunlik -> soatlik taxminiy o'rtacha
  }
  return p
}

// ── Bitta sessiyani baholash ─────────────────────────────────────────────────

interface CaseResult { user: string; attack: boolean; signals: LayerSignals; risk: number; alert: boolean; layer: string | null }

function evaluateWindow(
  profile: BehaviorProfile, primary: string, windowEvents: SourceEvent[],
  useEmailAsAuthz: boolean,
): CaseResult['signals'] & { maxAuthz: number; maxBehavior: number } {
  let maxAuthz = 0, maxBehavior = 0
  let anyForeign = false
  let anyExternalEmail = false

  for (const e of windowEvents) {
    if (e.pc !== primary) anyForeign = true
    if (e.resource === 'email' && e.external) anyExternalEmail = true
    const { hour, weekday } = parts(e.date)
    const ev: ObservedEvent = {
      hour, weekday, ip: e.pc, userAgent: 'cert-logon',
      resource: e.resource, reqLastHour: 1,
    }
    const { score } = scoreEvent(profile, ev)
    if (score > maxBehavior) maxBehavior = score
  }

  // CERT da "rad etilgan urinish" tushunchasi yo'q — boshqa xodimning
  // kompyuteridan foydalanish MUVAFFAQIYATLI FOREIGN murojaatga
  // tenglashtiriladi (authzAllowed=1).
  //
  // "Tashqi email" ni HAM shu toifaga qo'shish SINALDI va RAD ETILDI:
  // natija AUC=0.466 berdi (tasodifdan yomon!), chunki bu populyatsiyada
  // email trafigining ~48% tashqi domenga — bu oddiy biznes faoliyati,
  // "begona obyektga muvaffaqiyatli murojaat hech qachon qonuniy emas"
  // degan bizning LMS uchun to'g'ri bo'lgan taxmin bu yerda BUZILDI.
  // --with-email-authz bayrog'i o'sha (yomon) variantni qayta ko'rish
  // uchun saqlangan.
  if (anyForeign || (useEmailAsAuthz && anyExternalEmail)) maxAuthz = 1

  return {
    authzDenied: 0, authzAllowed: maxAuthz, massAccess: false,
    behaviorScore: maxBehavior, privilegedOwners: 0,
    maxAuthz, maxBehavior,
  }
}

// ── Metrikalar (evaluate.ts bilan bir xil) ───────────────────────────────────

interface Confusion { tp: number; fp: number; fn: number; tn: number }
function confusionAt(results: CaseResult[]): Confusion {
  const c: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 }
  for (const r of results) {
    if (r.attack) { if (r.alert) c.tp++; else c.fn++ } else { if (r.alert) c.fp++; else c.tn++ }
  }
  return c
}
function prf(c: Confusion) {
  const precision = c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : 0
  const recall    = c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : 0
  const f1        = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { precision, recall, f1 }
}
function rocAuc(results: CaseResult[]): number {
  const pos = results.filter((r) => r.attack).length
  const neg = results.length - pos
  if (pos === 0 || neg === 0) return NaN
  const thresholds = [...new Set(results.map((r) => r.risk))].sort((a, b) => b - a)
  const pts: Array<{ fpr: number; tpr: number }> = [{ fpr: 0, tpr: 0 }]
  for (const t of thresholds) {
    let tp = 0, fp = 0
    for (const r of results) if (r.risk >= t) { if (r.attack) tp++; else fp++ }
    pts.push({ fpr: fp / neg, tpr: tp / pos })
  }
  pts.push({ fpr: 1, tpr: 1 })
  const sorted = pts.sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr)
  let area = 0
  for (let i = 1; i < sorted.length; i++) area += (sorted[i].fpr - sorted[i - 1].fpr) * (sorted[i].tpr + sorted[i - 1].tpr) / 2
  return area
}

// ── Asosiy oqim ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dir = args.find((a) => a.startsWith('--dir='))?.split('=')[1]
  const asJson = args.includes('--json')
  const useEmailAsAuthz = args.includes('--with-email-authz')
  const log = (...a: unknown[]) => { if (!asJson) console.log(...a) }

  if (!dir) {
    console.error('Ishlatish: --dir=<CERT r4.2 papkasi (logon.csv va answers/ shu yerda yoki ustki papkada)>')
    process.exitCode = 1
    return
  }

  const logonCsv = path.join(dir, 'logon.csv')
  const httpCsv  = path.join(dir, 'http.csv')
  const emailCsv = path.join(dir, 'email.csv')
  const answersDir = fs.existsSync(path.join(dir, 'answers')) ? path.join(dir, 'answers') : path.join(dir, '..', 'answers')

  if (!fs.existsSync(logonCsv)) { console.error(`logon.csv topilmadi: ${logonCsv}`); process.exitCode = 1; return }
  if (!fs.existsSync(path.join(answersDir, 'insiders.csv'))) {
    console.error(`answers/insiders.csv topilmadi: ${answersDir}`); process.exitCode = 1; return
  }
  const useHttp  = fs.existsSync(httpCsv)
  const useEmail = fs.existsSync(emailCsv)
  log(`Boyitish: http.csv ${useHttp ? 'BOR — ishlatiladi' : 'yo\'q — o\'tkazib yuboriladi'}, ` +
      `email.csv ${useEmail ? 'BOR — ishlatiladi' : 'yo\'q — o\'tkazib yuboriladi'}`)
  log(`Tashqi email authz signali sifatida: ${useEmailAsAuthz ? 'YOQILGAN (--with-email-authz)' : "O'CHIQ (standart — tajriba shuni ko'rsatdi: yoqilsa AUC 0.466 ga tushadi)"}`)

  log('\nE1 — TASHQI BENCHMARK: CMU CERT Insider Threat Dataset r4.2\n')

  const insiders = loadInsiders(answersDir)
  log(`Belgilangan insayderlar (r4.2): ${insiders.length}`)

  // Salbiy sinf uchun tasodifiy foydalanuvchi ro'yxati — logon.csv ni bir
  // marta skanerlab, HAR XIL user qiymatlarini yig'ish orqali olinadi.
  const allUsersSeen = new Set<string>()
  const insiderUsers = new Set(insiders.map((i) => i.user))
  log('logon.csv dan barcha foydalanuvchi identifikatorlari yig\'ilmoqda (birinchi o\'tish)...')
  {
    let rows = 0
    for await (const row of readCsvLines(logonCsv)) {
      rows++
      allUsersSeen.add(row[2])
      if (rows % 3_000_000 === 0) log(`  ... ${(rows / 1e6).toFixed(1)}M qator ko'rildi, ${allUsersSeen.size} ta noyob foydalanuvchi`)
    }
    log(`  jami ${rows} qator, ${allUsersSeen.size} ta noyob foydalanuvchi`)
  }

  const benignPool = [...allUsersSeen].filter((u) => !insiderUsers.has(u))
  const rnd = rng(RNG_SEED)
  const negativeUsers = new Set<string>()
  while (negativeUsers.size < Math.min(NEGATIVE_SAMPLE_USERS, benignPool.length)) {
    negativeUsers.add(benignPool[Math.floor(rnd() * benignPool.length)])
  }

  const wantedUsers = new Set([...insiderUsers, ...negativeUsers])
  log(`\nKerakli foydalanuvchilar: ${insiderUsers.size} insayder + ${negativeUsers.size} zararsiz namuna = ${wantedUsers.size}`)
  log('logon.csv ikkinchi marta o\'qilmoqda — faqat kerakli foydalanuvchilar saqlanadi...')

  const byUser = await loadLogonsForUsers(logonCsv, wantedUsers)

  if (useEmail) {
    log('email.csv o\'qilmoqda...')
    await loadEmailForUsers(emailCsv, wantedUsers, byUser)
  }
  if (useHttp) {
    log('http.csv o\'qilmoqda (eng katta fayl — bir necha daqiqa)...')
    await loadHttpForUsers(httpCsv, wantedUsers, byUser)
  }
  // Manbalar turli tartibda qo'shilgan — vaqt bo'yicha saralash oyna
  // kesishmasi (train vs window) to'g'ri ishlashi uchun SHART.
  for (const [user, events] of byUser) {
    events.sort((a, b) => a.date.getTime() - b.date.getTime())
    byUser.set(user, events)
  }

  const results: CaseResult[] = []
  let skippedInsufficient = 0

  // ── Insayder holatlar: har bir belgilangan sessiya uchun bitta CaseResult ──
  for (const ins of insiders) {
    const events = byUser.get(ins.user)
    if (!events || events.length < MIN_SAMPLES + 5) { skippedInsufficient++; continue }
    const sorted = [...events].sort((a, b) => a.date.getTime() - b.date.getTime())
    const trainEvents = sorted.filter((e) => e.date < ins.start)
    const windowEvents = sorted.filter((e) => e.date >= ins.start && e.date <= ins.end)
    if (trainEvents.length < MIN_SAMPLES || windowEvents.length === 0) { skippedInsufficient++; continue }

    const profile = buildProfile(trainEvents)
    const primary = primaryPc(trainEvents)
    const sig = evaluateWindow(profile, primary, windowEvents, useEmailAsAuthz)
    const verdict = correlate(sig)
    results.push({ user: ins.user, attack: true, signals: sig, risk: verdict.risk, alert: verdict.alert, layer: verdict.layer })
  }

  // ── Zararsiz holatlar: har bir tasodifiy foydalanuvchi uchun tasodifiy
  //    N-kunlik "oyna" (insayderlarnikiga o'xshash uzunlikda) ────────────────
  const avgWindowDays = 7
  for (const user of negativeUsers) {
    const events = byUser.get(user)
    if (!events || events.length < MIN_SAMPLES + 5) { skippedInsufficient++; continue }
    const sorted = [...events].sort((a, b) => a.date.getTime() - b.date.getTime())
    const splitIdx = Math.floor(sorted.length * (0.5 + rnd() * 0.3)) // 50-80% oralig'ida bo'linadi
    const trainEvents = sorted.slice(0, splitIdx)
    const windowStart = sorted[splitIdx]?.date
    if (!windowStart || trainEvents.length < MIN_SAMPLES) { skippedInsufficient++; continue }
    const windowEnd = new Date(windowStart.getTime() + avgWindowDays * 86_400_000)
    const windowEvents = sorted.slice(splitIdx).filter((e) => e.date <= windowEnd)
    if (windowEvents.length === 0) { skippedInsufficient++; continue }

    const profile = buildProfile(trainEvents)
    const primary = primaryPc(trainEvents)
    const sig = evaluateWindow(profile, primary, windowEvents, useEmailAsAuthz)
    const verdict = correlate(sig)
    results.push({ user, attack: false, signals: sig, risk: verdict.risk, alert: verdict.alert, layer: verdict.layer })
  }

  log(`\nBaholangan holatlar: ${results.length} (${skippedInsufficient} ta yetarli tarixsizligi sababli o'tkazib yuborildi)`)
  log(`  hujum: ${results.filter((r) => r.attack).length}, zararsiz: ${results.filter((r) => !r.attack).length}`)

  const c = confusionAt(results)
  const m = prf(c)
  const auc = rocAuc(results)

  if (asJson) {
    console.log(JSON.stringify({
      source: 'CMU CERT Insider Threat Test Dataset r4.2',
      doi: '10.1184/R1/12841247',
      totalCases: results.length, confusion: c,
      precision: m.precision, recall: m.recall, f1: m.f1, aucRoc: auc,
      singleThreshold: SINGLE_THRESHOLD, correlatedThreshold: CORRELATED_THRESHOLD,
      negativeSampleUsers: NEGATIVE_SAMPLE_USERS, rngSeed: RNG_SEED,
      results: results.map((r) => ({ user: r.user, attack: r.attack, risk: r.risk, alert: r.alert, layer: r.layer })),
      generatedAt: new Date().toISOString(),
    }, null, 2))
    return
  }

  log(`\n${'='.repeat(78)}`)
  log('NATIJA — CMU CERT r4.2 USTIDA (tashqi, mustaqil ma\'lumot)')
  log('='.repeat(78))
  log(`\n  Confusion matrix:  TP=${c.tp}  FP=${c.fp}  FN=${c.fn}  TN=${c.tn}`)
  log(`  Aniqlik (precision): ${m.precision.toFixed(3)}`)
  log(`  Qamrov (recall):     ${m.recall.toFixed(3)}`)
  log(`  F1:                  ${m.f1.toFixed(3)}`)
  log(`  ROC AUC:              ${isNaN(auc) ? 'hisoblanmadi' : auc.toFixed(3)}`)
  log(`\n  (SINGLE_THRESHOLD=${SINGLE_THRESHOLD}, CORRELATED_THRESHOLD=${CORRELATED_THRESHOLD} — productiondagi bilan bir xil, o'zgartirilmagan)\n`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
