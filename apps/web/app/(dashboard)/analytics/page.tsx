'use client'

import { useAuth } from '@/lib/auth-context'
import { RoleGuard } from '@/components/RoleGuard'
import { AdminAnalytics } from './_components/admin-analytics'
import { TeacherAnalytics } from './_components/teacher-analytics'

export default function AnalyticsPage() {
  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'TEACHER']}>
      <AnalyticsPageInner />
    </RoleGuard>
  )
}

function AnalyticsPageInner() {
  const { user } = useAuth()
  if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') return <AdminAnalytics />
  if (user?.role === 'TEACHER') return <TeacherAnalytics userId={user.id} />
  return (
    <div className="py-16 text-center text-sm" style={{ color: 'var(--s-muted)' }}>
      Analytics sizning rolingiz uchun mavjud emas.
    </div>
  )
}
