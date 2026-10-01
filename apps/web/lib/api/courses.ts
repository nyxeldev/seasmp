import { api } from './client'

export interface Course {
  id: string
  title: string
  /** Manzil qatorida UUID o'rniga ishlatiladi */
  slug: string
  category: string
  status: string
  price: number
  maxStudents: number
  durationWeeks: number
  teacher: { id: string; firstName: string; lastName: string }
  schedule?: { days: string[]; time: string; room: string }
  _count?: { enrollments: number }
}

export const coursesApi = {
  list:         (q?: string) => api.get<{ success: boolean; data: Course[]; total: number }>(`/v1/courses${q ? `?${q}` : ''}`),
  getById:      (id: string) => api.get<{ success: boolean; data: Course }>(`/v1/courses/${id}`),
  create:       (body: Partial<Course> & { teacherId: string }) => api.post<{ success: boolean; data: Course }>('/v1/courses', body),
  update:       (id: string, body: Partial<Course>) => api.patch<{ success: boolean; data: Course }>(`/v1/courses/${id}`, body),
  changeStatus: (id: string, status: string) => api.patch(`/v1/courses/${id}/status`, { status }),
  delete:       (id: string) => api.delete(`/v1/courses/${id}`),
}
