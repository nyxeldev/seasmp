import { useAuth } from '@/lib/auth-context'

export function useRole() {
  const { user } = useAuth()
  return {
    isSuperAdmin: user?.role === 'SUPER_ADMIN',
    isAdmin:      user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN',
    isTeacher:    user?.role === 'TEACHER',
    isStudent:    user?.role === 'STUDENT',
    role:         user?.role ?? null,
    user,
  }
}
