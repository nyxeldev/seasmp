'use client'

import { useRole } from '@/hooks/useRole'
import { AdminDashboard } from './_components/admin-dashboard'
import { TeacherDashboard } from './_components/teacher-dashboard'
import { StudentDashboard } from './_components/student-dashboard'

export default function DashboardPage() {
  const { isAdmin, isTeacher } = useRole()
  if (isAdmin)   return <AdminDashboard />
  if (isTeacher) return <TeacherDashboard />
  return <StudentDashboard />
}
