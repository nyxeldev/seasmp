/**
 * 2-qatlam uchun xatti-harakat tarixi.
 *
 * Nega kerak: xatti-harakat qatlami har bir foydalanuvchining O'Z me'yoriga
 * qaraydi, me'yor esa `audit_logs` dan quriladi — 30 kunlik oyna va kamida
 * MIN_SAMPLES (50) kuzatuv kerak. Toza o'rnatishda bunday tarix yo'q, shuning
 * uchun `profiles/refresh` hamma foydalanuvchini "yetarli ma'lumot yo'q" deb
 * o'tkazib yuboradi va 2-qatlam jim qoladi. Jim qolgan 2-qatlam esa
 * korrelyatsiyani ham o'ldiradi: CORRELATED hukm hech qachon chiqmaydi.
 *
 * Ya'ni ishning asosiy gipotezasi jonli tizimda umuman namoyish qilinmasdi —
 * faqat `src/tools/evaluate.ts` stendida. Bu skript o'sha bo'shliqni yopadi.
 *
 * Ma'lumot ATAYLAB bir xil emas: har rolning o'z soatlari, o'z IP va
 * qurilmalari, o'z resurs aralashmasi bor. Bitta admin ataylab tungi
 * ishlovchi qilingan — "soat 03:00" hamma uchun bir xil shubhali emasligini
 * aynan shu ko'rsatadi, gipotezaning yarmi shunda.
 *
 * Ishlatish:  npm run db:seed:history --workspace=apps/api
 * DIQQAT: avval shu skript yozgan yozuvlarni o'chiradi, boshqasiga tegmaydi.
 */
import { PrismaClient, type AuditAction, type AccessRelation } from '@prisma/client'

const prisma = new PrismaClient()

// ── Takrorlanadigan tasodifiylik ─────────────────────────────────────────────
let seed = 20260927
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo)
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1))

/** Bu skript yozgan yozuvlarni belgilaydigan tamg'a */
const TAG = { seed: 'history' } as const

/** Profil oynasi bilan bir xil bo'lishi kerak (behaviorProfiler.WINDOW_DAYS) */
const WINDOW_DAYS = 30

/** Toshkent vaqti UTC+5 — audit yozuvlari UTC da saqlanadi */
const TASHKENT_OFFSET_HOURS = 5

interface Persona {
  /** Odatdagi faol soatlar (Toshkent vaqti) */
  hours: number[]
  /** Hafta kunlari: 1=Dushanba ... 0=Yakshanba */
  weekdays: number[]
  /** Qaysi resurslarga qanday nisbatda murojaat qiladi */
  resources: Array<[string, number]>
  /** Kuniga nechta faol soat */
  activeHoursPerDay: [number, number]
  /** Faol soatda nechta so'rov */
  reqPerHour: [number, number]
  /** Kunlarning qancha ulushida umuman faol */
  activeDayRate: number
}

/**
 * Mahalliy manzil har bir foydalanuvchining tanish IP lari qatoriga kiradi.
 *
 * Sababi amaliy: namoyish va qo'lda sinov localhost dan qilinadi, Fastify esa
 * (trustProxy yoqilmagan holda) `127.0.0.1` ni ko'radi. Tarix faqat 10.0.x.x
 * dan iborat bo'lsa, HAR BIR demo so'rovi NEW_IP bo'lib chiqadi va 0.45 vazn
 * bilan balni shishtiradi — o'shanda qaysi signal haqiqatan ishlaganini
 * ajratib bo'lmaydi.
 */
const LOCAL_IP = '127.0.0.1'

/** Tarixning qancha ulushi mahalliy manzildan kelgan deb yoziladi */
const LOCAL_IP_SHARE = 0.18

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/143.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/18.2',
  'Mozilla/5.0 (Linux; Android 15) Chrome/141.0 Mobile',
]

function studentPersona(): Persona {
  return {
    hours: [9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21],
    weekdays: [1, 2, 3, 4, 5, 6],
    resources: [['courses', 5], ['enrollments', 4], ['attendance', 3], ['assessments', 3], ['users', 1]],
    activeHoursPerDay: [1, 3],
    reqPerHour: [2, 5],
    activeDayRate: 0.6,
  }
}

function teacherPersona(): Persona {
  return {
    hours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
    weekdays: [1, 2, 3, 4, 5],
    resources: [['courses', 5], ['attendance', 5], ['assessments', 4], ['grades', 4], ['enrollments', 3]],
    activeHoursPerDay: [2, 5],
    reqPerHour: [3, 7],
    activeDayRate: 0.8,
  }
}

function adminPersona(): Persona {
  return {
    hours: [9, 10, 11, 12, 14, 15, 16, 17, 18],
    weekdays: [1, 2, 3, 4, 5],
    resources: [['users', 5], ['courses', 3], ['analytics', 3], ['enrollments', 2], ['attendance', 2]],
    activeHoursPerDay: [2, 4],
    reqPerHour: [3, 6],
    activeDayRate: 0.85,
  }
}

/**
 * Tungi administrator — ataylab qo'shilgan.
 *
 * Eski tizimda "soat 0-5 da kirish" hamma uchun HIGH ogohlantirish edi
 * (securityMonitor.checkUnusualHour). Bu persona shuni ko'rsatadi: ayni
 * soat bir odam uchun me'yor, boshqasi uchun anomaliya. Profil qurilgandan
 * keyin uning tungi kirishi ball olmaydi, kunduzgi adminniki esa oladi.
 */
function nightAdminPersona(): Persona {
  return {
    hours: [21, 22, 23, 0, 1, 2, 3],
    weekdays: [1, 2, 3, 4, 5, 6, 0],
    resources: [['users', 4], ['analytics', 4], ['courses', 2], ['enrollments', 2]],
    activeHoursPerDay: [2, 4],
    reqPerHour: [3, 6],
    activeDayRate: 0.75,
  }
}

function personaFor(role: string, isNightOwl: boolean): Persona {
  if (isNightOwl) return nightAdminPersona()
  if (role === 'TEACHER') return teacherPersona()
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return adminPersona()
  return studentPersona()
}

/** Vaznli tanlov: resurs aralashmasi tekis bo'lmasligi uchun */
function weightedPick(pairs: Array<[string, number]>): string {
  const total = pairs.reduce((a, [, w]) => a + w, 0)
  let x = rnd() * total
  for (const [k, w] of pairs) {
    x -= w
    if (x <= 0) return k
  }
  return pairs[pairs.length - 1][0]
}

/** Toshkentdagi (kun, soat) ni UTC vaqtga aylantiradi */
function utcFrom(dayOffset: number, tashkentHour: number, minute: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - dayOffset)
  d.setUTCHours(tashkentHour - TASHKENT_OFFSET_HOURS, minute, Math.floor(rnd() * 60), 0)
  return d
}

/** Rolga qarab munosabat: admin PRIVILEGED, qolganlari o'z obyektida */
function relationFor(role: string): AccessRelation {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return 'PRIVILEGED'
  if (role === 'TEACHER') return 'CUSTODIAN'
  return 'OWNER'
}

interface Row {
  userId: string
  action: AuditAction
  resource: string
  ipAddress: string
  userAgent: string
  httpMethod: string
  path: string
  statusCode: number
  durationMs: number
  accessRelation: AccessRelation
  createdAt: Date
  newData: typeof TAG
}

function generateForUser(
  userId: string, role: string, isNightOwl: boolean,
): Row[] {
  const p = personaFor(role, isNightOwl)
  const rows: Row[] = []

  // Har foydalanuvchining o'z IP va qurilmasi. Ikkinchisi ba'zilarida bor —
  // "ishdan va uydan" holati; MIN_OCCURRENCES (3) dan ko'p uchrashi kerak,
  // aks holda profilga kirmaydi va keyinchalik yolg'on anomaliya beradi.
  const primaryIp = `10.0.${intBetween(1, 6)}.${intBetween(10, 250)}`
  const secondIp  = rnd() < 0.35 ? `78.40.${intBetween(1, 250)}.${intBetween(1, 250)}` : null
  const primaryUa = pick(UA_POOL)
  const secondUa  = rnd() < 0.3 ? pick(UA_POOL.filter((u) => u !== primaryUa)) : null

  const relation = relationFor(role)

  for (let day = WINDOW_DAYS; day >= 1; day--) {
    const when = utcFrom(day, 12, 0)
    const dow = when.getUTCDay()
    if (!p.weekdays.includes(dow)) continue
    if (rnd() > p.activeDayRate) continue

    const hoursToday = intBetween(p.activeHoursPerDay[0], p.activeHoursPerDay[1])
    const chosen = new Set<number>()
    for (let i = 0; i < hoursToday; i++) chosen.add(pick(p.hours))

    for (const hour of chosen) {
      const n = intBetween(p.reqPerHour[0], p.reqPerHour[1])
      for (let i = 0; i < n; i++) {
        const resource = weightedPick(p.resources)
        rows.push({
          userId,
          action: 'ACCESS' as AuditAction,
          resource,
          ipAddress: rnd() < LOCAL_IP_SHARE
            ? LOCAL_IP
            : (secondIp && rnd() < 0.2 ? secondIp : primaryIp),
          userAgent: secondUa && rnd() < 0.18 ? secondUa : primaryUa,
          httpMethod: 'GET',
          path: `/v1/${resource}`,
          statusCode: 200,
          durationMs: Math.round(between(3, 45)),
          accessRelation: relation,
          createdAt: utcFrom(day, hour, intBetween(0, 59)),
          newData: TAG,
        })
      }
    }
  }
  return rows
}

async function main(): Promise<void> {
  console.log('\n🌱 Xatti-harakat tarixi yaratilmoqda...\n')

  const removed = await prisma.auditLog.deleteMany({
    where: { newData: { equals: TAG as any } },
  })
  if (removed.count > 0) console.log(`   eski tarix o'chirildi (${removed.count} yozuv)`)

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true, role: true },
    orderBy: { email: 'asc' },
  })

  // Tungi admin qat'iy tanlanadi: ro'yxatdagi BIRINCHI admin. Tasodif emas —
  // namoyish skripti uni nomi bilan topa olishi kerak.
  const admins = users.filter((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN')
  const nightOwlId = admins.length > 0 ? admins[0].id : null
  if (nightOwlId) {
    console.log(`   tungi admin: ${admins[0].email}`)
  }

  let total = 0
  let enough = 0
  const BATCH = 2000
  let buffer: Row[] = []

  for (const u of users) {
    const rows = generateForUser(u.id, u.role, u.id === nightOwlId)
    if (rows.length >= 50) enough++
    total += rows.length
    buffer.push(...rows)
    while (buffer.length >= BATCH) {
      await prisma.auditLog.createMany({ data: buffer.splice(0, BATCH) as any })
    }
  }
  if (buffer.length > 0) await prisma.auditLog.createMany({ data: buffer as any })

  console.log(`   foydalanuvchilar: ${users.length}`)
  console.log(`   audit yozuvlari:  ${total}`)
  console.log(`   profil uchun yetarli (>=50): ${enough}`)
  console.log(`   oyna: ${WINDOW_DAYS} kun`)
  console.log('\n🎉 Tarix tayyor. Endi profillarni quring:')
  console.log('   POST /v1/security/profiles/refresh  (ADMIN tokeni bilan)\n')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
