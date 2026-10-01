import { api } from './client'

export type NotificationType =
  | 'ATTENDANCE_MARKED' | 'GRADE_POSTED' | 'ENROLLED' | 'DROPOUT_RISK' | 'SECURITY_ALERT'

export interface AppNotification {
  id:        string
  type:      NotificationType
  title:     string
  body:      string | null
  /** Ilovadagi ichki manzil; bo'lmasligi mumkin */
  link:      string | null
  data:      Record<string, unknown>
  readAt:    string | null
  createdAt: string
}

/**
 * Har bir foydalanuvchi faqat o'zinikini ko'radi — marshrutda `:userId` yo'q,
 * egalik server tomonda tokendan olinadi.
 */
export const notificationsApi = {
  list: (q?: string) =>
    api.get<{ success: boolean; data: AppNotification[] }>(`/v1/notifications${q ? `?${q}` : ''}`),
  unreadCount: () =>
    api.get<{ success: boolean; data: { count: number } }>('/v1/notifications/unread-count'),
  markRead: (id: string) =>
    api.patch<{ success: boolean; data: { id: string } }>(`/v1/notifications/${id}/read`, {}),
  markAllRead: () =>
    api.patch<{ success: boolean; data: { count: number } }>('/v1/notifications/read-all', {}),
}
