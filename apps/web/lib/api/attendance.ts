import { api } from './client'

export interface Attendance {
  id: string
  lessonDate: string
  status: string
  enrollment: {
    id: string
    student: { id: string; firstName: string; lastName: string }
    // API `id` ni ham qaytaradi — usiz filtrlash kurs NOMI bo'yicha qilinardi
    course: { id: string; title: string }
  }
}

export interface AttendanceStats {
  total: number
  present: number
  absent: number
  late: number
  rate: number
  attendanceRate: number
}

export const attendanceApi = {
  list:       (q?: string) => api.get<{ success: boolean; data: Attendance[]; total: number }>(`/v1/attendance${q ? `?${q}` : ''}`),
  byCourse:   (courseId: string, q?: string) =>
    api.get<{ success: boolean; data: Attendance[]; total: number }>(`/v1/attendance/courses/${courseId}${q ? `?${q}` : ''}`),
  mark:       (body: { enrollmentId: string; lessonDate: string; status: string }) =>
    api.post<{ success: boolean; data: Attendance }>('/v1/attendance', body),
  /** Butun guruhni bir marta belgilaydi; qayta yuborilsa holatni yangilaydi */
  markBulk:   (body: { courseId: string; lessonDate: string; records: { enrollmentId: string; status: string }[] }) =>
    api.post<{ success: boolean; data: { saved: number; lessonDate: string } }>('/v1/attendance/bulk', body),
  stats:      (enrollmentId: string) => api.get<{ success: boolean; data: AttendanceStats }>(`/v1/attendance/stats/${enrollmentId}`),
  generateQr: (courseId: string, lessonDate: string) =>
    api.post<{ success: boolean; data: { token: string; qrCodeUrl: string; expiresIn: number } }>('/v1/attendance/qr/generate', { courseId, lessonDate }),
  markByQr:   (token: string) => api.post('/v1/attendance/qr/mark', { token }),
}
