'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  analyticsApi, coursesApi, usersApi,
  type DashboardStats, type Course,
  type PyRiskStudent, type PyTeacherKpi, type PyCourseFullAnalytics,
  type AnalyticsOverview,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useLocale } from '@/store/locale'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { RoleGuard } from '@/components/RoleGuard'
import {
  TrendingUp, AlertTriangle, RefreshCw, TrendingDown,
  GraduationCap, CalendarCheck, ShieldAlert,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar,
  PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'

// ── Animation ──────────────────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
})

// ── Card shell ────────────────────────────────────────────────────────────────
function DC({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border p-5 ${className}`}
      style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}>
      {children}
    </div>
  )
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DarkTooltip({ active, payload, label, unit = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--s-bg)', border: '1px solid var(--s-border)',
      borderRadius: '8px', padding: '8px 12px', fontSize: '12px',
    }}>
      {label && <p style={{ color: 'var(--s-muted)', marginBottom: '4px' }}>{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? '#3B82F6', fontWeight: 600 }}>
          {p.name ? `${p.name}: ` : ''}{p.value}{unit}
        </p>
      ))}
    </div>
  )
}

// Topshiriq turining o'zbekcha nomi — diagramma o'qi uchun
const TYPE_LABEL: Record<string, string> = {
  QUIZ: 'Nazorat', HOMEWORK: 'Uy ishi', MIDTERM: 'Oraliq', FINAL: 'Yakuniy',
}

// ── Risk bar color ────────────────────────────────────────────────────────────
function riskColor(score: number) {
  return score >= 80 ? '#EF4444' : score >= 60 ? '#F97316' : score >= 40 ? '#F59E0B' : '#22C55E'
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function RiskBar({ score }: { score: number }) {
  const color = riskColor(score)
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--s-border)' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-medium tabular-nums w-9 text-right" style={{ color }}>{score}%</span>
    </div>
  )
}

// ── Admin analytics ────────────────────────────────────────────────────────────
function AdminAnalytics() {
  const { t } = useLocale()
  const [stats, setStats]         = useState<DashboardStats | null>(null)
  const [riskData, setRiskData]   = useState<PyRiskStudent[]>([])
  const [riskLoading, setRiskLoading] = useState(false)
  const [pyOffline, setPyOffline] = useState(false)
  const [triggering, setTriggering] = useState(false)
  // Sahifadagi ko'rsatkichlar ilgari qattiq yozilgan massivlardan chizilardi
  // (78.4 o'rtacha baho, MOCK_DROPOUT ro'yxati). Endi hammasi shu yerdan.
  const [ov, setOv] = useState<AnalyticsOverview | null>(null)
  // Radar diagrammasi ilgari uchta o'ylab topilgan o'qituvchining qattiq
  // yozilgan ko'rsatkichlarini chizardi. Endi haqiqiy KPI endpointidan.
  const [teacherKpis, setTeacherKpis] = useState<{ name: string; kpi: PyTeacherKpi }[]>([])
  // Ilgari bu yerda ikkita sana kiritish maydoni bor edi, lekin hech
  // narsaga ulanmagan edi — tanlangan sana hech qachon so'rovga
  // qo'shilmasdi. Backend faqat "oxirgi N kun" oynasini qo'llaydi, aniq
  // sana oralig'ini emas — shuning uchun ishlaydigan narsa taklif
  // qilinadi: haqiqatan API'ga boradigan oyna uzunligi.
  const [windowDays, setWindowDays] = useState(120)

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

  useEffect(() => {
    let cancelled = false
    analyticsApi.overview(windowDays)
      .then(r => { if (!cancelled) setOv(r.data) })
      .catch(() => { if (!cancelled) setOv(null) })

    // Eng ko'p talabaga ega uchta o'qituvchi
    usersApi.list('role=TEACHER&limit=50')
      .then(async res => {
        const picked = res.data.slice(0, 3)
        const rows = await Promise.all(picked.map(async u => {
          try {
            const k = await analyticsApi.teacherKpi(u.id)
            return { name: u.lastName, kpi: k.data }
          } catch { return null }
        }))
        if (!cancelled) setTeacherKpis(rows.filter(Boolean) as { name: string; kpi: PyTeacherKpi }[])
      })
      .catch(() => { if (!cancelled) setTeacherKpis([]) })

    return () => { cancelled = true }
  }, [windowDays])

  const triggerCalc = async () => {
    setTriggering(true)
    try {
      await analyticsApi.triggerCalculation()
      toast.success('ETL navbatga qo\'yildi — tez orada yangilanadi')
      setTimeout(loadHighRisk, 3000)
    } catch { toast.error('Analytics servisi ishlamayapti') }
    finally { setTriggering(false) }
  }

  // Derive metric card values
  const avgAttendance = stats
    ? (stats.attendance?.rate ?? (stats as any).avgAttendanceRate ?? 0).toFixed(1)
    : '—'

  const avgRisk = riskData.length > 0
    ? Math.round(riskData.reduce((s, r) => s + r.riskScore, 0) / riskData.length * 100)
    : null

  // Baholash turiga ko'ra o'rtacha — haqiqiy baholardan
  const gradesData = useMemo(
    () => (ov?.gradesByType ?? []).map(g => ({
      name: TYPE_LABEL[g.type] ?? g.type,
      avg:  g.avg,
    })),
    [ov],
  )

  // Davomat dinamikasi — kunlik foizlar haftalarga yig'iladi
  const attTrend = useMemo(() => {
    const rows = ov?.attendanceTrend ?? []
    if (rows.length === 0) return []
    const perWeek = new Map()
    const first = new Date(rows[0].date).getTime()
    for (const r of rows) {
      const w = Math.floor((new Date(r.date).getTime() - first) / (7 * 86400000))
      const cell = perWeek.get(w) ?? { sum: 0, n: 0 }
      cell.sum += r.rate; cell.n += 1
      perWeek.set(w, cell)
    }
    return [...perWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([w, c]) => ({ week: `${w + 1}-h`, pct: Math.round((c.sum / c.n) * 10) / 10 }))
  }, [ov])

  // Radar uchun: barcha o'lchamlar 0-100 shkalasida bo'lishi kerak
  const radarData = useMemo(() => {
    if (teacherKpis.length === 0) return []
    const maxStudents = Math.max(...teacherKpis.map(t => t.kpi.total_students), 1)
    const keys = ['A', 'B', 'C'] as const
    const rows: Record<string, string | number>[] = [
      { metric: 'Davomat %' },
      { metric: "O'rtacha baho" },
      { metric: 'Yuklama' },
      { metric: 'Xavfsiz ulush' },
    ]
    teacherKpis.forEach((t, i) => {
      const k = keys[i]
      const riskShare = t.kpi.total_students > 0
        ? (t.kpi.at_risk_students_count / t.kpi.total_students) * 100
        : 0
      rows[0][k] = Math.round(t.kpi.avg_attendance_rate)
      rows[1][k] = Math.round(t.kpi.avg_grade)
      rows[2][k] = Math.round((t.kpi.total_students / maxStudents) * 100)
      rows[3][k] = Math.round(100 - riskShare)
    })
    return rows
  }, [teacherKpis])

  const metricCards = [
    {
      label: t('analytics.avgGrade'),
      value: ov?.avgGrade != null ? ov.avgGrade.toFixed(1) : '—',
      unit: '/100',
      icon: GraduationCap,
      trendUp: true,
      trend: ov ? `${ov.gradesByType.reduce((n, g) => n + g.count, 0)} ta baho` : '',
      color: '#3B82F6',
    },
    {
      label: t('analytics.attendanceTrend'),
      value: ov?.attendanceRate != null ? ov.attendanceRate.toFixed(1) : '—',
      unit: '%',
      icon: CalendarCheck,
      trendUp: (ov?.attendanceDelta ?? 0) >= 0,
      trend: ov?.attendanceDelta != null
        ? `${ov.attendanceDelta > 0 ? '+' : ''}${ov.attendanceDelta}% oldingi davrga`
        : '',
      color: '#22C55E',
    },
    {
      label: t('analytics.avgRisk'),
      value: ov?.avgRisk != null ? String(Math.round(ov.avgRisk)) : '—',
      unit: '%',
      icon: ShieldAlert,
      trendUp: false,
      trend: ov ? `${ov.highRisk} ta yuqori xavfda` : '',
      color: '#F59E0B',
    },
  ]

  // Qoldirish xavfi: Python servisidan, u yetib bormasa umumiy ko'rsatkichdan
  const dropoutRows = riskData.length > 0
    ? riskData.slice(0, 8).map(r => ({
        name:   `${r.student.firstName} ${r.student.lastName}`,
        course: r.courseTitle,
        score:  Math.round(r.riskScore * 100),
        att:    Math.round(r.attendanceRate),
        trend:  r.riskScore > 0.6 ? 'up' : 'down',
        id:     r.studentId,
      }))
    : (ov?.topRisk ?? []).map(r => ({
        name:   r.studentName,
        course: r.courseTitle,
        score:  Math.round(r.score * 100),
        att:    0,
        trend:  r.score > 0.6 ? 'up' : 'down',
        id:     r.studentId,
      }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--s-text)' }}>{t('analytics.title')}</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>
            {pyOffline ? '⚠ Analytics servisi ishlamayapti — qiymatlar bazadan hisoblanmoqda' : 'Real-time tahlil'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Oyna uzunligi — API faqat "oxirgi N kun"ni qo'llab-quvvatlaydi */}
          <select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
            style={{ background: 'var(--s-bg-card)', border: '1px solid var(--s-border)', color: 'var(--s-text)' }}>
            <option value={30}>So'nggi 30 kun</option>
            <option value={60}>So'nggi 60 kun</option>
            <option value={120}>So'nggi 120 kun</option>
          </select>
          <button onClick={loadHighRisk} disabled={riskLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors"
            style={{ borderColor: 'var(--s-border)', color: 'var(--s-muted)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <RefreshCw className={`size-4 ${riskLoading ? 'animate-spin' : ''}`} /> {t('attendance.refresh')}
          </button>
          <button onClick={triggerCalc} disabled={triggering || pyOffline}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white seasmp-btn disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>
            <TrendingUp className="size-4" /> {triggering ? 'Navbatda...' : 'ETL ishlatish'}
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        initial="hidden" animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
      >
        {metricCards.map(({ label, value, unit, icon: Icon, trendUp, trend, color }) => (
          <motion.div key={label}
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } } }}>
            <DC>
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-medium" style={{ color: 'var(--s-muted)' }}>{label}</p>
                <div className="p-2 rounded-lg" style={{ background: `${color}18` }}>
                  <Icon className="size-[18px]" style={{ color }} />
                </div>
              </div>
              <p className="text-3xl font-bold tabular-nums mb-2" style={{ color: 'var(--s-text)' }}>
                {value}<span className="text-base font-normal ml-0.5" style={{ color: 'var(--s-muted)' }}>{unit}</span>
              </p>
              <div className="flex items-center gap-1 text-xs" style={{ color: trendUp ? '#22C55E' : '#F59E0B' }}>
                {trendUp ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                <span>{trend}</span>
              </div>
            </DC>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts row 1: Bar + Line */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div {...fadeUp(0.2)}>
          <DC>
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--s-text)' }}>Baholar (baholash turiga ko'ra)</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--s-muted)' }}>O'rtacha ball, 100 dan</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={gradesData} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--s-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTooltip unit="" />} />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {gradesData.map((entry, i) => (
                    <Cell key={i}
                      fill={entry.avg >= 80 ? '#22C55E' : entry.avg >= 70 ? '#3B82F6' : '#F59E0B'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DC>
        </motion.div>

        <motion.div {...fadeUp(0.25)}>
          <DC>
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--s-text)' }}>Davomat dinamikasi</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--s-muted)' }}>Haftalik davomat foizi</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={attTrend} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#22C55E" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#22C55E" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--s-border)" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[80, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} />
                <Tooltip content={<DarkTooltip unit="%" />} />
                <Line type="monotone" dataKey="pct" stroke="#22C55E" strokeWidth={2.5}
                  dot={{ fill: '#22C55E', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#22C55E', stroke: 'var(--s-bg)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </DC>
        </motion.div>
      </div>

      {/* Radar chart: Teacher KPI */}
      <motion.div {...fadeUp(0.3)}>
        <DC>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>O'qituvchilar KPI taqqoslamasi</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>Asosiy ko'rsatkichlar bo'yicha</p>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--s-muted)' }}>
              {teacherKpis.map((t, i) => (
                <span key={t.kpi.teacherId} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full inline-block"
                    style={{ background: ['#3B82F6', '#22C55E', '#F59E0B'][i] }} />
                  {t.name}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
              <PolarGrid stroke="var(--s-border)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748B', fontSize: 11 }} />
              <Radar name={teacherKpis[0]?.name ?? "A"} dataKey="A" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.12} strokeWidth={2} />
              <Radar name={teacherKpis[1]?.name ?? "B"} dataKey="B" stroke="#22C55E" fill="#22C55E" fillOpacity={0.12} strokeWidth={2} />
              <Radar name={teacherKpis[2]?.name ?? "C"} dataKey="C" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.12} strokeWidth={2} />
              <Tooltip content={<DarkTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </DC>
      </motion.div>

      {/* Dropout risk table */}
      <motion.div {...fadeUp(0.35)}>
        <DC>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-[18px]" style={{ color: '#EF4444' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>Qoldirish xavfi — talabalar</h2>
            </div>
            <Link href="/analytics/risk">
              <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                Barchasi →
              </button>
            </Link>
          </div>

          <div className="space-y-0">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--s-muted)' }}>
              <div className="col-span-4">Talaba</div>
              <div className="col-span-3">Kurs</div>
              <div className="col-span-1 text-center">Davomat</div>
              <div className="col-span-3">Xavf darajasi</div>
              <div className="col-span-1 text-center">Trend</div>
            </div>

            {dropoutRows.map((r, i) => (
              <motion.div
                key={`${r.name}:${r.course}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.05 }}
                className="grid grid-cols-12 gap-3 px-3 py-3 rounded-lg transition-colors items-center border-t"
                style={{ borderColor: 'var(--s-border)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  <div className="size-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: riskColor(r.score) + '33', color: 'var(--s-text)' }}>
                    {r.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--s-text)' }}>{r.name}</span>
                </div>
                <div className="col-span-3 text-xs truncate" style={{ color: 'var(--s-muted)' }}>{r.course}</div>
                <div className="col-span-1 text-center">
                  <span className="text-xs font-medium" style={{ color: r.att < 70 ? '#EF4444' : 'var(--s-text)' }}>
                    {r.att}%
                  </span>
                </div>
                <div className="col-span-3">
                  <RiskBar score={r.score} />
                </div>
                <div className="col-span-1 flex justify-center">
                  {r.trend === 'up'
                    ? <TrendingUp className="size-[18px] text-red-400" />
                    : <TrendingDown className="size-[18px] text-green-400" />
                  }
                </div>
              </motion.div>
            ))}
          </div>
        </DC>
      </motion.div>
    </div>
  )
}

// ── Teacher analytics ──────────────────────────────────────────────────────────
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

// ── Page ──────────────────────────────────────────────────────────────────────
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
