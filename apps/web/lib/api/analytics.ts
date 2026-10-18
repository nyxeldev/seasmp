import { api, pyRequest } from './client'
import type { User } from './users'
import type { Course } from './courses'

// ─── Node.js proxy (/v1/analytics/*) ──────────────────────────────────────────
export interface AnalyticsOverview {
  windowDays: number
  students: number
  activeCourses: number
  attendanceRate: number | null
  attendanceDelta: number | null
  attendanceTrend: { date: string; rate: number; total: number }[]
  avgGrade: number | null
  gradesByType: { type: string; avg: number; count: number }[]
  highRisk: number
  avgRisk: number | null
  topRisk: {
    enrollmentId: string; score: number
    studentId: string; studentName: string
    courseId: string; courseSlug: string; courseTitle: string
  }[]
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

/**
 * GET /v1/analytics/students/:id javobi.
 *
 * Bu tip ilgari `{user, enrollments, avgAttendanceRate, avgGrade}` deb
 * yozilgan edi — server esa hech qachon bunday javob qaytarmagan. Tip
 * yolg'on gapirgani uchun talaba sahifasi undan foydalanmay, har bir
 * ro'yxatga olish uchun alohida ikkita so'rov yuborardi (N+1).
 */
export interface StudentCourseStats {
  enrollmentId: string
  course: { id: string; slug: string | null; title: string; category: string }
  status: string
  /** Foizda, 0–100. Davomat yozuvi bo'lmasa null */
  attendanceRate: number | null
  /** Topshiriq vaznlari bo'yicha o'rtacha, 0–100. Baho yo'q bo'lsa null */
  finalGrade: number | null
  /** 0–1 oralig'ida, Python servisi yozadi */
  dropoutRisk: number | null
}

export interface StudentStats {
  student: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>
  courses: StudentCourseStats[]
}

// ─── Python ML service types (proxied via Node.js) ────────────────────────────
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

// ─── Phase 3 types (proxied via Node.js) ──────────────────────────────────────
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

export const analyticsApi = {
  overview: (days = 30) => api.get<{ success: boolean; data: AnalyticsOverview }>(`/v1/analytics/overview?days=${days}`),
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
//
// batchRisk/highRisk/train used to call the legacy `/dropout/*` pipeline
// (src/services/dropout_service.py on the analytics side), which wrote
// enrollments.dropout_risk_score with a different feature set/model than the
// canonical one and had no auth check at all. That pipeline was removed
// during the DB fix phase after confirming (repo-wide search) these three
// functions were never actually called from any page/component — only
// defined here. studentAnalytics/courseAnalytics still hit a live legacy
// route (src/routes/analytics.py) that was out of scope for that fix.
export const mlApi = {
  studentAnalytics: (studentId: string) => pyRequest<PyStudentAnalytics>(`/analytics/students/${studentId}`),
  courseAnalytics:  (courseId: string)  => pyRequest<PyCourseAnalytics>(`/analytics/courses/${courseId}`),
}
