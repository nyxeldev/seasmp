import { api } from './client'

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

export const assessmentsApi = {
  byCourse:           (courseId: string) => api.get<{ success: boolean; data: Assessment[] }>(`/v1/assessments/course/${courseId}`),
  create:             (body: Partial<Assessment>) => api.post<{ success: boolean; data: Assessment }>('/v1/assessments', body),
  update:             (id: string, body: Partial<Assessment>) => api.patch<{ success: boolean; data: Assessment }>(`/v1/assessments/${id}`, body),
  delete:             (id: string) => api.delete(`/v1/assessments/${id}`),
  grades:             (id: string) => api.get<{ success: boolean; data: Grade[] }>(`/v1/assessments/${id}/grades`),
  gradesByCourse:     (courseId: string) => api.get<{ success: boolean; data: Grade[] }>(`/v1/assessments/course/${courseId}/grades`),
  gradesByEnrollment: (enrollmentId: string) =>
    api.get<{ success: boolean; data: GradeWithAssessment[] }>(`/v1/assessments/enrollment/${enrollmentId}/grades`),
  submitGrade:        (id: string, body: { enrollmentId: string; score: number; feedback?: string }) =>
    api.post<{ success: boolean; data: Grade }>(`/v1/assessments/${id}/grades`, body),
}
