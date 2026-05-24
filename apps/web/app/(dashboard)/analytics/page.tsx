'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  analyticsApi, coursesApi,
  type DashboardStats, type Course,
  type PyRiskStudent, type PyTeacherKpi, type PyCourseFullAnalytics,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
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

// ── Dark card shell ────────────────────────────────────────────────────────────
function DC({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border p-5 ${className}`}
      style={{ background: '#1E293B', borderColor: 'rgba(255,255,255,0.06)' }}>
      {children}
    </div>
  )
}

// ── Dark chart tooltip ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DarkTooltip({ active, payload, label, unit = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', padding: '8px 12px', fontSize: '12px',
    }}>
      {label && <p style={{ color: '#94A3B8', marginBottom: '4px' }}>{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? '#3B82F6', fontWeight: 600 }}>
          {p.name ? `${p.name}: ` : ''}{p.value}{unit}
        </p>
      ))}
    </div>
  )
}

// ── Mock static data ──────────────────────────────────────────────────────────
const GRADES_DATA = [
  { name: '1-test',   avg: 74 }, { name: '2-test',   avg: 79 },
  { name: 'Muqobil',  avg: 68 }, { name: '3-test',   avg: 82 },
  { name: 'Yakuniy',  avg: 71 },
]

const ATT_TREND = [
  { week: '1-h', pct: 88 }, { week: '2-h', pct: 91 }, { week: '3-h', pct: 85 },
  { week: '4-h', pct: 93 }, { week: '5-h', pct: 90 }, { week: '6-h', pct: 87 },
  { week: '7-h', pct: 94 }, { week: '8-h', pct: 92 },
]

const RADAR_DATA = [
  { metric: "Davomat %",          A: 92, B: 87, C: 95 },
  { metric: "O'rtacha baho",      A: 78, B: 81, C: 73 },
  { metric: "Tugatish %",         A: 85, B: 90, C: 88 },
  { metric: "Talaba faolligi",    A: 70, B: 75, C: 68 },
  { metric: "Xavf oldini olish",  A: 60, B: 65, C: 72 },
]

const MOCK_DROPOUT = [
  { name: 'Aliyev Jasur',     course: 'Matematika', score: 87, att: 61, trend: 'up'   },
  { name: 'Karimova Nilufar', course: 'Fizika',     score: 71, att: 74, trend: 'up'   },
  { name: 'Toshmatov Bobur',  course: 'Kimyo',      score: 64, att: 79, trend: 'down' },
  { name: 'Rahimova Zulfiya', course: 'Biologiya',  score: 52, att: 83, trend: 'down' },
  { name: 'Nazarov Sherzod',  course: 'Tarix',      score: 43, att: 88, trend: 'down' },
]

// ── Risk bar color ────────────────────────────────────────────────────────────
function riskColor(score: number) {
  return score >= 80 ? '#EF4444' : score >= 60 ? '#F97316' : score >= 40 ? '#F59E0B' : '#22C55E'
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function RiskBar({ score }: { score: number }) {
  const color = riskColor(score)
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-medium tabular-nums w-9 text-right" style={{ color }}>{score}%</span>
    </div>
  )
}

// ── Admin analytics ────────────────────────────────────────────────────────────
function AdminAnalytics() {
  const [stats, setStats]         = useState<DashboardStats | null>(null)
  const [riskData, setRiskData]   = useState<PyRiskStudent[]>([])
  const [riskLoading, setRiskLoading] = useState(false)
  const [pyOffline, setPyOffline] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')

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

  const metricCards = [
    {
      label: "O'rtacha baho",
      value: '78.4',
      unit: '/100',
      icon: GraduationCap,
      trendUp: true,
      trend: '+2.1 bu oy',
      color: '#3B82F6',
    },
    {
      label: 'Davomat trendi',
      value: avgAttendance === '—' ? '91.2' : avgAttendance,
      unit: '%',
      icon: CalendarCheck,
      trendUp: true,
      trend: '+1.8% haftalik',
      color: '#22C55E',
    },
    {
      label: "O'rtacha xavf darajasi",
      value: avgRisk !== null ? String(avgRisk) : '34',
      unit: '%',
      icon: ShieldAlert,
      trendUp: false,
      trend: pyOffline ? 'Real-time ma\'lumot yo\'q' : '-3% bu hafta',
      color: '#F59E0B',
    },
  ]

  // Dropout table: prefer real data, fall back to mock
  const dropoutRows = riskData.length > 0
    ? riskData.slice(0, 8).map(r => ({
        name:   `${r.student.firstName} ${r.student.lastName}`,
        course: r.courseTitle,
        score:  Math.round(r.riskScore * 100),
        att:    Math.round(r.attendanceRate),
        trend:  r.riskScore > 0.6 ? 'up' : 'down',
        id:     r.studentId,
      }))
    : MOCK_DROPOUT.map(r => ({ ...r, id: undefined }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Analytics</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {pyOffline ? '⚠ Analytics servisi offline — mock data ko\'rsatilmoqda' : 'Real-time tahlil'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range */}
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs text-white outline-none"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)' }} />
          <span className="text-xs text-slate-500">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs text-white outline-none"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)' }} />
          <button onClick={loadHighRisk} disabled={riskLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 border transition-colors hover:bg-slate-700/50"
            style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
            <RefreshCw className={`size-3.5 ${riskLoading ? 'animate-spin' : ''}`} /> Yangilash
          </button>
          <button onClick={triggerCalc} disabled={triggering || pyOffline}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white seasmp-btn disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>
            <TrendingUp className="size-3.5" /> {triggering ? 'Navbatda...' : 'ETL ishlatish'}
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
                <p className="text-xs font-medium text-slate-400">{label}</p>
                <div className="p-2 rounded-lg" style={{ background: `${color}18` }}>
                  <Icon className="size-4" style={{ color }} />
                </div>
              </div>
              <p className="text-3xl font-bold text-white tabular-nums mb-2">
                {value}<span className="text-base font-normal text-slate-400 ml-0.5">{unit}</span>
              </p>
              <div className="flex items-center gap-1 text-xs" style={{ color: trendUp ? '#22C55E' : '#F59E0B' }}>
                {trendUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
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
            <h2 className="text-sm font-semibold text-white mb-1">Baholar (baholash turiga ko'ra)</h2>
            <p className="text-xs text-slate-400 mb-4">O'rtacha ball, 100 dan</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={GRADES_DATA} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTooltip unit="" />} />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {GRADES_DATA.map((entry, i) => (
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
            <h2 className="text-sm font-semibold text-white mb-1">Davomat dinamikasi</h2>
            <p className="text-xs text-slate-400 mb-4">Haftalik davomat foizi</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ATT_TREND} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#22C55E" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#22C55E" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[80, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} />
                <Tooltip content={<DarkTooltip unit="%" />} />
                <Line type="monotone" dataKey="pct" stroke="#22C55E" strokeWidth={2.5}
                  dot={{ fill: '#22C55E', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#22C55E', stroke: '#0F172A', strokeWidth: 2 }} />
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
              <h2 className="text-sm font-semibold text-white">O'qituvchilar KPI taqqoslamasi</h2>
              <p className="text-xs text-slate-400 mt-0.5">Asosiy ko'rsatkichlar bo'yicha</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full inline-block" style={{ background: '#3B82F6' }} />
                Toshmatov
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full inline-block" style={{ background: '#22C55E' }} />
                Rahimov
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full inline-block" style={{ background: '#F59E0B' }} />
                Karimov
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={RADAR_DATA} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748B', fontSize: 11 }} />
              <Radar name="Toshmatov" dataKey="A" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.12} strokeWidth={2} />
              <Radar name="Rahimov"   dataKey="B" stroke="#22C55E" fill="#22C55E" fillOpacity={0.12} strokeWidth={2} />
              <Radar name="Karimov"   dataKey="C" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.12} strokeWidth={2} />
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
              <AlertTriangle className="size-4" style={{ color: '#EF4444' }} />
              <h2 className="text-sm font-semibold text-white">Qoldirish xavfi — talabalar</h2>
            </div>
            <Link href="/analytics/risk">
              <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                Barchasi →
              </button>
            </Link>
          </div>

          <div className="space-y-0">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              <div className="col-span-4">Talaba</div>
              <div className="col-span-3">Kurs</div>
              <div className="col-span-1 text-center">Davomat</div>
              <div className="col-span-3">Xavf darajasi</div>
              <div className="col-span-1 text-center">Trend</div>
            </div>

            {dropoutRows.map((r, i) => (
              <motion.div
                key={r.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.05 }}
                className="grid grid-cols-12 gap-3 px-3 py-3 rounded-lg hover:bg-white/3 transition-colors items-center border-t"
                style={{ borderColor: 'rgba(255,255,255,0.04)' }}
              >
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  <div className="size-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: riskColor(r.score) + '33' }}>
                    {r.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span className="text-sm font-medium text-white truncate">{r.name}</span>
                </div>
                <div className="col-span-3 text-xs text-slate-400 truncate">{r.course}</div>
                <div className="col-span-1 text-center">
                  <span className={`text-xs font-medium ${r.att < 70 ? 'text-red-400' : 'text-slate-300'}`}>
                    {r.att}%
                  </span>
                </div>
                <div className="col-span-3">
                  <RiskBar score={r.score} />
                </div>
                <div className="col-span-1 flex justify-center">
                  {r.trend === 'up'
                    ? <TrendingUp className="size-4 text-red-400" />
                    : <TrendingDown className="size-4 text-green-400" />
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
          <h1 className="text-xl font-semibold text-white">Kurs Analitikasi</h1>
          <p className="text-xs text-slate-400 mt-0.5">O'qituvchi ko'rinishi</p>
        </div>
        <Select value={courseId} onValueChange={v => setCourseId(v ?? '')}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Kursni tanlang" /></SelectTrigger>
          <SelectContent>
            {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <button onClick={computeScores} disabled={scoring || !courseId}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 border transition-colors hover:bg-slate-700/50 disabled:opacity-50"
          style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
          <RefreshCw className={`size-3.5 ${scoring ? 'animate-spin' : ''}`} />
          {scoring ? 'Navbatda...' : 'Xavfni hisoblash'}
        </button>
      </div>

      {kpiCards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ label, value }) => (
            <DC key={label}>
              <p className="text-xs text-slate-400 mb-2">{label}</p>
              <p className="text-2xl font-bold text-white">{value}</p>
            </DC>
          ))}
        </div>
      )}

      {pyOffline && (
        <DC>
          <p className="text-sm text-slate-400 text-center">
            Analytics servisi offline —{' '}
            <code className="text-xs text-blue-400 font-mono">.\apps\analytics\start.ps1</code>
          </p>
        </DC>
      )}

      {pyStats && (
        <div className="space-y-4">
          {pyStats.weekly_attendance.length > 0 && (
            <DC>
              <h2 className="text-sm font-semibold text-white mb-4">Haftalik davomat trendi</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={pyStats.weekly_attendance} margin={{ left: -20 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
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
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="size-4 text-red-400" />
                Xavf ostidagi talabalar ({pyStats.at_risk_students.length})
              </h2>
              <div className="space-y-2">
                {pyStats.at_risk_students.map(s => (
                  <div key={s.enrollmentId}
                    className="flex items-center gap-3 py-2 border-b last:border-0"
                    style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <span className="text-sm font-medium text-white flex-1">{s.name}</span>
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
  const { user } = useAuth()
  if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') return <AdminAnalytics />
  if (user?.role === 'TEACHER') return <TeacherAnalytics userId={user.id} />
  return (
    <div className="py-16 text-center text-slate-400 text-sm">
      Analytics sizning rolingiz uchun mavjud emas.
    </div>
  )
}
