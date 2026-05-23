import type { FastifyInstance } from 'fastify'
import { analyticsService } from '../services/analytics.service'
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

  // ─── Python-powered: student enrollment analytics ──────────────────────────
  app.get('/students/:studentId/enrollment/:enrollmentId', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { studentId, enrollmentId } = request.params as { studentId: string; enrollmentId: string }
    const { sub, role } = request.user
    if (role === 'STUDENT' && sub !== studentId) {
      return reply.status(403).send({ success: false, error: "Ruxsat yo'q" })
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
  app.get('/dropout-risk', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')],
  }, async (request, reply) => {
    const q = request.query as any
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
