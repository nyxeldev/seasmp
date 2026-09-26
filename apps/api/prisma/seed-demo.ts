/**
 * Namoyish uchun bir semestrlik real ma'lumot.
 *
 * Nega kerak: `seed.ts` tizim ishga tushishi uchun eng kam narsani yaratadi —
 * 5 talaba, 3 kurs, bitta davomat. Shunday bazada Bosh sahifa va Analitika
 * bo'sh grafik ko'rsatadi, shuning uchun ular vaqtincha qattiq yozilgan
 * raqamlar bilan to'ldirilgan edi (247 o'quvchi, 94% davomat). Bu skript
 * o'sha ehtiyojni halol yopadi: raqamlar haqiqiy jadvallardan keladi.
 *
 * Ma'lumot ATAYLAB bir tekis emas:
 *   - talabalarning davomat odati har xil (a'lochi, o'rtacha, xavf ostidagi)
 *   - baho davomat bilan bog'liq — ML modeli o'rganadigan naqsh shu
 *   - semestr davomida ba'zi talabalar "so'nadi": davomati asta pasayadi
 * Aks holda model ham, xavf ko'rsatkichi ham ma'nosiz bo'lardi.
 *
 * Ishlatish:  npm run db:seed:demo --workspace=apps/api
 * DIQQAT: avvalgi demo ma'lumotni o'chiradi (seed.ts hisoblari saqlanadi).
 */
import { PrismaClient, type AttendanceStatus, type AssessmentType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ── Takrorlanadigan tasodifiylik ─────────────────────────────────────────────
// Har yugurishda bir xil natija chiqsin: namoyish va testlar barqaror bo'ladi.
let seed = 20260925
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo)

const FIRST_M = ['Sardor', 'Bobur', 'Jasur', 'Aziz', 'Dilshod', 'Otabek', 'Shoxrux', 'Bekzod', 'Javohir', 'Ulug\'bek', 'Anvar', 'Rustam', 'Farrux', 'Sanjar', 'Doston']
const FIRST_F = ['Malika', 'Nilufar', 'Zulfiya', 'Sevara', 'Kamola', 'Gulnora', 'Dilnoza', 'Shahnoza', 'Madina', 'Nodira', 'Feruza', 'Ziyoda', 'Munisa', 'Ozoda']
const LAST    = ['Karimov', 'Rashidov', 'Yusupov', 'Nazarov', 'Ergashev', 'Toshmatov', 'Aliyev', 'Rahimov', 'Sultonov', 'Mirzayev', 'Qodirov', 'Saidov', 'Umarov', 'Xolmatov', 'Jo\'rayev']

const COURSES = [
  { title: 'Web dasturlash asoslari',   category: 'IT',          weeks: 16, max: 30 },
  { title: "Ma'lumotlar bazasi",        category: 'IT',          weeks: 14, max: 25 },
  { title: 'Algoritmlar va strukturalar', category: 'IT',        weeks: 16, max: 28 },
  { title: 'Tarmoq xavfsizligi',        category: 'IT',          weeks: 12, max: 20 },
  { title: 'Ingliz tili (A2-B1)',       category: 'Til kurslari', weeks: 16, max: 22 },
  { title: 'Ingliz tili (B2)',          category: 'Til kurslari', weeks: 16, max: 18 },
  { title: 'Matematik tahlil',          category: 'Aniq fanlar', weeks: 18, max: 32 },
  { title: 'Statistika va ehtimollar',  category: 'Aniq fanlar', weeks: 14, max: 26 },
  { title: 'Grafik dizayn',             category: 'Dizayn',      weeks: 10, max: 18 },
  { title: 'Raqamli marketing',         category: 'Biznes',      weeks: 12, max: 24 },
]

/** Talabaning o'zini tutish profili — davomat ham, baho ham shundan kelib chiqadi */
type Persona = 'strong' | 'average' | 'struggling' | 'fading'
const PERSONA_MIX: Persona[] = [
  ...Array(22).fill('strong'),
  ...Array(34).fill('average'),
  ...Array(14).fill('struggling'),
  ...Array(10).fill('fading'),
]

/** `progress` 0..1 — semestrning qaysi qismidaligi. "fading" oxiriga borib so'nadi. */
function attendanceChance(p: Persona, progress: number): number {
  switch (p) {
    case 'strong':     return 0.96
    case 'average':    return 0.86
    case 'struggling': return 0.50
    case 'fading':     return 0.95 - 0.7 * progress
  }
}

/**
 * Topshiriq turining qiyinligi. Usiz barcha turlar bo'yicha o'rtacha deyarli
 * bir xil chiqadi va "baholash turiga ko'ra" diagrammasi hech narsa ko'rsatmaydi.
 */
const TYPE_OFFSET: Record<AssessmentType, number> = {
  HOMEWORK: +8,   // uyda ishlanadi, ball yuqoriroq
  QUIZ:     +2,
  MIDTERM:  -4,
  FINAL:    -9,   // eng qiyini
}

function gradePercent(p: Persona, attendanceRate: number, type: AssessmentType): number {
  // Baho davomatga bog'liq, lekin bir-biriga teng emas — shovqin ham bor
  const base = { strong: 88, average: 74, struggling: 52, fading: 64 }[p]
  const pull = (attendanceRate - 0.8) * 45
  return Math.max(10, Math.min(100, base + pull + TYPE_OFFSET[type] + between(-7, 7)))
}

/**
 * Qoldirish xavfi — davomat va bahodan.
 *
 * Chiziqli yig'indi ishlamadi: kirishlar hech qachon chekkaga bormagani uchun
 * eng yomon holat ham ~0.43 da qolib, "yuqori xavf" toifasi bo'sh chiqdi.
 * Logistik egri chiziq o'rta zonada keskin, chetlarida esa yassi — real
 * tasniflagichlar ham shunday ishlaydi va taqsimot ma'noli bo'ladi.
 */
function dropoutRisk(attendanceRate: number, avgScore: number): number {
  const composite = 0.55 * attendanceRate + 0.45 * (avgScore / 100)
  const MID = 0.62   // shu nuqtada xavf ~50%
  const K   = 9      // o'tishning keskinligi
  return 1 / (1 + Math.exp(K * (composite - MID)))
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/['‘’ʻ]/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

/**
 * Band bo'lmagan slug. `seed.ts` allaqachon bir nechta kurs yaratgan bo'lishi
 * mumkin va nomlari bu yerdagilar bilan ustma-ust tushadi — ilovadagi kabi
 * oxiriga tartib raqami qo'shiladi.
 */
async function freeSlug(title: string): Promise<string> {
  const base = slugify(title) || 'kurs'
  let candidate = base
  for (let n = 2; ; n++) {
    const taken = await prisma.course.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!taken) return candidate
    candidate = `${base}-${n}`
  }
}

/** Semestrdagi dars kunlari — dushanba/chorshanba yoki seshanba/payshanba */
function lessonDates(weeks: number, offsetDays: number): Date[] {
  const out: Date[] = []
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - weeks * 7)

  for (let w = 0; w < weeks; w++) {
    for (const d of [0, 2]) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d + offsetDays)
      if (date <= new Date()) out.push(date)
    }
  }
  return out
}

async function main() {
  console.log('🌱 Namoyish ma\'lumoti yaratilmoqda...\n')

  const DEMO = '@demo.seasmp.uz'

  // ── Eski demo ma'lumotini tozalash ────────────────────────────────────────
  // Faqat demo hisoblari: seed.ts yaratgan asosiy foydalanuvchilar qoladi.
  const old = await prisma.user.findMany({ where: { email: { endsWith: DEMO } }, select: { id: true } })
  if (old.length > 0) {
    const ids = old.map(u => u.id)
    const enr = await prisma.enrollment.findMany({ where: { studentId: { in: ids } }, select: { id: true } })
    const enrIds = enr.map(e => e.id)
    await prisma.grade.deleteMany({ where: { enrollmentId: { in: enrIds } } })
    await prisma.attendance.deleteMany({ where: { enrollmentId: { in: enrIds } } })
    await prisma.enrollment.deleteMany({ where: { id: { in: enrIds } } })
    const courses = await prisma.course.findMany({ where: { teacherId: { in: ids } }, select: { id: true } })
    const cIds = courses.map(c => c.id)
    await prisma.assessment.deleteMany({ where: { courseId: { in: cIds } } })
    await prisma.enrollment.deleteMany({ where: { courseId: { in: cIds } } })
    await prisma.course.deleteMany({ where: { id: { in: cIds } } })
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } })
    await prisma.securityAlert.deleteMany({ where: { userId: { in: ids } } })
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
    console.log(`   eski demo ma'lumoti o'chirildi (${old.length} hisob)`)
  }

  const pwTeacher = await bcrypt.hash('Teacher@1234', 12)
  const pwStudent = await bcrypt.hash('Student@1234', 12)

  // ── O'qituvchilar ─────────────────────────────────────────────────────────
  const teachers = []
  for (let i = 0; i < 6; i++) {
    const first = i % 2 === 0 ? FIRST_M[i] : FIRST_F[i]
    const last  = LAST[i]
    teachers.push(await prisma.user.create({
      data: {
        email: `teacher${i + 1}${DEMO}`, passwordHash: pwTeacher,
        firstName: first, lastName: last, role: 'TEACHER',
      },
    }))
  }
  console.log(`   o'qituvchilar: ${teachers.length}`)

  // ── Talabalar ─────────────────────────────────────────────────────────────
  const students: { id: string; persona: Persona }[] = []
  for (let i = 0; i < PERSONA_MIX.length; i++) {
    const male  = rnd() < 0.5
    const first = male ? pick(FIRST_M) : pick(FIRST_F)
    const last  = pick(LAST)
    const u = await prisma.user.create({
      data: {
        email: `student${i + 1}${DEMO}`, passwordHash: pwStudent,
        firstName: first, lastName: last, role: 'STUDENT',
      },
    })
    students.push({ id: u.id, persona: PERSONA_MIX[i] })
  }
  console.log(`   talabalar: ${students.length}`)

  // ── Kurslar ───────────────────────────────────────────────────────────────
  const courses = []
  for (let i = 0; i < COURSES.length; i++) {
    const c = COURSES[i]
    courses.push(await prisma.course.create({
      data: {
        title: c.title,
        slug:  await freeSlug(c.title),
        description: `${c.title} — amaliy mashg'ulotlar bilan`,
        teacherId: teachers[i % teachers.length].id,
        category: c.category,
        price: Math.round(between(200, 600)) * 1000,
        durationWeeks: c.weeks,
        maxStudents: c.max,
        status: 'ACTIVE',
        schedule: { days: i % 2 === 0 ? ['Monday', 'Wednesday'] : ['Tuesday', 'Thursday'], time: '14:00', room: `A-${i + 1}` },
      },
    }))
  }
  console.log(`   kurslar: ${courses.length}`)

  // ── Ro'yxatga olish, davomat, baholar ─────────────────────────────────────
  let enrollmentCount = 0, attendanceCount = 0, gradeCount = 0

  for (let ci = 0; ci < courses.length; ci++) {
    const course = courses[ci]
    const spec   = COURSES[ci]
    const dates  = lessonDates(spec.weeks, ci % 2)

    // Topshiriqlar
    const specs: { title: string; type: AssessmentType; weight: number; at: number }[] = [
      { title: '1-nazorat ishi', type: 'QUIZ',     weight: 0.15, at: 0.25 },
      { title: 'Uy vazifasi',    type: 'HOMEWORK', weight: 0.15, at: 0.45 },
      { title: 'Oraliq nazorat', type: 'MIDTERM',  weight: 0.30, at: 0.60 },
      { title: 'Yakuniy imtihon', type: 'FINAL',   weight: 0.40, at: 0.95 },
    ]
    const assessments = []
    for (const a of specs) {
      assessments.push(await prisma.assessment.create({
        data: {
          courseId: course.id, title: a.title, type: a.type,
          maxScore: 100, weight: a.weight,
          dueDate: dates[Math.floor(dates.length * a.at)] ?? dates[dates.length - 1],
        },
      }))
    }

    // Guruh: kurs sig'imining 60-90%
    const size = Math.floor(spec.max * between(0.6, 0.9))
    const roster = [...students].sort(() => rnd() - 0.5).slice(0, size)

    for (const s of roster) {
      const enrollment = await prisma.enrollment.create({
        data: { studentId: s.id, courseId: course.id, status: 'ACTIVE' },
      })
      enrollmentCount++

      // Davomat
      let present = 0
      const attendanceRows: { enrollmentId: string; lessonDate: Date; status: AttendanceStatus; markedBy: string }[] = []
      for (let di = 0; di < dates.length; di++) {
        const progress = dates.length > 1 ? di / (dates.length - 1) : 1
        const chance = attendanceChance(s.persona, progress)
        const roll = rnd()
        let status: AttendanceStatus
        if (roll < chance)            { status = 'PRESENT'; present++ }
        else if (roll < chance + 0.05) { status = 'LATE';    present++ }
        else                           { status = 'ABSENT' }
        attendanceRows.push({
          enrollmentId: enrollment.id, lessonDate: dates[di], status,
          markedBy: course.teacherId,
        })
      }
      await prisma.attendance.createMany({ data: attendanceRows })
      attendanceCount += attendanceRows.length

      const rate = dates.length > 0 ? present / dates.length : 1

      // Baholar — o'tib bo'lgan topshiriqlar uchun
      const gradeRows = []
      for (let ai = 0; ai < assessments.length; ai++) {
        if (rnd() > (ai === 3 ? 0.85 : 0.95)) continue  // ba'zilari topshirmagan
        gradeRows.push({
          assessmentId: assessments[ai].id,
          enrollmentId: enrollment.id,
          score: Math.round(gradePercent(s.persona, rate, assessments[ai].type) * 10) / 10,
          gradedBy: course.teacherId,
        })
      }
      if (gradeRows.length > 0) {
        await prisma.grade.createMany({ data: gradeRows })
        gradeCount += gradeRows.length
      }

      // Qoldirish xavfi — davomat va o'rtacha bahodan. Bu ML modeli
      // o'qitilgunga qadar ishlatiladigan oraliq qiymat.
      const avgScore = gradeRows.length > 0
        ? gradeRows.reduce((a, g) => a + g.score, 0) / gradeRows.length
        : 50
      const risk = Math.max(0.01, Math.min(0.99,
        dropoutRisk(rate, avgScore) + between(-0.04, 0.04),
      ))

      // Haqiqiy natija — ML modeli aynan shuni o'rganadi.
      // Xavf yuqori bo'lgan talabalarning bir qismi kursni tashlab ketadi;
      // hammasi emas, aks holda yorliq xavf balining nusxasi bo'lib qolardi va
      // model hech narsa o'rganmasdi. Kursni tugatganlar ham belgilanadi.
      const status =
        risk > 0.78 && rnd() < 0.55 ? 'DROPPED'
        : risk < 0.25 && rnd() < 0.30 ? 'COMPLETED'
        : 'ACTIVE'

      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data:  { dropoutRiskScore: Math.round(risk * 10000) / 10000, status },
      })
    }
  }

  console.log(`   ro'yxatga olishlar: ${enrollmentCount}`)
  console.log(`   davomat yozuvlari: ${attendanceCount}`)
  console.log(`   baholar: ${gradeCount}`)

  const highRisk = await prisma.enrollment.count({ where: { dropoutRiskScore: { gte: 0.7 } } })
  const byStatus = await prisma.enrollment.groupBy({ by: ['status'], _count: { status: true } })
  console.log(`   yuqori xavfdagi (>=0.70): ${highRisk}`)
  for (const r of byStatus) console.log(`   ${r.status}: ${r._count.status}`)

  console.log('\n🎉 Namoyish ma\'lumoti tayyor.')
  console.log('   Kirish: teacher1@demo.seasmp.uz / Teacher@1234')
  console.log('           student1@demo.seasmp.uz / Student@1234')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
