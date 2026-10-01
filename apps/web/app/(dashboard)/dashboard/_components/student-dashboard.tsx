'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { analyticsApi, type StudentStats } from '@/lib/api'
import { useLocale } from '@/store/locale'
import { BookOpen, CalendarCheck, AlertTriangle, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SkeletonKpi, SkeletonRow } from '@/components/ui/skeleton'
import { DashCard, KpiCard, fadeUp, stagger, type KpiProps } from './dashboard-ui'

function useStudentDashboardData() {
  const { user } = useAuth()
  const [stats, setStats]     = useState<StudentStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    analyticsApi.student(user.id)
      .then(r => { if (!cancelled) setStats(r.data) })
      .catch(() => { if (!cancelled) setStats(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  const courses = stats?.courses ?? []
  const withAttendance = courses.filter(c => c.attendanceRate !== null)
  const avgAttendance = withAttendance.length
    ? Math.round(withAttendance.reduce((s, c) => s + (c.attendanceRate ?? 0), 0) / withAttendance.length)
    : 0
  const withGrade = courses.filter(c => c.finalGrade !== null)
  const avgGrade = withGrade.length
    ? Math.round(withGrade.reduce((s, c) => s + (c.finalGrade ?? 0), 0) / withGrade.length)
    : 0
  const highRiskCount = courses.filter(c => (c.dropoutRisk ?? 0) >= 0.65).length

  return { courses, avgAttendance, avgGrade, highRiskCount, loading }
}

const statusColor = (status: string) =>
  status === 'ACTIVE' ? { background: 'rgba(34,197,94,0.1)', color: '#22C55E' }
  : status === 'COMPLETED' ? { background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }
  : { background: 'rgba(239,68,68,0.1)', color: '#EF4444' }

export function StudentDashboard() {
  const { t } = useLocale()
  const { courses, avgAttendance, avgGrade, highRiskCount, loading } = useStudentDashboardData()

  const kpis: KpiProps[] = [
    { label: t('student.coursesEnrolled'), target: courses.length, icon: BookOpen,      trendColor: 'green' },
    { label: t('student.avgAttendance'),   target: avgAttendance,  suffix: '%', icon: CalendarCheck, trendColor: 'green' },
    { label: t('student.avgGrade'),        target: avgGrade,       suffix: '%', icon: Star,          trendColor: 'green' },
    { label: t('student.highRisk'),        target: highRiskCount,  icon: AlertTriangle, trendColor: 'red', pulse: highRiskCount > 0 },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--s-text)' }}>{t('student.enrolledCourses')}</h1>

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
          <div className="space-y-1">
            {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
            {!loading && courses.length === 0 && (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--s-muted)' }}>{t('student.noCourses')}</p>
            )}
            {courses.map((c, i) => (
              <motion.div
                key={c.enrollmentId}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--s-text)' }}>{c.course.title}</p>
                    <Badge className="text-[10px] px-1.5 py-0" style={{ ...statusColor(c.status), border: 'none' }}>
                      {c.status}
                    </Badge>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>
                    {t('student.attendance')}: {c.attendanceRate != null ? `${c.attendanceRate}%` : '—'}
                    {'  ·  '}
                    {t('student.avgGrade')}: {c.finalGrade != null ? `${c.finalGrade.toFixed(0)}%` : '—'}
                    {c.dropoutRisk != null && c.dropoutRisk >= 0.65 && (
                      <>
                        {'  ·  '}
                        <span style={{ color: '#EF4444' }}>{t('student.dropoutRisk')}: {Math.round(c.dropoutRisk * 100)}%</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/courses/${c.course.slug ?? c.course.id}/attendance`}
                    className="text-xs font-medium rounded-md px-2 py-1"
                    style={{ color: '#3B82F6', background: 'rgba(59,130,246,0.08)' }}
                  >
                    {t('student.viewAttendance')}
                  </Link>
                  <Link
                    href={`/courses/${c.course.slug ?? c.course.id}/grades`}
                    className="text-xs font-medium rounded-md px-2 py-1"
                    style={{ color: '#3B82F6', background: 'rgba(59,130,246,0.08)' }}
                  >
                    {t('student.viewGrades')}
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </DashCard>
      </motion.div>
    </div>
  )
}
