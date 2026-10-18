import type { FastifyInstance } from 'fastify'
import { analyticsService } from '../services/analytics.service'
import { enrollmentService } from '../services/enrollment.service'
import { env } from '../config/env'

const PY_BASE = env.ANALYTICS_API_URL
const PY_KEY  = env.ANALYTICS_INTERNAL_KEY

async function pyGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${PY_BASE}${path}`, {
    headers: { 'X-Internal-Key': PY_KEY },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err: any = new Error(`Analytics service: HTTP ${res.status} — ${text}`)
    err.statusCode = res.status === 404 ? 404 : 502
    throw err
  }
  return res.json() as Promise<T>
}

async function pyPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${PY_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-Internal-Key': PY_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err: any = new Error(`Analytics service: HTTP ${res.status}`)
    err.statusCode = 502
    throw err
  }
  return res.json() as Promise<T>
}

function pyUnavailable(reply: any) {
  return reply.status(503).send({ success: false, error: 'Analytics service unavailable' })
}

export default async function analyticsRoutes(app: FastifyInstance) {

  // ─── Node.js-computed dashboard ───────────────────────────────────────────
  app.get('/dashboard', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')],
  }, async (_request, reply) => {
    const data = await analyticsService.dashboard()
    return reply.send({ success: true, data })
  })

  // GET /v1/analytics/overview?days=30
  // Bosh sahifa va Analitika sahifasining barcha ko'rsatkichlari — bitta so'rovda.
  // O'qituvchi ham ko'ra oladi: u o'z sahifasida umumiy manzarani ko'radi.
  app.get('/overview', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')],
  }, async (request, reply) => {
    const q = request.query as { days?: string }
    const days = q.days ? parseInt(q.days, 10) : undefined
    const data = await analyticsService.overview({ days: Number.isFinite(days) ? days : undefined })
    return reply.send({ success: true, data })
  })

  // ─── Python-powered: student enrollment analytics ──────────────────────────
  //
  // H2 fix: Python xizmati faqat X-Internal-Key'ni tekshiradi, foydalanuvchi
  // darajasidagi egalikka ishonmaydi — shuning uchun `enrollmentId` haqiqatan
  // `studentId`ga tegishli ekanini BU YERDA, Node tarafida tasdiqlash shart.
  // Mavjud `enrollmentService.findById` naqshidan foydalaniladi (u allaqachon
  // STUDENT/TEACHER egalik qoidalarini qo'llaydi — course.routes/enrollment.
  // routes'dagi bilan bir xil manba).
  app.get('/students/:studentId/enrollment/:enrollmentId', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { studentId, enrollmentId } = request.params as { studentId: string; enrollmentId: string }
    const { sub, role } = request.user
    if (role === 'STUDENT' && sub !== studentId) {
      return reply.status(403).send({ success: false, error: "Ruxsat yo'q" })
    }

    let enrollment
    try {
      enrollment = await enrollmentService.findById(enrollmentId, sub, role)
    } catch (e: any) {
      // 403 (begona enrollment) va 404 (mavjud emas) ikkalasi ham 404 sifatida
      // qaytariladi — aks holda javob kodi orqali "bu enrollment mavjud, lekin
      // sizniki emas" degan ma'lumot sizib chiqadi (begona foydalanuvchining
      // enrollment ID'si mavjudligini tasdiqlagan bo'lardi).
      if (e.statusCode === 403 || e.statusCode === 404) {
        return reply.status(404).send({ success: false, error: 'Not found' })
      }
      throw e
    }

    // :studentId va :enrollmentId bir-biriga mos kelishi shart — aks holda
    // (masalan ADMIN ikkita mos kelmaydigan ID yuborsa) ham xuddi shu
    // "topilmadi" javobi qaytadi.
    if (enrollment.studentId !== studentId) {
      return reply.status(404).send({ success: false, error: 'Not found' })
    }

    try {
      const data = await pyGet(`/v1/students/${enrollmentId}/analytics`)
      return reply.send({ success: true, data })
    } catch (e: any) {
      if (e.statusCode === 404) return reply.status(404).send({ success: false, error: 'Not found' })
      return pyUnavailable(reply)
    }
  })

  // ─── Python-powered: course full analytics ─────────────────────────────────
  app.get('/courses/:courseId', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')],
  }, async (request, reply) => {
    const { courseId } = request.params as { courseId: string }
    const { sub, role } = request.user
    try {
      // Teacher access check
      if (role === 'TEACHER') {
        await analyticsService.courseStats(courseId, sub, role)
      }
      const data = await pyGet(`/v1/courses/${courseId}/analytics`)
      return reply.send({ success: true, data })
    } catch (e: any) {
      if (e.statusCode === 403 || e.statusCode === 404) return reply.status(e.statusCode).send({ success: false, error: e.message })
      return pyUnavailable(reply)
    }
  })

  // ─── Python-powered: high dropout risk list ────────────────────────────────
  //
  // H3 fix: Python xizmati `course_id` bo'yicha o'qituvchi egaligini
  // tekshirmaydi — `course_id` berilmasa, BUTUN tizim bo'yicha xavf
  // ro'yxatini qaytaradi. TEACHER uchun `course_id` endi MAJBURIY va uning
  // haqiqatan shu o'qituvchiga tegishli ekanligi Node tarafida tasdiqlanadi
  // (xuddi shu tekshiruv quyidagi `/courses/:courseId` uchun ishlatiladi —
  // `analyticsService.courseStats`). ADMIN/SUPER_ADMIN uchun xatti-harakat
  // o'zgarmaydi — `course_id` ixtiyoriy, tizim bo'yicha ko'rinish saqlanadi.
  app.get('/dropout-risk', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')],
  }, async (request, reply) => {
    const q = request.query as any
    const { sub, role } = request.user

    if (role === 'TEACHER') {
      if (!q.course_id) {
        return reply.status(400).send({
          success: false,
          error: "O'qituvchi uchun course_id majburiy",
        })
      }
      try {
        await analyticsService.courseStats(q.course_id, sub, role)
      } catch (e: any) {
        if (e.statusCode === 403 || e.statusCode === 404) {
          return reply.status(e.statusCode).send({ success: false, error: e.message })
        }
        throw e
      }
    }

    const qs = new URLSearchParams()
    if (q.threshold) qs.set('threshold', q.threshold)
    if (q.course_id) qs.set('course_id', q.course_id)
    if (q.limit)     qs.set('limit', q.limit)
    if (q.offset)    qs.set('offset', q.offset)
    try {
      const data = await pyGet(`/v1/dropout-risk?${qs.toString()}`)
      return reply.send({ success: true, data })
    } catch {
      return pyUnavailable(reply)
    }
  })

  // ─── Python-powered: teacher KPI ──────────────────────────────────────────
  app.get('/teacher/:teacherId/kpi', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')],
  }, async (request, reply) => {
    const { teacherId } = request.params as { teacherId: string }
    const { sub, role } = request.user
    if (role === 'TEACHER' && sub !== teacherId) {
      return reply.status(403).send({ success: false, error: "Ruxsat yo'q" })
    }
    try {
      const data = await pyGet(`/v1/teachers/${teacherId}/kpi`)
      return reply.send({ success: true, data })
    } catch (e: any) {
      if (e.statusCode === 404) return reply.status(404).send({ success: false, error: 'Teacher not found' })
      return pyUnavailable(reply)
    }
  })

  // ─── Admin: trigger manual ETL ────────────────────────────────────────────
  app.post('/trigger-calculation', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')],
  }, async (_request, reply) => {
    try {
      const data = await pyPost('/v1/analytics/trigger-calculation', {})
      return reply.send({ success: true, data })
    } catch {
      return pyUnavailable(reply)
    }
  })

  // ─── Node.js computed: course stats (simple) ──────────────────────────────
  app.get('/courses/:courseId/simple', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')],
  }, async (request, reply) => {
    const { courseId } = request.params as { courseId: string }
    const data = await analyticsService.courseStats(courseId, request.user.sub, request.user.role)
    return reply.send({ success: true, data })
  })

  // ─── Node.js computed: student stats (simple) ─────────────────────────────
  app.get('/students/:studentId', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { studentId } = request.params as { studentId: string }
    const data = await analyticsService.studentStats(studentId, request.user.sub, request.user.role)
    return reply.send({ success: true, data })
  })

  // ─── Node.js computed: attendance report ──────────────────────────────────
  app.get('/attendance', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')],
  }, async (request, reply) => {
    const q = request.query as any
    const data = await analyticsService.attendanceReport({ courseId: q.courseId, from: q.from, to: q.to })
    return reply.send({ success: true, data })
  })
}
