/**
 * So'rov yo'lidan obyektni ajratish va FOREIGN ogohlantirish qarori —
 * 1-qatlamning sof mantiqi. Bazasiz ishlaydi.
 *
 * R4/R6 FIX: `targetFromPath` endi ikkinchi argument sifatida Fastify'ning
 * RO'YXATDAN O'TGAN marshrut shablonini oladi (`request.routeOptions.url`),
 * haqiqiy so'rov yo'lini emas. Har bir `describe` bloki quyida haqiqiy
 * marshrut fayllaridagi (`src/routes/*.ts`) bitta ro'yxatdan o'tgan
 * shablonga mos keladi — ro'yxat FINDINGS.md R4/R6 qarorida ham takrorlanadi.
 */
import { targetFromPath, shouldRaiseForeign, UNOWNABLE_RESOURCE } from '../../services/requestAudit'

const CID = 'c1111111-1111-1111-1111-111111111111'
const EID = 'e2222222-2222-2222-2222-222222222222'
const UID = 'u3333333-3333-3333-3333-333333333333'

describe('targetFromPath — har bir marshrut jadvalidan (3-band) — generic :id', () => {
  it('course.routes.ts — GET/PATCH/DELETE /v1/courses/:id', () => {
    expect(targetFromPath(`/v1/courses/${CID}`, '/v1/courses/:id', { id: CID }))
      .toEqual({ resource: 'courses', resourceId: CID })
  })

  it('course.routes.ts — PATCH /v1/courses/:id/status', () => {
    expect(targetFromPath(`/v1/courses/${CID}/status`, '/v1/courses/:id/status', { id: CID }))
      .toEqual({ resource: 'courses', resourceId: CID })
  })

  it('course.routes.ts — POST /v1/courses/:id/enroll', () => {
    expect(targetFromPath(`/v1/courses/${CID}/enroll`, '/v1/courses/:id/enroll', { id: CID }))
      .toEqual({ resource: 'courses', resourceId: CID })
  })

  it('enrollment.routes.ts — GET /v1/enrollments/:id', () => {
    expect(targetFromPath(`/v1/enrollments/${EID}`, '/v1/enrollments/:id', { id: EID }))
      .toEqual({ resource: 'enrollments', resourceId: EID })
  })

  it('enrollment.routes.ts — PATCH /v1/enrollments/:id/status', () => {
    expect(targetFromPath(`/v1/enrollments/${EID}/status`, '/v1/enrollments/:id/status', { id: EID }))
      .toEqual({ resource: 'enrollments', resourceId: EID })
  })

  it('user.routes.ts — GET/PATCH/DELETE /v1/users/:id', () => {
    expect(targetFromPath(`/v1/users/${UID}`, '/v1/users/:id', { id: UID }))
      .toEqual({ resource: 'users', resourceId: UID })
  })

  it('user.routes.ts — PATCH /v1/users/:id/toggle-status', () => {
    expect(targetFromPath(`/v1/users/${UID}/toggle-status`, '/v1/users/:id/toggle-status', { id: UID }))
      .toEqual({ resource: 'users', resourceId: UID })
  })

  it('assessment.routes.ts — PATCH/DELETE /v1/assessments/:id', () => {
    expect(targetFromPath(`/v1/assessments/${CID}`, '/v1/assessments/:id', { id: CID }))
      .toEqual({ resource: 'assessments', resourceId: CID })
  })

  it('assessment.routes.ts — GET/POST /v1/assessments/:id/grades', () => {
    expect(targetFromPath(`/v1/assessments/${CID}/grades`, '/v1/assessments/:id/grades', { id: CID }))
      .toEqual({ resource: 'assessments', resourceId: CID })
  })
})

describe('targetFromPath — semantik parametr nomi (PARAM_NAME_TO_RESOURCE)', () => {
  it('attendance.routes.ts — GET /v1/attendance/stats/:enrollmentId (R4)', () => {
    const result = targetFromPath(
      `/v1/attendance/stats/${EID}`, '/v1/attendance/stats/:enrollmentId', { enrollmentId: EID },
    )
    expect(result).toEqual({ resource: 'enrollments', resourceId: EID })
  })

  it('attendance.routes.ts — GET /v1/attendance/courses/:courseId', () => {
    const result = targetFromPath(
      `/v1/attendance/courses/${CID}`, '/v1/attendance/courses/:courseId', { courseId: CID },
    )
    expect(result).toEqual({ resource: 'courses', resourceId: CID })
  })

  it('analytics.routes.ts — GET /v1/analytics/teacher/:teacherId/kpi (R6 — endi "users", UNOWNABLE emas)', () => {
    const result = targetFromPath(
      `/v1/analytics/teacher/${UID}/kpi`, '/v1/analytics/teacher/:teacherId/kpi', { teacherId: UID },
    )
    expect(result).toEqual({ resource: 'users', resourceId: UID })
  })

  it('analytics.routes.ts — GET /v1/analytics/students/:studentId (R6 — endi "users", UNOWNABLE emas)', () => {
    const result = targetFromPath(
      `/v1/analytics/students/${UID}`, '/v1/analytics/students/:studentId', { studentId: UID },
    )
    expect(result).toEqual({ resource: 'users', resourceId: UID })
  })

  it('analytics.routes.ts — GET /v1/analytics/students/:studentId/enrollment/:enrollmentId — oxirgi parametr yutadi', () => {
    const result = targetFromPath(
      `/v1/analytics/students/${UID}/enrollment/${EID}`,
      '/v1/analytics/students/:studentId/enrollment/:enrollmentId',
      { studentId: UID, enrollmentId: EID },
    )
    expect(result).toEqual({ resource: 'enrollments', resourceId: EID })
  })

  it('analytics.routes.ts — GET /v1/analytics/courses/:courseId', () => {
    const result = targetFromPath(
      `/v1/analytics/courses/${CID}`, '/v1/analytics/courses/:courseId', { courseId: CID },
    )
    expect(result).toEqual({ resource: 'courses', resourceId: CID })
  })

  it('analytics.routes.ts — GET /v1/analytics/courses/:courseId/simple', () => {
    const result = targetFromPath(
      `/v1/analytics/courses/${CID}/simple`, '/v1/analytics/courses/:courseId/simple', { courseId: CID },
    )
    expect(result).toEqual({ resource: 'courses', resourceId: CID })
  })

  it('assessment.routes.ts — GET /v1/assessments/course/:courseId (paramName courseId yutadi, literal "course" emas)', () => {
    const result = targetFromPath(
      `/v1/assessments/course/${CID}`, '/v1/assessments/course/:courseId', { courseId: CID },
    )
    expect(result).toEqual({ resource: 'courses', resourceId: CID })
  })

  it('assessment.routes.ts — GET /v1/assessments/course/:courseId/grades', () => {
    const result = targetFromPath(
      `/v1/assessments/course/${CID}/grades`, '/v1/assessments/course/:courseId/grades', { courseId: CID },
    )
    expect(result).toEqual({ resource: 'courses', resourceId: CID })
  })

  it('assessment.routes.ts — GET /v1/assessments/enrollment/:enrollmentId/grades (paramName yutadi, literal "enrollment" emas)', () => {
    const result = targetFromPath(
      `/v1/assessments/enrollment/${EID}/grades`, '/v1/assessments/enrollment/:enrollmentId/grades', { enrollmentId: EID },
    )
    expect(result).toEqual({ resource: 'enrollments', resourceId: EID })
  })
})

describe('targetFromPath — BigInt id (UUID emas) — notification.routes.ts', () => {
  it('PATCH /v1/notifications/:id/read — literal "notifications" preceding segment', () => {
    const result = targetFromPath('/v1/notifications/123/read', '/v1/notifications/:id/read', { id: '123' })
    expect(result).toEqual({ resource: 'notifications', resourceId: '123' })
  })

  it('Postgres bigint max\'dan katta ID bo\'lsa ham shablon asosida barqaror ishlaydi', () => {
    const huge = '99999999999999999999999999'
    const result = targetFromPath(`/v1/notifications/${huge}/read`, '/v1/notifications/:id/read', { id: huge })
    expect(result).toEqual({ resource: 'notifications', resourceId: huge })
  })
})

describe('targetFromPath — UNOWNABLE_PATTERNS (haqiqiy egasiz marshrut)', () => {
  it('@fastify/static avatar fayllari — "*" shablonida named param yo\'q, aniq UNOWNABLE belgisi', () => {
    const result = targetFromPath(
      '/v1/uploads/avatars/11111111-1111-1111-1111-111111111111.webp',
      '/v1/uploads/avatars/*',
      {},
    )
    expect(result).toEqual({ resource: UNOWNABLE_RESOURCE })
  })
})

describe('targetFromPath — :param yo\'q shablon (ro\'yxat/self/login) — obyekt ko\'rsatilmagan, eski fallback', () => {
  it('to\'plam yo\'lida (GET /v1/courses) ID bo\'lmaydi', () => {
    expect(targetFromPath('/v1/courses', '/v1/courses', {})).toEqual({ resource: 'courses' })
  })

  it('GET /v1/users/me — named param yo\'q, "users" ga tushadi', () => {
    expect(targetFromPath('/v1/users/me', '/v1/users/me', {})).toEqual({ resource: 'users' })
  })

  it('routePattern aniqlanmagan (haqiqiy 404) — yiqilmaydi, pathname\'dan fallback', () => {
    expect(targetFromPath('/v1/nonexistent', undefined, {})).toEqual({ resource: 'nonexistent' })
  })

  it('"/" uchun ham yiqilmaydi', () => {
    expect(targetFromPath('/', undefined, {})).toEqual({ resource: 'unknown' })
  })
})

describe('shouldRaiseForeign — qaysi FOREIGN haqiqiy zaiflik', () => {
  const owned   = { relation: 'FOREIGN' as const, hasOwnerRule: true }
  const shared  = { relation: 'FOREIGN' as const, hasOwnerRule: false }

  it('egasi bor obyektni begona o\'qishi — IDOR, ogohlantiriladi', () => {
    expect(shouldRaiseForeign(owned, 'GET', false)).toBe(true)
  })

  it('umumiy katalogni o\'qish — normal holat, ogohlantirilmaydi', () => {
    expect(shouldRaiseForeign(shared, 'GET', false)).toBe(false)
  })

  it('umumiy katalogni begona O\'ZGARTIRISHI — baribir zaiflik', () => {
    expect(shouldRaiseForeign(shared, 'PATCH', false)).toBe(true)
    expect(shouldRaiseForeign(shared, 'DELETE', false)).toBe(true)
  })

  it('rad etilgan so\'rov FOREIGN ogohlantirishi emas — himoya ishlagan', () => {
    expect(shouldRaiseForeign(owned, 'GET', true)).toBe(false)
  })

  it('FOREIGN bo\'lmagan munosabatlar ogohlantirilmaydi', () => {
    for (const relation of ['SELF', 'OWNER', 'CUSTODIAN', 'PRIVILEGED', 'UNKNOWN'] as const) {
      expect(shouldRaiseForeign({ relation, hasOwnerRule: true }, 'DELETE', false)).toBe(false)
    }
  })
})
