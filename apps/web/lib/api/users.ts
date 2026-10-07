import { api, uploadFile, type PaginationMeta } from './client'

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

export const usersApi = {
  me:           () => api.get<{ success: boolean; data: User }>('/v1/users/me'),
  list:         (q?: string) => api.get<{ success: boolean; data: User[]; meta: PaginationMeta }>(`/v1/users${q ? `?${q}` : ''}`),
  getById:      (id: string) => api.get<{ success: boolean; data: User }>(`/v1/users/${id}`),
  create:       (body: Partial<User> & { password: string }) => api.post<{ success: boolean; data: User }>('/v1/users', body),
  update:       (id: string, body: Partial<User>) => api.patch<{ success: boolean; data: User }>(`/v1/users/${id}`, body),
  updateMe:     (body: Partial<User>) => api.patch<{ success: boolean; data: User }>('/v1/users/me', body),
  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return uploadFile<{ success: boolean; data: User }>('/v1/users/me/avatar', formData)
  },
  toggleStatus: (id: string) => api.patch(`/v1/users/${id}/toggle-status`),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.patch('/v1/users/me/password', { oldPassword, newPassword }),
}
