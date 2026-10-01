/**
 * Bosqich B uchun haqiqiy trafik generatori.
 *
 * `inferOwnership.ts` audit_logs dagi haqiqiy so'rovlardan ishonch hisoblaydi
 * — lekin mavjud ishchi bazada bitta ham resursga xos (resourceId bilan) GET
 * so'rovi yo'q edi: avvalgi trafik faqat ro'yxat so'rovlari edi
 * (`/v1/courses`, `/v1/enrollments`), ularda resourceId umuman yozilmaydi.
 *
 * Bu skript HAQIQIY HTTP so'rovlar bilan (sintetik hisoblash emas) real
 * seed ma'lumotlaridagi talaba/o'qituvchilar nomidan ishlaydi: har bir
 * aktyor ko'pincha O'Z resursiga, kamdan-kam BEGONA resursga murojaat
 * qiladi — bu haqiqiy ishlatilishni (va kamdan-kam IDOR paypaslashni)
 * taqlid qiladi.
 *
 * MUHIM TOPILMA (bu skriptni yozishda aniqlandi): `attendance` va `grades`
 * resurs turlari uchun — garchi ikkalasi uchun ham `ownership_rules`da
 * qoida mavjud bo'lsa ham — birorta ham GET yo'li o'sha resursning O'Z
 * `id`'si bilan YO'Q (`attendance.routes.ts`, `assessment.routes.ts`ni
 * ko'ring). Ya'ni bu ikki qoida ishlab turgan tizimda HECH QACHON
 * ishlatilmaydi — `resolveAccess('attendance', ...)` va
 * `resolveAccess('grades', ...)` productionda chaqirilmaydi. Shuning
 * uchun bu skript faqat haqiqatan erishiladigan uchta turni sinaydi:
 * courses, enrollments, assessments.
 *
 * Ishlatish: npm run demo:ownership-traffic --workspace=apps/api
 */
import { prisma } from '../config/prisma'

const API = process.env.EVAL_API_URL ?? 'http://localhost:4000'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) return null
  const json: any = await res.json()
  return json?.data?.accessToken ?? null
}

async function get(token: string, path: string): Promise<number> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } })
  return res.status
}

async function main(): Promise<void> {
  const health = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false)
  if (!health) { console.error(`API ishlamayapti (${API})`); process.exitCode = 1; return }

  console.log('\nBosqich B uchun trafik generatori — HAQIQIY HTTP so\'rovlar\n')

  // ── Talabalar: o'z va begona enrollment/course'ga murojaat ──────────────
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    select: { id: true, email: true },
    take: 40,
  })
  const allEnrollments = await prisma.enrollment.findMany({
    select: { id: true, studentId: true, courseId: true },
  })
  const enrollByStudent = new Map<string, typeof allEnrollments>()
  for (const e of allEnrollments) {
    const list = enrollByStudent.get(e.studentId) ?? []
    list.push(e)
    enrollByStudent.set(e.studentId, list)
  }

  let studentReqs = 0
  for (const s of students) {
    const mine = enrollByStudent.get(s.id) ?? []
    if (mine.length === 0) continue
    const token = await login(s.email, 'Student@1234')
    if (!token) continue

    // O'z yozuvlariga — ko'p marta (haqiqiy, kundalik foydalanish)
    for (const e of mine.slice(0, 3)) {
      await get(token, `/v1/enrollments/${e.id}`)
      await get(token, `/v1/courses/${e.courseId}`)
      studentReqs += 2
      await sleep(15)
    }

    // Begona yozuvga — kam-kam (tasodifiy boshqa talabaning enrollment'i)
    const foreign = allEnrollments.find((e) => e.studentId !== s.id)
    if (foreign && Math.random() < 0.15) {
      await get(token, `/v1/enrollments/${foreign.id}`)
      studentReqs++
      await sleep(15)
    }
  }
  console.log(`  Talabalar: ${studentReqs} ta so'rov yuborildi`)

  // ── O'qituvchilar: o'z va begona kurs/baholash'ga murojaat ───────────────
  const teachers = await prisma.user.findMany({
    where: { role: 'TEACHER' },
    select: { id: true, email: true },
    take: 20,
  })
  const allCourses = await prisma.course.findMany({ select: { id: true, teacherId: true } })
  const allAssessments = await prisma.assessment.findMany({ select: { id: true, courseId: true } })
  const assessByCourse = new Map<string, string[]>()
  for (const a of allAssessments) {
    const list = assessByCourse.get(a.courseId) ?? []
    list.push(a.id)
    assessByCourse.set(a.courseId, list)
  }

  let teacherReqs = 0
  for (const t of teachers) {
    const mine = allCourses.filter((c) => c.teacherId === t.id)
    if (mine.length === 0) continue
    const token = await login(t.email, 'Teacher@1234')
    if (!token) continue

    for (const c of mine) {
      await get(token, `/v1/courses/${c.id}`)
      teacherReqs++
      await sleep(15)
      for (const assessId of (assessByCourse.get(c.id) ?? []).slice(0, 2)) {
        await get(token, `/v1/assessments/${assessId}/grades`)
        teacherReqs++
        await sleep(15)
      }
      // O'qituvchi o'z kursidagi talabalar ro'yxatdan o'tishini ko'radi —
      // masalan davomat belgilashdan oldin guruh tarkibini tekshirganda.
      const ownCourseEnrollments = allEnrollments.filter((e) => e.courseId === c.id)
      for (const e of ownCourseEnrollments.slice(0, 3)) {
        await get(token, `/v1/enrollments/${e.id}`)
        teacherReqs++
        await sleep(15)
      }
    }

    // Begona kursga — kam-kam
    const foreignCourse = allCourses.find((c) => c.teacherId !== t.id)
    if (foreignCourse && Math.random() < 0.15) {
      await get(token, `/v1/courses/${foreignCourse.id}`)
      teacherReqs++
      await sleep(15)
    }
  }
  console.log(`  O'qituvchilar: ${teacherReqs} ta so'rov yuborildi`)

  console.log(`\nJami: ${studentReqs + teacherReqs} ta haqiqiy HTTP so'rov. Endi:`)
  console.log('  npm run infer:ownership --workspace=apps/api\n')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
