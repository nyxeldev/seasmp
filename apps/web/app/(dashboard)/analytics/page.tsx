'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  analyticsApi, coursesApi,
  type DashboardStats, type Course,
  type PyCourseAnalytics, type PyRiskStudent, type PyTeacherKpi,
  type PyCourseFullAnalytics,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Users, BookOpen, ClipboardList, CalendarCheck,
  TrendingUp, AlertTriangle, RefreshCw, BarChart2,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const RISK_COLORS = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' }

function RiskBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="outline">No data</Badge>
  const pct = `${(score * 100).toFixed(0)}%`
  if (score >= 0.65) return <Badge variant="destructive">High · {pct}</Badge>
  if (score >= 0.40) return <Badge variant="outline" className="border-amber-400 text-amber-700">Med · {pct}</Badge>
  return <Badge variant="secondary" className="text-green-700">Low · {pct}</Badge>
}

export default function AnalyticsPage() {
  const { user } = useAuth()
  if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') return <AdminAnalytics />
  if (user?.role === 'TEACHER') return <TeacherAnalytics userId={user.id} />
  return <div className="text-muted-foreground">Analytics sizning rolingiz uchun mavjud emas.</div>
}

// ─── Admin ─────────────────────────────────────────────────────────────────
function AdminAnalytics() {
  const [stats, setStats]         = useState<DashboardStats | null>(null)
  const [riskData, setRiskData]   = useState<PyRiskStudent[]>([])
  const [riskLoading, setRiskLoading] = useState(false)
  const [pyOffline, setPyOffline] = useState(false)
  const [triggering, setTriggering] = useState(false)

  const loadDashboard = () =>
    analyticsApi.dashboard().then(r => setStats(r.data)).catch(e => toast.error(e.message))

  const loadHighRisk = useCallback(() => {
    setRiskLoading(true)
    setPyOffline(false)
    analyticsApi.dropoutRisk('limit=25')
      .then(r => { setRiskData(r.data.data); setPyOffline(false) })
      .catch(() => { setPyOffline(true); setRiskData([]) })
      .finally(() => setRiskLoading(false))
  }, [])

  useEffect(() => { loadDashboard(); loadHighRisk() }, [loadHighRisk]) // eslint-disable-line

  const triggerCalc = async () => {
    setTriggering(true)
    try {
      await analyticsApi.triggerCalculation()
      toast.success('ETL task queued — risk scores will update shortly')
      setTimeout(loadHighRisk, 3000)
    } catch { toast.error('Analytics service offline') }
    finally { setTriggering(false) }
  }

  const kpiItems = stats ? [
    { label: 'Total Users',        value: stats.users?.total ?? stats.totalUsers ?? 0,        icon: Users },
    { label: 'Total Courses',      value: stats.courses?.total ?? stats.totalCourses ?? 0,    icon: BookOpen },
    { label: 'Active Enrollments', value: stats.enrollments?.active ?? stats.activeEnrollments ?? 0, icon: ClipboardList },
    { label: 'Avg Attendance',
      value: `${((stats.attendance?.rate ?? stats.avgAttendanceRate ?? 0)).toFixed(1)}%`,
      icon: CalendarCheck },
  ] : []

  // Risk distribution pie
  const risksForChart = riskData.slice(0, 10).map(r => ({
    name: `${r.student.firstName} ${r.student.lastName}`,
    risk: Math.round(r.riskScore * 100),
  }))

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadHighRisk} disabled={riskLoading}>
            <RefreshCw className={`size-4 mr-1.5 ${riskLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={triggerCalc} disabled={triggering || pyOffline}>
            <TrendingUp className="size-4 mr-1.5" />
            {triggering ? 'Queuing…' : 'Run ETL'}
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiItems.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-muted-foreground font-normal">{label}</CardTitle>
                  <Icon className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent><p className="text-3xl font-bold">{value}</p></CardContent>
            </Card>
          ))}
        </div>
      )}

      {pyOffline && (
        <Card>
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            Analytics service offline — run <code className="font-mono">.\apps\analytics\start.ps1</code> to start it.
          </CardContent>
        </Card>
      )}

      {/* High risk bar chart */}
      {risksForChart.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-destructive" />
                Top {risksForChart.length} High-Risk Students
              </CardTitle>
              <Link href="/analytics/risk">
                <Button variant="outline" size="sm">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={risksForChart} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}%`, 'Risk']} />
                <Bar dataKey="risk" radius={[4, 4, 0, 0]}>
                  {risksForChart.map((entry, i) => (
                    <Cell key={i} fill={entry.risk >= 65 ? RISK_COLORS.high : entry.risk >= 40 ? RISK_COLORS.medium : RISK_COLORS.low} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* High-risk table */}
      {riskData.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">High Dropout Risk Students</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {riskData.map(r => (
                <TableRow key={r.enrollmentId}>
                  <TableCell className="font-medium">{r.student.firstName} {r.student.lastName}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.student.email}</TableCell>
                  <TableCell className="text-sm">{r.courseTitle}</TableCell>
                  <TableCell>
                    <span className={r.attendanceRate < 60 ? 'text-destructive font-medium' : ''}>
                      {r.attendanceRate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell><RiskBadge score={r.riskScore} /></TableCell>
                  <TableCell>
                    <Link href={`/students/${r.studentId}`}>
                      <Button variant="ghost" size="xs">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─── Teacher ───────────────────────────────────────────────────────────────
function TeacherAnalytics({ userId }: { userId: string }) {
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

    analyticsApi.teacherKpi(userId)
      .then(r => setKpi(r.data))
      .catch(() => {})
  }, [userId])

  useEffect(() => {
    if (!courseId) return
    setPyStats(null)
    setPyOffline(false)
    analyticsApi.courseFull(courseId)
      .then(r => { setPyStats(r.data as any); setPyOffline(false) })
      .catch(() => setPyOffline(true))
  }, [courseId])

  const computeScores = async () => {
    if (!courseId) return
    setScoring(true)
    try {
      await analyticsApi.triggerCalculation()
      toast.success('Scoring queued — refresh in a few seconds')
      setTimeout(() => {
        analyticsApi.courseFull(courseId)
          .then(r => setPyStats(r.data as any))
          .catch(() => {})
      }, 5000)
    } catch { toast.error('Analytics service offline') }
    finally { setScoring(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Course Analytics</h1>
        <Select value={courseId} onValueChange={v => setCourseId(v ?? '')}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Select course" /></SelectTrigger>
          <SelectContent>
            {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={computeScores} disabled={scoring || !courseId}>
          <RefreshCw className={`size-4 mr-1.5 ${scoring ? 'animate-spin' : ''}`} />
          {scoring ? 'Queuing…' : 'Compute Risk'}
        </Button>
      </div>

      {/* Teacher KPI summary */}
      {kpi && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'My Courses',    value: kpi.total_courses },
            { label: 'My Students',   value: kpi.total_students },
            { label: 'Avg Attendance', value: `${kpi.avg_attendance_rate.toFixed(1)}%` },
            { label: 'At-Risk',       value: kpi.at_risk_students_count },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle>
              </CardHeader>
              <CardContent><p className="text-2xl font-bold">{value}</p></CardContent>
            </Card>
          ))}
        </div>
      )}

      {pyOffline && (
        <Card>
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            Analytics service offline — run <code className="font-mono">.\apps\analytics\start.ps1</code>
          </CardContent>
        </Card>
      )}

      {pyStats && (
        <>
          {/* Weekly attendance line chart */}
          {pyStats.weekly_attendance.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Weekly Attendance Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={pyStats.weekly_attendance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [`${v}%`, 'Attendance']} />
                    <Line type="monotone" dataKey="rate" stroke="#6366f1" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Risk distribution pie */}
            <Card>
              <CardHeader><CardTitle className="text-base">Dropout Risk Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Low', value: pyStats.dropout_risk_distribution.low },
                        { name: 'Medium', value: pyStats.dropout_risk_distribution.medium },
                        { name: 'High', value: pyStats.dropout_risk_distribution.high },
                      ]}
                      cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}
                    >
                      <Cell fill={RISK_COLORS.low} />
                      <Cell fill={RISK_COLORS.medium} />
                      <Cell fill={RISK_COLORS.high} />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Grade distribution bar */}
            {pyStats.grade_distribution.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Grade Distribution</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={pyStats.grade_distribution} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* At-risk students */}
          {pyStats.at_risk_students.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="size-4 text-destructive" />
                    At-Risk Students ({pyStats.at_risk_students.length})
                  </CardTitle>
                  <Link href="/analytics/risk">
                    <Button variant="outline" size="sm">View All</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pyStats.at_risk_students.map(s => (
                    <div key={s.enrollmentId} className="flex items-center justify-between py-1 border-b last:border-0">
                      <Link href={`/students/${s.id}`} className="text-sm font-medium hover:underline">{s.name}</Link>
                      <RiskBadge score={s.riskScore} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
