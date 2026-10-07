import { api, type PaginationMeta } from './client'

export interface Enrollment {
  id: string
  status: string
  enrolledAt: string
  dropoutRiskScore?: number | null
  student: { id: string; firstName: string; lastName: string; email: string }
  course: { id: string; slug: string; title: string; category: string }
}

export const enrollmentsApi = {
  list:         (q?: string) => api.get<{ success: boolean; data: Enrollment[]; meta: PaginationMeta }>(`/v1/enrollments${q ? `?${q}` : ''}`),
  getById:      (id: string) => api.get<{ success: boolean; data: Enrollment }>(`/v1/enrollments/${id}`),
  enroll:       (studentId: string, courseId: string) =>
    api.post<{ success: boolean; data: Enrollment }>('/v1/enrollments', { studentId, courseId }),
  enrollToCourse: (courseId: string, studentId: string) =>
    api.post<{ success: boolean; data: Enrollment }>(`/v1/courses/${courseId}/enroll`, { studentId }),
  changeStatus: (id: string, status: string) =>
    api.patch<{ success: boolean; data: Enrollment }>(`/v1/enrollments/${id}/status`, { status }),
}
