/**
 * Guruh davomati — kurs kesimida, bir marta, tuzatish imkoniyati bilan.
 *
 * Nega kerak edi: `POST /v1/attendance` bitta talabani belgilaydi va o'sha kun
 * uchun yozuv bo'lsa 409 qaytaradi. Amalda o'qituvchi butun guruhni bir
 * o'tirishda belgilaydi va xatosini darhol tuzatadi — eski endpoint ikkalasini
 * ham qo'llab-quvvatlamasdi.
 *
 * Bu testlar uchta xossani qulflaydi: ommaviy yozish, qayta yozishda yangilanish
 * (409 emas), va boshqa kursning talabasini yozib bo'lmasligi.
 */
import { startApp, seedAdmin, seedTeacher, cleanup, makeToken, prisma } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminId: string
let teacherId: string
let courseId: string
let otherCourseId: string
let enrollmentIds: string[] = []
let otherEnrollmentId: string
let studentIds: string[] = []

const DATE = '2026-03-04'

beforeAll(async () => {
  app = await startApp()
  const admin = await seedAdmin()
  const teacher = await seedTeacher()
  adminId = admin.id
  teacherId = teacher.id

  const suffix = `${Date.now()}_${process.pid}`

  const course = await prisma.course.create({
    data: {
      title: `Bulk kurs ${suffix}`, slug: `bulk-kurs-${suffix}`,
      teacherId, category: 'IT', durationWeeks: 8,
    },
  })
  courseId = course.id

  const other = await prisma.course.create({
    data: {
      title: `Boshqa kurs ${suffix}`, slug: `boshqa-kurs-${suffix}`,
      teacherId, category: 'IT', durationWeeks: 8,
    },
  })
  otherCourseId = other.id

  for (let i = 0; i < 3; i++) {
    const s = await prisma.user.create({
      data: {
        email: `bulk_${i}_${suffix}@test.com`, passwordHash: 'x',
        firstName: `Talaba${i}`, lastName: 'Test', role: 'STUDENT',
      },
    })
    studentIds.push(s.id)
    const e = await prisma.enrollment.create({ data: { studentId: s.id, courseId } })
    enrollmentIds.push(e.id)
  }

  const oe = await prisma.enrollment.create({
    data: { studentId: studentIds[0], courseId: otherCourseId },
  })
  otherEnrollmentId = oe.id
})

afterAll(async () => {
  await prisma.attendance.deleteMany({ where: { enrollmentId: { in: [...enrollmentIds, otherEnrollmentId] } } })
  await prisma.enrollment.deleteMany({ where: { courseId: { in: [courseId, otherCourseId] } } })
  await prisma.course.deleteMany({ where: { id: { in: [courseId, otherCourseId] } } })
  await prisma.user.deleteMany({ where: { id: { in: studentIds } } })
  await cleanup(adminId, teacherId)
  await app.close()
})

function post(body: unknown, userId = adminId, role = 'ADMIN') {
  return app.inject({
    method: 'POST', url: '/v1/attendance/bulk',
    headers: { authorization: `Bearer ${makeToken(userId, role)}` },
    payload: body,
  })
}

describe('POST /v1/attendance/bulk', () => {
  it('butun guruhni bitta so\'rovda yozadi', async () => {
    const res = await post({
      courseId, lessonDate: DATE,
      records: enrollmentIds.map(id => ({ enrollmentId: id, status: 'PRESENT' })),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.saved).toBe(3)

    const rows = await prisma.attendance.findMany({ where: { enrollmentId: { in: enrollmentIds } } })
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.status === 'PRESENT')).toBe(true)
  })

  it('qayta yuborilsa holatni YANGILAYDI — 409 bermaydi', async () => {
    // Eski `mark()` bu yerda "allaqachon belgilangan" deb rad etardi, ya'ni
    // o'qituvchi xato qo'ygan bahoni tuzata olmasdi.
    const res = await post({
      courseId, lessonDate: DATE,
      records: [{ enrollmentId: enrollmentIds[0], status: 'ABSENT' }],
    })

    expect(res.statusCode).toBe(200)

    const row = await prisma.attendance.findUnique({
      where: { enrollmentId_lessonDate: { enrollmentId: enrollmentIds[0], lessonDate: new Date(DATE) } },
    })
    expect(row?.status).toBe('ABSENT')

    // Takroriy yozuv yaratilmagan
    const all = await prisma.attendance.findMany({ where: { enrollmentId: enrollmentIds[0] } })
    expect(all).toHaveLength(1)
  })

  it('boshqa kursning talabasini yozishga yo\'l qo\'ymaydi', async () => {
    const res = await post({
      courseId, lessonDate: DATE,
      records: [{ enrollmentId: otherEnrollmentId, status: 'PRESENT' }],
    })
    expect(res.statusCode).toBe(400)
  })

  it('begona kursga o\'qituvchini qo\'ymaydi', async () => {
    const stranger = await prisma.user.create({
      data: {
        email: `stranger_${Date.now()}_${process.pid}@test.com`, passwordHash: 'x',
        firstName: 'Begona', lastName: 'O\'qituvchi', role: 'TEACHER',
      },
    })
    try {
      const res = await post(
        { courseId, lessonDate: DATE, records: [{ enrollmentId: enrollmentIds[0], status: 'PRESENT' }] },
        stranger.id, 'TEACHER',
      )
      expect(res.statusCode).toBe(403)
    } finally {
      await prisma.user.delete({ where: { id: stranger.id } })
    }
  })

  it('bo\'sh ro\'yxatni rad etadi', async () => {
    const res = await post({ courseId, lessonDate: DATE, records: [] })
    expect(res.statusCode).toBe(400)
  })
})
