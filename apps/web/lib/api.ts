const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('accessToken')
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem('accessToken', access)
  if (refresh) localStorage.setItem('refreshToken', refresh)
}

export function clearTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

let refreshingPromise: Promise<string | null> | null = null

async function tryRefresh(): Promise<string | null> {
  if (refreshingPromise) return refreshingPromise
  refreshingPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) { clearTokens(); return null }
      const json = await res.json()
      const newToken = json?.data?.accessToken
      if (newToken) { localStorage.setItem('accessToken', newToken); return newToken }
      clearTokens(); return null
    } catch { clearTokens(); return null }
    finally { refreshingPromise = null }
  })()
  return refreshingPromise
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let tok = token !== undefined ? token : getToken()
  if (tok) headers['Authorization'] = `Bearer ${tok}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // Auto-refresh on 401 (only for authenticated paths)
  if (res.status === 401 && token === undefined && path !== '/v1/auth/login') {
    const newToken = await tryRefresh()
    if (newToken) {
      const retryHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${newToken}` }
      const retry = await fetch(`${BASE}${path}`, {
        method, headers: retryHeaders, credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      const retryJson = await retry.json().catch(() => ({}))
      if (!retry.ok) throw new ApiError(retry.status, retryJson?.error?.message ?? `HTTP ${retry.status}`, retryJson?.error?.code)
      return retryJson
    }
  }

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`
    throw new ApiError(res.status, msg, json?.error?.code)
  }

  return json
}

async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const tok = getToken()
  const headers: Record<string, string> = {}
  if (tok) headers['Authorization'] = `Bearer ${tok}`

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, json?.error?.message ?? `HTTP ${res.status}`, json?.error?.code)
  return json
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

export const api = {
  get:    <T>(path: string, token?: string | null) => request<T>('GET',    path, undefined, token),
  post:   <T>(path: string, body?: unknown, token?: string | null) => request<T>('POST',   path, body, token),
  patch:  <T>(path: string, body?: unknown, token?: string | null) => request<T>('PATCH',  path, body, token),
  delete: <T>(path: string, token?: string | null) => request<T>('DELETE', path, undefined, token),
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{
      success: boolean
      data:
        | { accessToken: string; user: User }
        | { requiresTwoFactor: true; twoFactorToken: string }
        | { requiresTwoFactorSetup: true; setupToken: string }
    }>('/v1/auth/login', { email, password }, null),

  logout: () => api.post('/v1/auth/logout'),

  verify2fa: (twoFactorToken: string, code: string) =>
    api.post<{ success: boolean; data: { accessToken: string; user: User } }>(
      '/v1/auth/2fa/verify', { twoFactorToken, code }, null
    ),

  backupCode: (twoFactorToken: string, backupCode: string) =>
    api.post<{ success: boolean; data: { accessToken: string; user: User } }>(
      '/v1/auth/2fa/backup', { twoFactorToken, backupCode }, null
    ),

  setup2faStart: (setupToken: string) =>
    api.post<{ success: boolean; data: { qrCodeUrl: string; secret: string; backupCodes: string[] } }>(
      '/v1/auth/2fa/setup-start', { setupToken }, null
    ),

  setup2faFinish: (setupToken: string, code: string) =>
    api.post<{ success: boolean; data: { message: string; backupCodes: string[]; accessToken: string; user: User } }>(
      '/v1/auth/2fa/setup-finish', { setupToken, code }, null
    ),

  setup2fa: () =>
    api.get<{ success: boolean; data: { qrCodeUrl: string; secret: string } }>('/v1/auth/2fa/setup'),
}

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersApi = {
  me:           () => api.get<{ success: boolean; data: User }>('/v1/users/me'),
  list:         (q?: string) => api.get<{ success: boolean; data: User[]; total: number }>(`/v1/users${q ? `?${q}` : ''}`),
  getById:      (id: string) => api.get<{ success: boolean; data: User }>(`/v1/users/${id}`),
  create:       (body: Partial<User> & { password: string }) => api.post<{ success: boolean; data: User }>('/v1/users', body),
  update:       (id: string, body: Partial<User>) => api.patch<{ success: boolean; data: User }>(`/v1/users/${id}`, body),
  updateMe:     (body: Partial<User>) => api.patch<{ success: boolean; data: User }>('/v1/users/me', body),
  toggleStatus: (id: string) => api.patch(`/v1/users/${id}/toggle-status`),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.patch('/v1/users/me/password', { oldPassword, newPassword }),
}

// ─── Courses ─────────────────────────────────────────────────────────────────
export const coursesApi = {
  list:         (q?: string) => api.get<{ success: boolean; data: Course[]; total: number }>(`/v1/courses${q ? `?${q}` : ''}`),
  getById:      (id: string) => api.get<{ success: boolean; data: Course }>(`/v1/courses/${id}`),
  create:       (body: Partial<Course> & { teacherId: string }) => api.post<{ success: boolean; data: Course }>('/v1/courses', body),
  update:       (id: string, body: Partial<Course>) => api.patch<{ success: boolean; data: Course }>(`/v1/courses/${id}`, body),
  changeStatus: (id: string, status: string) => api.patch(`/v1/courses/${id}/status`, { status }),
  delete:       (id: string) => api.delete(`/v1/courses/${id}`),
}

// ─── Enrollments ─────────────────────────────────────────────────────────────
export const enrollmentsApi = {
  list:         (q?: string) => api.get<{ success: boolean; data: Enrollment[]; total: number }>(`/v1/enrollments${q ? `?${q}` : ''}`),
  getById:      (id: string) => api.get<{ success: boolean; data: Enrollment }>(`/v1/enrollments/${id}`),
  enroll:       (studentId: string, courseId: string) =>
    api.post<{ success: boolean; data: Enrollment }>('/v1/enrollments', { studentId, courseId }),
  enrollToCourse: (courseId: string, studentId: string) =>
    api.post<{ success: boolean; data: Enrollment }>(`/v1/courses/${courseId}/enroll`, { studentId }),
  changeStatus: (id: string, status: string) =>
    api.patch<{ success: boolean; data: Enrollment }>(`/v1/enrollments/${id}/status`, { status }),
}

// ─── Attendance ──────────────────────────────────────────────────────────────
export const attendanceApi = {
  list:       (q?: string) => api.get<{ success: boolean; data: Attendance[]; total: number }>(`/v1/attendance${q ? `?${q}` : ''}`),
  byCourse:   (courseId: string, q?: string) =>
    api.get<{ success: boolean; data: Attendance[]; total: number }>(`/v1/attendance/courses/${courseId}${q ? `?${q}` : ''}`),
  mark:       (body: { enrollmentId: string; lessonDate: string; status: string }) =>
    api.post<{ success: boolean; data: Attendance }>('/v1/attendance', body),
  stats:      (enrollmentId: string) => api.get<{ success: boolean; data: AttendanceStats }>(`/v1/attendance/stats/${enrollmentId}`),
  generateQr: (courseId: string, lessonDate: string) =>
    api.post<{ success: boolean; data: { token: string; qrCodeUrl: string; expiresIn: number } }>('/v1/attendance/qr/generate', { courseId, lessonDate }),
  markByQr:   (token: string) => api.post('/v1/attendance/qr/mark', { token }),
}

// ─── Assessments ─────────────────────────────────────────────────────────────
export const assessmentsApi = {
  byCourse:           (courseId: string) => api.get<{ success: boolean; data: Assessment[] }>(`/v1/assessments/course/${courseId}`),
  create:             (body: Partial<Assessment>) => api.post<{ success: boolean; data: Assessment }>('/v1/assessments', body),
  update:             (id: string, body: Partial<Assessment>) => api.patch<{ success: boolean; data: Assessment }>(`/v1/assessments/${id}`, body),
  delete:             (id: string) => api.delete(`/v1/assessments/${id}`),
  grades:             (id: string) => api.get<{ success: boolean; data: Grade[] }>(`/v1/assessments/${id}/grades`),
  gradesByEnrollment: (enrollmentId: string) =>
    api.get<{ success: boolean; data: GradeWithAssessment[] }>(`/v1/assessments/enrollment/${enrollmentId}/grades`),
  submitGrade:        (id: string, body: { enrollmentId: string; score: number; feedback?: string }) =>
    api.post<{ success: boolean; data: Grade }>(`/v1/assessments/${id}/grades`, body),
}

// ─── Analytics (via Node.js proxy → Python) ───────────────────────────────────
export const analyticsApi = {
  dashboard:          () => api.get<{ success: boolean; data: DashboardStats }>('/v1/analytics/dashboard'),
  courseSimple:       (id: string) => api.get<{ success: boolean; data: CourseStats }>(`/v1/analytics/courses/${id}/simple`),
  student:            (id: string) => api.get<{ success: boolean; data: StudentStats }>(`/v1/analytics/students/${id}`),
  attendance:         (q?: string) => api.get<{ success: boolean; data: unknown }>(`/v1/analytics/attendance${q ? `?${q}` : ''}`),
  // Python-powered (proxied via Node.js)
  courseFull:         (courseId: string) => api.get<{ success: boolean; data: PyCourseAnalytics }>(`/v1/analytics/courses/${courseId}`),
  studentEnrollment:  (studentId: string, enrollmentId: string) =>
    api.get<{ success: boolean; data: PyStudentEnrollmentAnalytics }>(`/v1/analytics/students/${studentId}/enrollment/${enrollmentId}`),
  dropoutRisk:        (q?: string) => api.get<{ success: boolean; data: PyRiskList }>(`/v1/analytics/dropout-risk${q ? `?${q}` : ''}`),
  teacherKpi:         (teacherId: string) => api.get<{ success: boolean; data: PyTeacherKpi }>(`/v1/analytics/teacher/${teacherId}/kpi`),
  triggerCalculation: () => api.post('/v1/analytics/trigger-calculation', {}),
}

// ─── Legacy ML API (direct Python calls — kept for backward compat) ────────────
const PY_BASE = process.env.NEXT_PUBLIC_ANALYTICS_URL ?? 'http://localhost:5000'

async function pyRequest<T>(path: string, method = 'GET'): Promise<T> {
  const res = await fetch(`${PY_BASE}${path}`, { method })
  if (!res.ok) throw new Error(`Analytics service: HTTP ${res.status}`)
  return res.json()
}

export const mlApi = {
  studentAnalytics: (studentId: string) => pyRequest<PyStudentAnalytics>(`/analytics/students/${studentId}`),
  courseAnalytics:  (courseId: string)  => pyRequest<PyCourseAnalytics>(`/analytics/courses/${courseId}`),
  batchRisk:        (courseId: string)  => pyRequest<PyBatchResult>(`/dropout/batch/${courseId}`),
  highRisk:         (limit = 20)        => pyRequest<PyHighRiskResult>(`/dropout/high-risk?limit=${limit}`),
  train:            ()                  => pyRequest<{ status: string; samples?: number }>('/dropout/train', 'POST'),
}

// ─── Security ────────────────────────────────────────────────────────────────
export const securityApi = {
  // Audit logs
  auditLogs:  (q?: string) => api.get<{ success: boolean; data: AuditLog[]; meta: PaginationMeta }>(`/v1/security/audit-logs${q ? `?${q}` : ''}`),
  auditLog:   (id: string) => api.get<{ success: boolean; data: AuditLog }>(`/v1/security/audit-logs/${id}`),
  // Alerts
  alerts:       (q?: string) => api.get<{ success: boolean; data: SecurityAlert[]; meta: PaginationMeta }>(`/v1/security/alerts${q ? `?${q}` : ''}`),
  alertStats:   () => api.get<{ success: boolean; data: AlertStats }>('/v1/security/alerts/stats'),
  resolveAlert: (id: string) => api.patch<{ success: boolean; data: SecurityAlert }>(`/v1/security/alerts/${id}/resolve`),
  // Sessions
  sessions:        () => api.get<{ success: boolean; data: Session[] }>('/v1/security/sessions'),
  revokeSession:   (id: string) => api.delete(`/v1/security/sessions/${id}`),
  activeSessions:  (q?: string) => api.get<{ success: boolean; data: ActiveSession[]; meta: PaginationMeta }>(`/v1/security/active-sessions${q ? `?${q}` : ''}`),
  forceRevoke:     (id: string) => api.delete(`/v1/security/active-sessions/${id}`),
  cleanup:         () => api.post('/v1/security/cleanup'),
  // Auth 2FA
  setup2fa:        () => api.get<{ success: boolean; data: { qrCodeUrl: string; secret: string; backupCodes: string[] } }>('/v1/auth/2fa/setup'),
  confirm2fa:      (code: string) => api.post<{ success: boolean; data: { message: string; backupCodes: string[] } }>('/v1/auth/2fa/confirm', { code }),
  disable2fa:      (body: { userId?: string; password?: string }) => api.post('/v1/auth/2fa/disable', body),
}

// ─── Types ───────────────────────────────────────────────────────────────────
export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'SUPER_ADMIN'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  isActive: boolean
  createdAt: string
  avatarUrl?: string
}

export interface Course {
  id: string
  title: string
  category: string
  status: string
  price: number
  maxStudents: number
  durationWeeks: number
  teacher: { id: string; firstName: string; lastName: string }
  schedule?: { days: string[]; time: string; room: string }
  _count?: { enrollments: number }
}

export interface Enrollment {
  id: string
  status: string
  enrolledAt: string
  dropoutRiskScore?: number | null
  student: { id: string; firstName: string; lastName: string; email: string }
  course: { id: string; title: string; category: string }
}

export interface Attendance {
  id: string
  lessonDate: string
  status: string
  enrollment: { student: { firstName: string; lastName: string }; course: { title: string } }
}

export interface AttendanceStats {
  total: number
  present: number
  absent: number
  late: number
  rate: number
  attendanceRate: number
}

export interface Assessment {
  id: string
  title: string
  type: string
  maxScore: number
  weight: number
  courseId: string
}

export interface Grade {
  id: string
  score: number
  feedback?: string
  enrollmentId: string
  assessmentId: string
  gradedAt: string
  enrollment: { student: { firstName: string; lastName: string } }
}

export interface GradeWithAssessment extends Grade {
  assessment: Assessment & { maxScore: number; weight: number }
}

export interface DashboardStats {
  // Nested format from API
  users?: { total: number; byRole: Record<string, number> }
  courses?: { total: number; byStatus: Record<string, number> }
  enrollments?: { total: number; active: number }
  attendance?: { total: number; rate: number }
  // Flat format (backward compat)
  totalUsers: number
  totalCourses: number
  totalEnrollments: number
  activeEnrollments: number
  totalAttendance: number
  avgAttendanceRate: number
}

export interface CourseStats {
  course: Course
  totalEnrollments: number
  avgAttendanceRate: number
  avgGrade: number
}

export interface StudentStats {
  user: User
  enrollments: number
  avgAttendanceRate: number
  avgGrade: number
}

export interface AuditLog {
  id: string
  action: string
  resource: string
  resourceId?: string
  oldData?: Record<string, unknown> | null
  newData?: Record<string, unknown> | null
  ipAddress?: string
  userAgent?: string
  statusCode?: number | null
  createdAt: string
  user?: { id: string; firstName: string; lastName: string; email: string; role: string }
}

export interface Session {
  id: string
  createdAt: string
  expiresAt: string
  ipAddress?: string
  userAgent?: string
  isRevoked: boolean
}

export interface ActiveSession {
  id: string
  createdAt: string
  expiresAt: string
  ipAddress?: string
  userAgent?: string
  user: { id: string; firstName: string; lastName: string; email: string; role: string }
}

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type AlertType     = 'BRUTE_FORCE' | 'MULTI_DEVICE' | 'UNUSUAL_HOUR' | 'BULK_DELETE' | 'RATE_LIMIT'

export interface SecurityAlert {
  id: string
  type: AlertType
  severity: AlertSeverity
  userId?: string | null
  ipAddress?: string | null
  details: Record<string, unknown>
  resolved: boolean
  resolvedBy?: string | null
  resolvedAt?: string | null
  createdAt: string
  user?: { id: string; firstName: string; lastName: string; email: string } | null
}

export interface AlertStats {
  todayTotal: number
  unresolved: number
  blockedIps: number
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

// ─── Python ML service types ──────────────────────────────────────────────────
export interface PyEnrollmentSummary {
  enrollmentId: string
  courseId: string
  courseTitle: string
  status: string
  dropoutRiskScore: number | null
  attendance: { present: number; absent: number; late: number; total: number; rate: number }
  grades: { average: number | null; submissionCount: number }
}

export interface PyStudentAnalytics {
  studentId: string
  enrollments: PyEnrollmentSummary[]
}

export interface PyCourseAnalytics {
  courseId: string
  courseTitle: string
  enrollment: { total: number; active: number; completed: number; dropped: number }
  dropoutRisk: { average: number | null; highRiskCount: number }
  grades: { average: number | null }
  attendance: { rate: number | null }
  assessments: {
    id: string; title: string; type: string; maxScore: number
    submissionCount: number; avgScore: number | null
    minScore: number | null; maxScoreAchieved: number | null
  }[]
}

export interface PyBatchItem {
  enrollmentId: string
  studentId: string
  riskScore: number
  isHighRisk: boolean
  features: Record<string, number | null>
}

export interface PyBatchResult {
  courseId: string
  count: number
  data: PyBatchItem[]
}

export interface PyHighRiskItem {
  enrollmentId: string
  studentId: string
  courseId: string
  riskScore: number
  isHighRisk: boolean
  student: { email: string; firstName: string; lastName: string }
  courseTitle: string
}

export interface PyHighRiskResult {
  count: number
  data: PyHighRiskItem[]
}

// ─── New Phase 3 types (proxied via Node.js) ──────────────────────────────────
export interface PyStudentEnrollmentAnalytics {
  enrollmentId: string
  attendance_rate: number
  attendance_rate_2w: number
  avg_grade: number
  grade_trend: { week: string; avg: number; count: number }[]
  absence_trend: { week: string; absences: number }[]
  assignments_completion: number
  days_since_login: number
  dropout_risk_score: number
  dropout_risk_label: 'low' | 'medium' | 'high'
  features: Record<string, number>
}

export interface PyCourseFullAnalytics {
  total_students: number
  active_count: number
  avg_attendance_rate: number
  avg_grade: number
  dropout_risk_distribution: { low: number; medium: number; high: number }
  grade_distribution: { range: string; count: number }[]
  weekly_attendance: { week: string; rate: number; total: number }[]
  top_students: { id: string; name: string; attendanceRate: number; avgGrade: number }[]
  at_risk_students: { id: string; enrollmentId: string; name: string; riskScore: number }[]
}

export interface PyRiskStudent {
  enrollmentId: string
  studentId: string
  courseId: string
  riskScore: number
  student: { email: string; firstName: string; lastName: string; lastLoginAt: string | null }
  courseTitle: string
  attendanceRate: number
}

export interface PyRiskList {
  total: number
  data: PyRiskStudent[]
}

export interface PyTeacherKpi {
  teacherId: string
  total_courses: number
  total_students: number
  avg_attendance_rate: number
  avg_grade: number
  course_completion_rate: number
  at_risk_students_count: number
}
