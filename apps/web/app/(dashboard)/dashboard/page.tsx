'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { analyticsApi, enrollmentsApi, coursesApi, type DashboardStats, type Enrollment, type Course } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, BookOpen, ClipboardList, CalendarCheck } from 'lucide-react'
import { toast } from 'sonner'

export default function DashboardPage() {
  const { user } = useAuth()

  if (user?.role === 'ADMIN')  return <AdminDashboard />
  if (user?.role === 'TEACHER') return <TeacherDashboard />
  return <StudentDashboard />
}

// ─── Admin ────────────────────────────────────────────────────────────────────
function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    analyticsApi.dashboard()
      .then(r => setStats(r.data))
      .catch(() => toast.error('Failed to load dashboard'))
  }, [])

  const cards = [
    { label: 'Total Users',       value: stats?.totalUsers,        icon: Users },
    { label: 'Total Courses',     value: stats?.totalCourses,      icon: BookOpen },
    { label: 'Total Enrollments', value: stats?.totalEnrollments,  icon: ClipboardList },
    { label: 'Avg Attendance',    value: stats ? `${(stats.avgAttendanceRate * 100).toFixed(1)}%` : null, icon: CalendarCheck },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground font-normal">{label}</CardTitle>
                <Icon className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {value ?? <span className="text-muted-foreground text-base">—</span>}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Teacher ──────────────────────────────────────────────────────────────────
function TeacherDashboard() {
  const [courses, setCourses] = useState<Course[]>([])

  useEffect(() => {
    coursesApi.list()
      .then(r => setCourses(r.data))
      .catch(() => toast.error('Failed to load courses'))
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My Courses</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map(c => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-base">{c.title}</CardTitle>
              <div className="flex gap-2 mt-1">
                <Badge variant="secondary">{c.category}</Badge>
                <Badge variant={c.status === 'ACTIVE' ? 'default' : 'outline'}>{c.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {c._count?.enrollments ?? 0} / {c.maxStudents} students
              </p>
            </CardContent>
          </Card>
        ))}
        {courses.length === 0 && (
          <p className="text-muted-foreground col-span-3">No courses yet.</p>
        )}
      </div>
    </div>
  )
}

// ─── Student ──────────────────────────────────────────────────────────────────
function StudentDashboard() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])

  useEffect(() => {
    enrollmentsApi.list()
      .then(r => setEnrollments(r.data))
      .catch(() => toast.error('Failed to load enrollments'))
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My Enrollments</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {enrollments.map(e => (
          <Card key={e.id}>
            <CardHeader>
              <CardTitle className="text-base">{e.course.title}</CardTitle>
              <Badge variant="secondary" className="w-fit mt-1">{e.course.category}</Badge>
            </CardHeader>
            <CardContent>
              <Badge variant={e.status === 'ACTIVE' ? 'default' : 'outline'}>{e.status}</Badge>
            </CardContent>
          </Card>
        ))}
        {enrollments.length === 0 && (
          <p className="text-muted-foreground col-span-3">No enrollments yet.</p>
        )}
      </div>
    </div>
  )
}
