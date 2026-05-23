'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  usersApi, enrollmentsApi, attendanceApi, assessmentsApi, analyticsApi,
  type User, type Enrollment, type GradeWithAssessment, type PyStudentEnrollmentAnalytics,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { toast } from 'sonner'
import { ArrowLeft, BookOpen, CalendarCheck, Star, BarChart2 } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

type Tab = 'overview' | 'analytics'

interface EnrollmentStats {
  enrollmentId: string
  courseTitle: string
  courseId: string
  status: string
  attendanceRate: number
  avgGrade: string
  dropoutRisk: number | null
}

function RiskGauge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 65 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#22c55e'
  const label = pct >= 65 ? 'High Risk' : pct >= 40 ? 'Medium Risk' : 'Low Risk'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative size-24">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
          <circle
            cx="50" cy="50" r="40" fill="none" strokeWidth="8"
            stroke={color}
            strokeDasharray={`${pct * 2.51} 251`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span className="text-lg font-bold" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <span className="text-sm font-medium" style={{ color }}>{label}</span>
    </div>
  )
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user: me } = useAuth()
  const [student, setStudent]         = useState<User | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [stats, setStats]             = useState<EnrollmentStats[]>([])
  const [tab, setTab]                 = useState<Tab>('overview')
  const [loading, setLoading]         = useState(true)
  const [selEnrollmentId, setSelEnrollmentId] = useState('')
  const [analyticsData, setAnalyticsData]     = useState<PyStudentEnrollmentAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsOffline, setAnalyticsOffline] = useState(false)

  const canView = me?.role === 'ADMIN' || me?.role === 'SUPER_ADMIN' ||
                  me?.role === 'TEACHER' || me?.id === id

  useEffect(() => {
    if (!canView) return
    Promise.all([
      usersApi.getById(id).then(r => setStudent(r.data)),
      enrollmentsApi.list(`studentId=${id}&limit=50`).then(r => {
        setEnrollments(r.data)
        return r.data
      }),
    ])
    .then(([, enrolls]) =>
      Promise.all(enrolls.map(async e => {
        const [attRes, gradeRes] = await Promise.all([
          attendanceApi.stats(e.id).catch(() => ({ data: { attendanceRate: 0, rate: 0 } })),
          assessmentsApi.gradesByEnrollment(e.id).catch(() => ({ data: [] as GradeWithAssessment[] })),
        ])
        const grades = gradeRes.data
        let avgGrade = '—'
        if (grades.length > 0) {
          const total = grades.reduce((s, g) => s + (Number(g.score) / Number(g.assessment.maxScore)) * 100, 0)
          avgGrade = `${(total / grades.length).toFixed(1)}%`
        }
        const rate = attRes.data.attendanceRate ?? attRes.data.rate ?? 0
        return {
          enrollmentId: e.id,
          courseTitle:  e.course.title,
          courseId:     e.course.id,
          status:       e.status,
          attendanceRate: Number(rate),
          avgGrade,
          dropoutRisk: e.dropoutRiskScore ?? null,
        } satisfies EnrollmentStats
      }))
    )
    .then(s => { setStats(s); if (s[0]) setSelEnrollmentId(s[0].enrollmentId) })
    .catch(e => toast.error(e.message))
    .finally(() => setLoading(false))
  }, [id, canView]) // eslint-disable-line

  useEffect(() => {
    if (tab !== 'analytics' || !selEnrollmentId || !id) return
    setAnalyticsLoading(true)
    setAnalyticsOffline(false)
    analyticsApi.studentEnrollment(id, selEnrollmentId)
      .then(r => setAnalyticsData(r.data))
      .catch(() => setAnalyticsOffline(true))
      .finally(() => setAnalyticsLoading(false))
  }, [tab, selEnrollmentId, id])

  if (!canView) return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <ArrowLeft className="size-4" />
      <span>Access denied.</span>
    </div>
  )

  if (loading || !student) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="h-24 bg-muted rounded" />
    </div>
  )

  const overallAtt = stats.length
    ? (stats.reduce((s, e) => s + e.attendanceRate, 0) / stats.length).toFixed(1)
    : '—'
  const gradedEnrollments = stats.filter(s => s.avgGrade !== '—')
  const overallGrade = gradedEnrollments.length
    ? `${(gradedEnrollments.reduce((s, e) => s + parseFloat(e.avgGrade), 0) / gradedEnrollments.length).toFixed(1)}%`
    : '—'
  const highRiskCount = stats.filter(s => s.dropoutRisk !== null && s.dropoutRisk >= 0.65).length

  const roleColor = (role: string) =>
    role === 'STUDENT' ? 'default' : role === 'TEACHER' ? 'secondary' : 'outline'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => history.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{student.firstName} {student.lastName}</h1>
          <p className="text-muted-foreground text-sm">{student.email}</p>
        </div>
        <Badge variant={roleColor(student.role)}>{student.role}</Badge>
        {!student.isActive && <Badge variant="destructive">Inactive</Badge>}
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: BookOpen,      label: 'Courses enrolled',  value: enrollments.length },
          { icon: CalendarCheck, label: 'Avg attendance',    value: overallAtt === '—' ? '—' : `${overallAtt}%` },
          { icon: Star,          label: 'Avg grade',         value: overallGrade },
          { icon: BookOpen,      label: 'High-risk courses', value: highRiskCount },
        ].map(({ label, value }) => (
          <Card key={label} size="sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle></CardHeader>
            <CardContent><p className="font-semibold text-lg">{value}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(['overview', 'analytics'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'overview' && <><BookOpen className="inline size-3.5 mr-1" />Overview</>}
            {t === 'analytics' && <><BarChart2 className="inline size-3.5 mr-1" />Analytics</>}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === 'overview' && (
        <Card>
          <CardHeader><CardTitle>Enrolled Courses</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Avg Grade</TableHead>
                  <TableHead>Dropout Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map(s => (
                  <TableRow key={s.enrollmentId}>
                    <TableCell className="font-medium">
                      <Link href={`/courses/${s.courseId}`} className="hover:underline">{s.courseTitle}</Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'ACTIVE' ? 'default' : 'outline'}>{s.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={Number(s.attendanceRate) < 60 ? 'text-destructive font-medium' : ''}>
                        {Number(s.attendanceRate).toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>{s.avgGrade}</TableCell>
                    <TableCell>
                      {s.dropoutRisk !== null ? (
                        <Badge variant={s.dropoutRisk >= 0.65 ? 'destructive' : s.dropoutRisk >= 0.4 ? 'secondary' : 'outline'}>
                          {(s.dropoutRisk * 100).toFixed(0)}%
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {stats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Not enrolled in any courses
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tab: Analytics */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          {/* Course selector */}
          {enrollments.length > 0 && (
            <Select value={selEnrollmentId} onValueChange={v => setSelEnrollmentId(v ?? '')}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select enrollment" /></SelectTrigger>
              <SelectContent>
                {stats.map(s => (
                  <SelectItem key={s.enrollmentId} value={s.enrollmentId}>{s.courseTitle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {analyticsOffline && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Analytics service offline — run <code className="font-mono">.\apps\analytics\start.ps1</code>
              </CardContent>
            </Card>
          )}

          {analyticsLoading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-32 bg-muted rounded" />
              <div className="h-48 bg-muted rounded" />
            </div>
          )}

          {!analyticsLoading && !analyticsOffline && analyticsData && (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Attendance (overall)', value: `${analyticsData.attendance_rate.toFixed(1)}%` },
                  { label: 'Attendance (2 weeks)', value: `${analyticsData.attendance_rate_2w.toFixed(1)}%` },
                  { label: 'Avg Grade',            value: `${analyticsData.avg_grade.toFixed(1)}%` },
                  { label: 'Assignments done',     value: `${analyticsData.assignments_completion.toFixed(1)}%` },
                ].map(({ label, value }) => (
                  <Card key={label} size="sm">
                    <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle></CardHeader>
                    <CardContent><p className="font-semibold text-lg">{value}</p></CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Grade trend */}
                {analyticsData.grade_trend.length > 0 && (
                  <Card className="lg:col-span-2">
                    <CardHeader><CardTitle className="text-base">Grade Trend</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={analyticsData.grade_trend}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v) => [`${v}%`, 'Avg Grade']} />
                          <Line type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2} dot />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Risk gauge */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Dropout Risk</CardTitle></CardHeader>
                  <CardContent className="flex flex-col items-center gap-3 pt-2">
                    <RiskGauge score={analyticsData.dropout_risk_score} />
                    <div className="text-xs text-muted-foreground text-center">
                      Last login {analyticsData.days_since_login.toFixed(0)} days ago
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Absence trend */}
              {analyticsData.absence_trend.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Weekly Absences (last 4 weeks)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={analyticsData.absence_trend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="absences" stroke="#ef4444" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
