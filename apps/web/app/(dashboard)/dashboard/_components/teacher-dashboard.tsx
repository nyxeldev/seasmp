'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { analyticsApi, coursesApi, type Course, type PyTeacherKpi } from '@/lib/api'
import { useLocale } from '@/store/locale'
import { Users, BookOpen, CalendarCheck, AlertTriangle, ArrowRight } from 'lucide-react'
import { SkeletonKpi, SkeletonRow } from '@/components/ui/skeleton'
import { DashCard, KpiCard, fadeUp, stagger, type KpiProps } from './dashboard-ui'

function useTeacherDashboardData() {
  const { user } = useAuth()
  const [kpi, setKpi]         = useState<PyTeacherKpi | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    Promise.all([
      // Backend o'qituvchi uchun KPI'ni /courses so'ralganda ham avtomatik
      // o'ziga tegishli kurslar bilan cheklaydi (course.routes.ts) — shuning
      // uchun bu yerda alohida `teacherId` filtri kerak emas.
      analyticsApi.teacherKpi(user.id).then(r => r.data).catch(() => null),
      coursesApi.list().then(r => r.data).catch(() => []),
    ]).then(([k, c]) => {
      if (cancelled) return
      setKpi(k)
      setCourses(c)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  return { kpi, courses, loading }
}

export function TeacherDashboard() {
  const { t } = useLocale()
  const { kpi, courses, loading } = useTeacherDashboardData()

  const kpis: KpiProps[] = [
    { label: t('teacher.totalCourses'),   target: kpi?.total_courses ?? courses.length, icon: BookOpen,      trendColor: 'green' },
    { label: t('teacher.totalStudents'),  target: kpi?.total_students ?? 0,             icon: Users,         trendColor: 'green' },
    { label: t('teacher.avgAttendance'),  target: Math.round(kpi?.avg_attendance_rate ?? 0), suffix: '%', icon: CalendarCheck, trendColor: 'green' },
    { label: t('teacher.atRiskStudents'), target: kpi?.at_risk_students_count ?? 0,     icon: AlertTriangle, trendColor: 'red', pulse: (kpi?.at_risk_students_count ?? 0) > 0 },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--s-text)' }}>{t('teacher.myCourses')}</h1>

      <motion.div
        className="kpi-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        variants={stagger} initial="initial" animate="animate"
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)
          : kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </motion.div>

      <motion.div {...fadeUp(0.2)}>
        <DashCard>
          <div className="space-y-0.5">
            {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
            {!loading && courses.length === 0 && (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--s-muted)' }}>{t('teacher.noCourses')}</p>
            )}
            {courses.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
                <Link
                  href={`/courses/${c.slug ?? c.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors"
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--s-text)' }}>{c.title}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--s-muted)' }}>
                      {c._count?.enrollments ?? 0} {t('courses.students').toLowerCase()} · {c.status}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0" style={{ color: 'var(--s-muted)' }} />
                </Link>
              </motion.div>
            ))}
          </div>
        </DashCard>
      </motion.div>
    </div>
  )
}
