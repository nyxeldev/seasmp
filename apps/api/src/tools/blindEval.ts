/**
 * E2 — KO'R BAHOLASH (blind evaluation).
 *
 * evaluate.ts dagi muammo: hujum va zararsiz ssenariylarni HAM, korrelyatsiya
 * chegaralari/vaznlarini HAM bir xil odam yozgan. Bu aylanma dalil — "tizim
 * o'zi yozgan testni o'tadi" degani, chunki ssenariylar SINGLE_THRESHOLD=0.75
 * kabi ichki qiymatlarni bilib turib moslashtirilgan bo'lishi mumkin edi.
 *
 * Bu skript boshqacha tartibda yozildi:
 *
 *   1. Ssenariylar FAQAT tahdid modeli nuqtai nazaridan tuziladi — "haqiqiy
 *      hujumchi/xodim nima qiladi?" Quyidagi ro'yxatni yozayotganda
 *      correlation.ts yoki behaviorScoring.ts FAYLLARIGA MUROJAAT
 *      QILINMADI — vaznlar, chegaralar bilinmagan holda yozildi.
 *
 *   2. Har bir ssenariy HAQIQIY HTTP so'rovlari bilan ishlab turgan API'ga
 *      yuboriladi (localhost:4000) — sintetik hisoblash yo'q.
 *
 *   3. Natija HAQIQIY Redis signal oynasidan (`readSignals`) va HAQIQIY
 *      qaror funksiyasidan (`correlate`, productiondagi bilan bir xil kod)
 *      o'qiladi. Bu qism ataylab productiondagi funksiyalarni ishlatadi —
 *      maqsad YANGI baholash formulasini o'ylab topish emas, DEPLOY
 *      QILINGAN tizimni o'lchash.
 *
 * MUHIM CHEKLOV — SOAT SIGNALI SINALMAYDI. Server `new Date()` bilan haqiqiy
 * vaqtni ishlatadi, skript esa HTTP orqali soatni sun'iy o'zgartira olmaydi.
 * Shuning uchun quyidagi ssenariylar ATAYLAB vaqtdan mustaqil signallarga
 * tayanadi: notanish IP/qurilma, avtorizatsiya (FOREIGN), qamrov, chastota.
 * Bu haqiqiy cheklov, yashirilmaydi — natijalar shu bilan birga o'qilishi
 * kerak.
 *
 * Talab:
 *   - API ishlab turishi kerak
 *   - db:seed (asosiy) VA db:seed:demo (14 ssenariydan ~9 tasi
 *     `*@demo.seasmp.uz` hisoblaridan foydalanadi — ular FAQAT
 *     seed-demo.ts tomonidan yaratiladi; bu bajarilmasa o'sha ssenariylar
 *     `makeActor()` login xatosi bilan JIM o'tkazib yuboriladi — pastdagi
 *     "kutilgan N" tekshiruvi buni ochiq ko'rsatadi)
 *   - db:seed:history va POST /v1/security/profiles/refresh bajarilgan
 *     bo'lishi kerak (aks holda barcha aktorlar uchun 2-qatlam signalsiz)
 *   - RATE_LIMIT_MAX standart 100/min dan yuqori bo'lishi tavsiya etiladi
 *     (barcha ssenariylar bitta IP — 127.0.0.1 — dan yuboriladi va ketma-ket
 *     ishlaydi; past chegarada Fastify o'zi 429 bera boshlaydi, bu esa
 *     aniqlash tizimiga aloqasi yo'q shovqin bo'lardi)
 *
 * PROFIL IFLOSLANISHI — MUHIM. Birinchi yugurishda topildi: skriptning
 * O'ZI yaratgan HTTP trafigi (masalan 130 so'rovlik "ommaviy chiqarish"
 * ssenariysi) audit_logs ga yozilib qoladi va KEYINGI `profiles/refresh` da
 * o'sha aktorning me'yoriga QO'SHILIB KETADI — reqPerHourMean sun'iy
 * shishadi. Aynan shu sabab bilan ikkinchi yugurishda "Ommaviy ma'lumot
 * chiqarish" ssenariysi ANIQLANMAY QOLGAN edi (o'lchandi: mean 8.0/soat,
 * demak MASS_ACCESS_FLOOR=160, 130 ta so'rov yetmadi — mean tozalangandan
 * keyin 3.4/soat, chegara 100 ga tushdi va to'g'ri aniqlandi).
 *
 * Shuning uchun skript oxirida O'ZI yaratgan audit yozuvlarini tozalaydi
 * (`--no-cleanup` bilan o'chirish mumkin, ammo keyingi yugurish oldidan
 * qo'lda `POST /v1/security/profiles/refresh` bajarishdan oldin
 * ifloslanishni tekshiring).
 *
 * Ishlatish:  npm run eval:blind --workspace=apps/api
 *             npm run eval:blind --workspace=apps/api -- --json > natija.json
 */
import { prisma } from '../config/prisma'
import { redis } from '../config/redis'
import { readSignals, clearSignals } from '../services/signalWindow'
import { correlate, type LayerSignals, type CorrelationVerdict } from '../services/correlation'

const API = process.env.EVAL_API_URL ?? 'http://localhost:4000'

// ── Yordamchi HTTP funksiyalar ───────────────────────────────────────────────

interface Ctx {
  adminToken: string
  fetchAs: (email: string, password: string, opts?: { ua?: string; ip?: string }) => Promise<Actor>
}

interface Actor {
  email: string
  id: string
  token: string
  get:   (path: string) => Promise<Response>
  post:  (path: string, body: unknown) => Promise<Response>
  patch: (path: string, body: unknown) => Promise<Response>
}

async function loginRaw(email: string, password: string, ua: string): Promise<{ token: string; id: string } | null> {
  const res = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': ua },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) return null
  const json: any = await res.json()
  const token = json?.data?.accessToken
  if (!token) return null
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  return { token, id: payload.sub }
}

/**
 * Sun'iy "notanish qurilma" belgisi uchun X-Forwarded-For ataylab
 * YUBORILMAYDI — Fastify trustProxy yoqilmagan, server baribir real
 * 127.0.0.1 ni ko'radi. Notanish qurilma faqat User-Agent orqali
 * simulyatsiya qilinadi (profilda ma'lum bo'lmagan UA), bu esa haqiqiy
 * ishlab chiqarishdagi "notanish brauzer/qurilma" holatiga mos keladi.
 */
async function makeActor(email: string, password: string, ua: string): Promise<Actor | null> {
  const auth = await loginRaw(email, password, ua)
  if (!auth) return null
  const headers = { authorization: `Bearer ${auth.token}`, 'user-agent': ua, 'Content-Type': 'application/json' }
  return {
    email, id: auth.id, token: auth.token,
    get:   (path) => fetch(`${API}${path}`, { headers }),
    post:  (path, body) => fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
    patch: (path, body) => fetch(`${API}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) }),
  }
}

const FAMILIAR_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0'
const FOREIGN_UA  = 'Mozilla/5.0 (Linux; Android 15; SM-Foreign) Chrome/141.0 Mobile'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Ssenariy ta'rifi ──────────────────────────────────────────────────────────

interface ScenarioResult {
  name: string
  attack: boolean
  actor: string
  signals: LayerSignals
  verdict: CorrelationVerdict
  httpErrors: number
  note: string
}

interface Scenario {
  name: string
  attack: boolean
  /** Threat-model izohi — nega bu hujum yoki nega bu zararsiz */
  rationale: string
  email: string
  password: string
  run: (actor: Actor, admin: Actor) => Promise<string>
}

// ─────────────────────────────────────────────────────────────────────────────
// SSENARIYLAR — quyidagi ro'yxat yozilganda correlation.ts va
// behaviorScoring.ts FAYLLARI OCHILMADI. Har biri tahdid modeli asosida:
// haqiqiy hujumchi yoki xodim shu vaziyatda nima qilardi?
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIOS: Scenario[] = [

  // ── HUJUM ────────────────────────────────────────────────────────────────
  {
    name: 'Kompromentatsiyadan keyingi keng razvedka',
    attack: true,
    rationale: 'Hisob o\'g\'irlangandan keyin hujumchi darhol ko\'p sonli begona ' +
      'foydalanuvchi profilini ochib chiqadi — qimmatli ma\'lumot qidiradi. ' +
      'Notanish qurilma + keng qamrov, imtiyozli hisob.',
    email: 'superadmin@seasmp.uz', password: 'Admin@1234',
    run: async (actor) => {
      const list = await actor.get('/v1/users?role=STUDENT&limit=40')
      const json: any = await list.json()
      const ids: string[] = (json.data ?? []).map((u: any) => u.id)
      for (const id of ids) { await actor.get(`/v1/users/${id}`); await sleep(40) }
      return `${ids.length} ta talaba profili ochildi`
    },
  },
  {
    name: 'IDOR paypaslash',
    attack: true,
    rationale: 'Hujumchi ID\'larni ketma-ket sinab ko\'radi — API qanday ' +
      'javob berishini bilish uchun. Aksariyati rad etiladi kutiladi.',
    email: 'teacher5@demo.seasmp.uz', password: 'Teacher@1234',
    run: async (actor, admin) => {
      const enr: any = await admin.get('/v1/enrollments?limit=10').then((r) => r.json())
      let denied = 0
      for (const e of enr.data ?? []) {
        const r = await actor.get(`/v1/enrollments/${e.id}`)
        if (r.status === 403 || r.status === 404) denied++
        await sleep(60)
      }
      return `${denied}/${(enr.data ?? []).length} rad etildi`
    },
  },
  {
    name: 'Begona kursning bahosini o\'qish',
    attack: true,
    rationale: 'O\'qituvchi o\'ziga tegishli bo\'lmagan kursning baho ' +
      'ma\'lumotlariga notanish qurilmadan murojaat qiladi — vakolat doirasidan ' +
      'chetga chiqish urinishi.',
    email: 'teacher6@demo.seasmp.uz', password: 'Teacher@1234',
    run: async (actor, admin) => {
      const courses: any = await admin.get('/v1/courses?limit=13').then((r) => r.json())
      const me: any = await actor.get('/v1/users/me').then((r) => r.json())
      const foreign = (courses.data ?? []).filter((c: any) => c.teacherId !== me.data.id).slice(0, 5)
      let touched = 0
      for (const c of foreign) {
        const asm: any = await admin.get(`/v1/assessments/course/${c.id}`).then((r) => r.json())
        const a0 = (asm.data ?? [])[0]
        if (a0) { await actor.get(`/v1/assessments/${a0.id}/grades`); touched++; await sleep(60) }
      }
      return `${touched} ta begona kurs bahosiga murojaat`
    },
  },
  {
    name: 'Ommaviy ma\'lumot chiqarish (chastota portlashi)',
    attack: true,
    rationale: 'Xodim ish tashlashdan oldin yoki tashqi buyurtma bilan ' +
      'ma\'lumotni ommaviy ko\'chiradi — qisqa vaqtda juda ko\'p so\'rov, ' +
      'odatdagi ishidan tashqari.',
    email: 'student45@demo.seasmp.uz', password: 'Student@1234',
    run: async (actor) => {
      let ok = 0
      for (let i = 0; i < 130; i++) {
        const r = await actor.get('/v1/courses?limit=5')
        if (r.ok) ok++
      }
      return `${ok}/130 so'rov muvaffaqiyatli`
    },
  },
  {
    name: 'Qo\'pol kuch, keyin muvaffaqiyatli kirish va razvedka',
    attack: true,
    rationale: 'Parol tanlash orqali kirilgan hisob — kirishdan so\'ng darhol ' +
      'g\'ayrioddiy faollik: ko\'p sonli boshqa foydalanuvchiga murojaat.',
    email: 'teacher4@demo.seasmp.uz', password: 'Teacher@1234',
    run: async (actor, admin) => {
      // Diqqat: haqiqiy qo'pol-kuch (10+ marta) IP ni bloklab qo'yadi va
      // TO'G'RI kirishning o'zini imkonsiz qilardi — shuning uchun bu yerda
      // faqat ozgina (3 marta) noto'g'ri urinish qilinadi, keyin haqiqiy
      // login orqali davom etiladi.
      for (let i = 0; i < 3; i++) {
        await fetch(`${API}/v1/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'teacher4@demo.seasmp.uz', password: 'notmypassword' }),
        })
        await sleep(80)
      }
      const list: any = await admin.get('/v1/users?role=STUDENT&limit=20').then((r) => r.json())
      for (const u of list.data ?? []) { await actor.get(`/v1/users/${u.id}`); await sleep(40) }
      return `3 ta noto'g'ri urinish + ${(list.data ?? []).length} ta razvedka`
    },
  },
  {
    name: 'Vakolatdan tashqari resurslarga sayohat',
    attack: true,
    rationale: 'O\'qituvchi hisobi to\'satdan o\'z rolига oid bo\'lmagan ' +
      'resurslarga (xavfsizlik, foydalanuvchi boshqaruvi) qiziqish bildiradi — ' +
      'odatiy resurs aralashmasidan chetga chiqish.',
    email: 'teacher2@demo.seasmp.uz', password: 'Teacher@1234',
    run: async (actor) => {
      const r1 = await actor.get('/v1/users?limit=15')
      await sleep(60)
      const r2 = await actor.get('/v1/users?limit=15&page=2')
      return `resurs so'rovlari: ${r1.status}, ${r2.status}`
    },
  },
  {
    name: 'Imtiyozli hisobdan keng qamrovli ko\'rik',
    attack: true,
    rationale: 'Imtiyozli hisob (admin) notanish qurilmadan juda ko\'p ' +
      'sonli turli foydalanuvchiga tez ketma-ketlikda murojaat qiladi — ' +
      'oddiy kundalik ishdan farqli keng qamrov.',
    email: 'admin@seasmp.uz', password: 'Admin@1234',
    run: async (actor) => {
      const list: any = await actor.get('/v1/users?role=STUDENT&limit=35').then((r) => r.json())
      for (const u of list.data ?? []) { await actor.get(`/v1/users/${u.id}`); await sleep(35) }
      return `${(list.data ?? []).length} ta foydalanuvchi ko'rildi`
    },
  },

  // ── ZARARSIZ ─────────────────────────────────────────────────────────────
  {
    name: 'Sinfni bir o\'tirishda baholash',
    attack: false,
    rationale: 'O\'qituvchi o\'z kursining barcha talabalariga baho qo\'yadi — ' +
      'ko\'p yozuv, lekin FAQAT o\'z resurslari, oddiy ish kunidagi vazifa.',
    email: 'teacher1@demo.seasmp.uz', password: 'Teacher@1234',
    run: async (actor) => {
      const me: any = await actor.get('/v1/users/me').then((r) => r.json())
      const courses: any = await actor.get(`/v1/courses?limit=50`).then((r) => r.json())
      const mine = (courses.data ?? []).find((c: any) => c.teacherId === me.data.id)
      if (!mine) return 'o\'z kursi topilmadi'
      const asm: any = await actor.get(`/v1/assessments/course/${mine.id}`).then((r) => r.json())
      const a0 = (asm.data ?? [])[0]
      if (!a0) return 'baholash topilmadi'
      const enr: any = await actor.get(`/v1/enrollments?courseId=${mine.id}&limit=30`).then((r) => r.json())
      let graded = 0
      for (const e of enr.data ?? []) {
        await actor.post(`/v1/assessments/${a0.id}/grades`, { enrollmentId: e.id, score: 70 + Math.floor(Math.random() * 25) })
        graded++
        await sleep(50)
      }
      return `${graded} ta talabaga baho qo'yildi (o'z kursi)`
    },
  },
  {
    name: 'Kundalik foydalanuvchi boshqaruvi',
    attack: false,
    rationale: 'Admin kichik sonli talaba profilini ko\'rib chiqadi — ' +
      'kundalik, kam hajmli, o\'z odatidagi ish.',
    email: 'superadmin@seasmp.uz', password: 'Admin@1234',
    // Diqqat: superadmin yuqorida hujum ssenariysida ham ishlatilgan —
    // bu yerda BOSHQA imtiyozli hisob yo'qligi sababli takroran ishlatiladi,
    // lekin signal oynasi orasida tozalanadi (resetActorState orqali).
    run: async (actor) => {
      const list: any = await actor.get('/v1/users?role=STUDENT&limit=6').then((r) => r.json())
      for (const u of list.data ?? []) { await actor.get(`/v1/users/${u.id}`); await sleep(300) }
      return `${(list.data ?? []).length} ta profil ko'rildi (kam hajm, sekin)`
    },
  },
  {
    name: 'Oddiy talaba ko\'rishi',
    attack: false,
    rationale: 'Talaba o\'z kurslari va davomatini ko\'radi — eng oddiy, ' +
      'kundalik holat.',
    email: 'student10@demo.seasmp.uz', password: 'Student@1234',
    run: async (actor) => {
      await actor.get('/v1/enrollments?limit=10')
      await sleep(80)
      await actor.get('/v1/attendance?limit=20')
      return 'o\'z kurslari va davomati ko\'rildi'
    },
  },
  {
    name: 'Kurs tahlilini bir necha marta yangilash',
    attack: false,
    rationale: 'O\'qituvchi dars oldidan o\'z kursi analitikasini ' +
      'qayta-qayta tekshiradi — kam sonli, faqat o\'z resursiga oid.',
    email: 'teacher3@demo.seasmp.uz', password: 'Teacher@1234',
    run: async (actor) => {
      const me: any = await actor.get('/v1/users/me').then((r) => r.json())
      const courses: any = await actor.get(`/v1/courses?limit=50`).then((r) => r.json())
      const mine = (courses.data ?? []).find((c: any) => c.teacherId === me.data.id)
      if (!mine) return 'o\'z kursi topilmadi'
      for (let i = 0; i < 4; i++) { await actor.get(`/v1/analytics/courses/${mine.id}`); await sleep(200) }
      return 'o\'z kursi analitikasi 4 marta ko\'rildi'
    },
  },
  {
    name: 'Yangi qurilmadan oddiy kirish',
    attack: false,
    rationale: 'Foydalanuvchi yangi telefondan yoki tozalangan brauzerdan ' +
      'kiradi — bu qonuniy, kundalik hodisa, lekin notanish qurilma signali ' +
      'beradi. FAQAT o\'z resurslariga past chastotada murojaat qiladi.',
    email: 'student60@demo.seasmp.uz', password: 'Student@1234',
    run: async (actor) => {
      await actor.get('/v1/users/me')
      await sleep(150)
      await actor.get('/v1/enrollments?limit=5')
      return 'yangi qurilmadan o\'z profilini ko\'rdi'
    },
  },
  {
    name: 'QR orqali davomat generatsiyasi',
    attack: false,
    rationale: 'O\'qituvchi dars boshida QR token yaratadi — rolga mos, ' +
      'oddiy, kunlik amal.',
    email: 'teacher1@seasmp.uz', password: 'Teacher@1234',
    run: async (actor) => {
      const me: any = await actor.get('/v1/users/me').then((r) => r.json())
      const courses: any = await actor.get(`/v1/courses?limit=50`).then((r) => r.json())
      const mine = (courses.data ?? []).find((c: any) => c.teacherId === me.data.id)
      if (!mine) return 'o\'z kursi topilmadi'
      const d = new Date(Date.now() + (200 + Math.floor(Math.random() * 9000)) * 86_400_000)
      const r = await actor.post('/v1/attendance/qr/generate', { courseId: mine.id, lessonDate: d.toISOString().slice(0, 10) })
      return `QR generatsiya: ${r.status}`
    },
  },
  {
    name: 'O\'z profilini yangilash',
    attack: false,
    rationale: 'Talaba o\'z ismini/avatarini yangilaydi — ijobiy, oddiy amal.',
    email: 'student2@seasmp.uz', password: 'Student@1234',
    run: async (actor) => {
      const r = await actor.patch('/v1/users/me', { firstName: 'Test' })
      return `profil yangilash: ${r.status}`
    },
  },
]

// ── Bajarish va o'lchash ──────────────────────────────────────────────────────

async function resetActorState(userId: string): Promise<void> {
  await clearSignals(userId)
  for (const layer of ['AUTHORIZATION', 'BEHAVIOR', 'CORRELATED']) {
    await redis.del(`corr_alert:${userId}:${layer}`)
  }
  const bucket = Math.floor(Date.now() / 3_600_000)
  await redis.del(`req_hour:${userId}:${bucket}`)
}

async function runScenario(admin: Actor, sc: Scenario): Promise<ScenarioResult | null> {
  const actor = await makeActor(sc.email, sc.password, sc.attack ? FOREIGN_UA : FAMILIAR_UA)
  if (!actor) {
    console.log(`  [${sc.name}] kirish muvaffaqiyatsiz — o'tkazib yuborildi`)
    return null
  }
  await resetActorState(actor.id)
  await sleep(300)

  let note: string
  try {
    note = await sc.run(actor, admin)
  } catch (err) {
    note = `xato: ${(err as Error).message}`
  }

  // onResponse hooki javobdan KEYIN ishlaydi — bazaga yozilishga ulgursin
  await sleep(1500)

  const signals = await readSignals(actor.id)
  const verdict = correlate(signals)

  return { name: sc.name, attack: sc.attack, actor: sc.email, signals, verdict, httpErrors: 0, note }
}

// ── Baholash metrikalari ─────────────────────────────────────────────────────

interface Confusion { tp: number; fp: number; fn: number; tn: number }

function confusionAt(results: ScenarioResult[]): Confusion {
  const c: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 }
  for (const r of results) {
    if (r.attack) { if (r.verdict.alert) c.tp++; else c.fn++ }
    else          { if (r.verdict.alert) c.fp++; else c.tn++ }
  }
  return c
}

function prf(c: Confusion): { precision: number; recall: number; f1: number } {
  const precision = c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : 0
  const recall    = c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : 0
  const f1        = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { precision, recall, f1 }
}

/** Trapetsiya usuli bilan ROC AUC — evaluate.ts dagi bilan bir xil mantiq */
function rocAuc(results: ScenarioResult[]): number {
  const pos = results.filter((r) => r.attack).length
  const neg = results.length - pos
  if (pos === 0 || neg === 0) return NaN
  const thresholds = [...new Set(results.map((r) => r.verdict.risk))].sort((a, b) => b - a)
  const points: Array<{ fpr: number; tpr: number }> = [{ fpr: 0, tpr: 0 }]
  for (const t of thresholds) {
    let tp = 0, fp = 0
    for (const r of results) if (r.verdict.risk >= t) { if (r.attack) tp++; else fp++ }
    points.push({ fpr: fp / neg, tpr: tp / pos })
  }
  points.push({ fpr: 1, tpr: 1 })
  const sorted = points.sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr)
  let area = 0
  for (let i = 1; i < sorted.length; i++) {
    area += (sorted[i].fpr - sorted[i - 1].fpr) * (sorted[i].tpr + sorted[i - 1].tpr) / 2
  }
  return area
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json')
  const log = (...args: unknown[]) => { if (!asJson) console.log(...args) }

  log(`\nE2 — KO'R BAHOLASH (${API})\n`)
  log(`${SCENARIOS.length} ta ssenariy: ${SCENARIOS.filter((s) => s.attack).length} hujum, ` +
      `${SCENARIOS.filter((s) => !s.attack).length} zararsiz\n`)

  const health = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false)
  if (!health) { console.error(`API ishlamayapti (${API})`); process.exitCode = 1; return }

  const admin = await makeActor('admin@seasmp.uz', 'Admin@1234', FAMILIAR_UA)
  if (!admin) { console.error('Admin bilan kirib bo\'lmadi'); process.exitCode = 1; return }
  await resetActorState(admin.id)

  const results: ScenarioResult[] = []
  const skipped: string[] = []
  for (const sc of SCENARIOS) {
    const r = await runScenario(admin, sc)
    if (r) {
      results.push(r)
      log(
        `  ${r.attack ? 'HUJUM ' : 'ZARARS'} ${r.verdict.alert ? '⚠ ' : '  '}` +
        `risk=${r.verdict.risk.toFixed(4)} [${r.verdict.layer ?? '-'}]`.padEnd(28),
        r.name.padEnd(46), `(${r.actor})`,
      )
      log(`         ↳ ${r.note}`)
    } else {
      skipped.push(sc.name)
    }
    await sleep(500)
  }

  // Kirish muvaffaqiyatsiz bo'lgan ssenariylar JIM o'tkazib yuborilishi
  // mumkin edi (masalan seed-demo.ts bajarilmagan bo'lsa) — bu esa N'ni
  // kichraytirib, ogohlantirishsiz boshqa tarkibli natija berardi. Shuning
  // uchun bu holat endi hech qachon jim qoldirilmaydi.
  if (skipped.length > 0) {
    console.warn(
      `\n  OGOHLANTIRISH: ${skipped.length}/${SCENARIOS.length} ta ssenariy o'tkazib yuborildi ` +
      `(kirish muvaffaqiyatsiz — ehtimol "npm run db:seed:demo --workspace=apps/api" bajarilmagan):`,
    )
    for (const name of skipped) console.warn(`    - ${name}`)
    console.warn(`  Natija (N=${results.length}) TO'LIQ 14 ta ssenariy asosida EMAS.\n`)
  }

  const c = confusionAt(results)
  const m = prf(c)
  const auc = rocAuc(results)

  if (asJson) {
    console.log(JSON.stringify({
      apiUrl: API, totalScenarios: results.length, definedScenarios: SCENARIOS.length, skipped,
      confusion: c, precision: m.precision, recall: m.recall, f1: m.f1, aucRoc: auc,
      results: results.map((r) => ({
        name: r.name, attack: r.attack, actor: r.actor, note: r.note,
        risk: r.verdict.risk, layer: r.verdict.layer, alert: r.verdict.alert,
        signals: r.signals,
      })),
      generatedAt: new Date().toISOString(),
    }, null, 2))
    return
  }

  log(`\n${'='.repeat(78)}`)
  log('NATIJA — HAQIQIY, DEPLOY QILINGAN TIZIM USTIDA')
  log('='.repeat(78))
  log(`\n  Confusion matrix:  TP=${c.tp}  FP=${c.fp}  FN=${c.fn}  TN=${c.tn}`)
  log(`  Aniqlik (precision): ${m.precision.toFixed(3)}`)
  log(`  Qamrov (recall):     ${m.recall.toFixed(3)}`)
  log(`  F1:                  ${m.f1.toFixed(3)}`)
  log(`  ROC AUC:              ${isNaN(auc) ? 'hisoblanmadi' : auc.toFixed(3)}`)

  log('\n  Noto\'g\'ri baholanganlar:')
  for (const r of results) {
    if (r.attack && !r.verdict.alert) log(`    O'TKAZIB YUBORILDI (FN): ${r.name} — ${r.note}`)
    if (!r.attack && r.verdict.alert) log(`    YOLG'ON ISHORA (FP):    ${r.name} — ${r.note}`)
  }

  log('\n  DIQQAT — soat signali bu testda ISHTIROK ETMAYDI (server real vaqtdan')
  log('  foydalanadi, skript uni boshqara olmaydi). Natija faqat quyidagi')
  log('  signallarni sinaydi: avtorizatsiya (FOREIGN), notanish IP/qurilma,')
  log('  qamrov, chastota. Bu evaluate.ts dagi stenddan KICHIKROQ qamrov —')
  log(`  N=${results.length} ssenariy, uchta yirik ilmiy ishdagidek yuzlab emas. Pilot`)
  log('  hajmdagi, lekin HAQIQIY tizim ustidagi natija.\n')

  if (!process.argv.includes('--no-cleanup')) {
    // SEED bilan TAMG'ALANMAGAN barcha audit yozuvi — bular faqat HAQIQIY
    // HTTP trafigidan (jumladan shu skriptning o'zidan) kelib chiqadi, chunki
    // db:seed:history yozgan qatorlar har doim newData.seed='history' bilan
    // belgilanadi. Ularni olib tashlash profilni tozalaydi, lekin bu skript
    // ATAYLAB boshqa vositalar (masalan demo:behavior) qoldirgan iflosni ham
    // tozalaydi — bu maqsadga muvofiq: sinov muhiti har doim toza qolishi
    // kerak.
    const cleaned = await prisma.$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE new_data->>'seed' IS NULL`,
    )
    log(`  (tozalash: ${cleaned} ta o'zi yaratgan audit yozuvi o'chirildi — keyingi`)
    log('  yugurishdan oldin profiles/refresh qayta bajarilishi tavsiya etiladi)\n')
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => {
    await prisma.$disconnect()
    redis.disconnect()
  })
