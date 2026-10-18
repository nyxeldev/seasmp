'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { analyticsApi, coursesApi, type Course, type PyTeacherKpi, type PyCourseFullAnalytics } from '@/lib/api'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DC, DarkTooltip, RiskBar } from './analytics-ui'

function useTeacherAnalyticsData(userId: string) {
  const [courses, setCourses]   = useState<Course[]>([])
  const [courseId, setCourseId] = useState('')
  const [kpi, setKpi]           = useState<PyTeacherKpi | null>(null)
  const [pyStats, setPyStats]   = useState<PyCourseFullAnalytics | null>(null)
  const [scoring, setScoring]   = useState(false)
  const [pyOffline, setPyOffline] = useState(false)

  useEffect(() => {
    coursesApi.list('limit=100').then(r => {
      const mine = r.data.filter(c => c.teacher.id === userId)
      setCourses(mine)
      if (mine[0]) setCourseId(mine[0].id)
    }).catch(() => {})
    analyticsApi.teacherKpi(userId).then(r => setKpi(r.data)).catch(() => {})
  }, [userId])

  useEffect(() => {
    if (!courseId) return
    setPyStats(null); setPyOffline(false)
    analyticsApi.courseFull(courseId)
      .then(r => { setPyStats(r.data as any); setPyOffline(false) })
      .catch(() => setPyOffline(true))
  }, [courseId])

  const computeScores = async () => {
    if (!courseId) return
    setScoring(true)
    try {
      await analyticsApi.triggerCalculation()
      toast.success("Scoring navbatga qo'yildi")
      setTimeout(() => {
        analyticsApi.courseFull(courseId).then(r => setPyStats(r.data as any)).catch(() => {})
      }, 5000)
    } catch { toast.error('Analytics servisi ishlamayapti') }
    finally { setScoring(false) }
  }

  return { courses, courseId, setCourseId, kpi, pyStats, scoring, pyOffline, computeScores }
}

export function TeacherAnalytics({ userId }: { userId: string }) {
  const {
    courses, courseId, setCourseId, kpi, pyStats, scoring, pyOffline, computeScores,
  } = useTeacherAnalyticsData(userId)

  const kpiCards = kpi ? [
    { label: 'Kurslarim',       value: kpi.total_courses },
    { label: 'Talabalarim',     value: kpi.total_students },
    { label: 'Avg Davomat',     value: `${kpi.avg_attendance_rate.toFixed(1)}%` },
    { label: 'Xavf ostidagi',   value: kpi.at_risk_students_count },
  ] : []

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--s-text)' }}>Kurs Analitikasi</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>O'qituvchi ko'rinishi</p>
        </div>
        <Select value={courseId} onValueChange={v => setCourseId(v ?? '')} items={Object.fromEntries(courses.map(c => [c.id, c.title]))}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Kursni tanlang" /></SelectTrigger>
          <SelectContent>
            {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <button onClick={computeScores} disabled={scoring || !courseId}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--s-border)', color: 'var(--s-muted)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
          <RefreshCw className={`size-4 ${scoring ? 'animate-spin' : ''}`} />
          {scoring ? 'Navbatda...' : 'Xavfni hisoblash'}
        </button>
      </div>

      {kpiCards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ label, value }) => (
            <DC key={label}>
              <p className="text-xs mb-2" style={{ color: 'var(--s-muted)' }}>{label}</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--s-text)' }}>{value}</p>
            </DC>
          ))}
        </div>
      )}

      {pyOffline && (
        <DC>
          <p className="text-sm text-center" style={{ color: 'var(--s-muted)' }}>
            Analytics servisi offline —{' '}
            <code className="text-xs text-blue-400 font-mono">.\apps\analytics\start.ps1</code>
          </p>
        </DC>
      )}

      {pyStats && (
        <div className="space-y-4">
          {pyStats.weekly_attendance.length > 0 && (
            <DC>
              <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--s-text)' }}>Haftalik davomat trendi</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={pyStats.weekly_attendance} margin={{ left: -20 }}>
                  <CartesianGrid stroke="var(--s-border)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v}%`} />
                  <Tooltip content={<DarkTooltip unit="%" />} />
                  <Line type="monotone" dataKey="rate" stroke="#22C55E" strokeWidth={2.5}
                    dot={{ fill: '#22C55E', r: 3, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </DC>
          )}

          {pyStats.at_risk_students.length > 0 && (
            <DC>
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--s-text)' }}>
                <AlertTriangle className="size-[18px] text-red-400" />
                Xavf ostidagi talabalar ({pyStats.at_risk_students.length})
              </h2>
              <div className="space-y-2">
                {pyStats.at_risk_students.map(s => (
                  <div key={s.enrollmentId}
                    className="flex items-center gap-3 py-2 border-b last:border-0"
                    style={{ borderColor: 'var(--s-border)' }}>
                    <span className="text-sm font-medium flex-1" style={{ color: 'var(--s-text)' }}>{s.name}</span>
                    <RiskBar score={Math.round(s.riskScore * 100)} />
                    <Link href={`/students/${s.id}`}>
                      <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0">Ko'rish</button>
                    </Link>
                  </div>
                ))}
              </div>
            </DC>
          )}
        </div>
      )}
    </div>
  )
}
