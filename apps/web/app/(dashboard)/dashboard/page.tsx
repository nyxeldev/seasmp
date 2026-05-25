'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { useRole } from '@/hooks/useRole'
import { useLocale } from '@/store/locale'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Users, BookOpen, CalendarCheck, AlertTriangle,
  TrendingUp, TrendingDown, LogIn, Star, UserPlus,
  ShieldCheck, FileText,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type Icon = React.ElementType<{ className?: string; style?: React.CSSProperties }>

// ── Animation helpers ─────────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 24 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: 'easeOut' as const, delay },
})

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
}

const staggerItem = {
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

// ── useCounter ────────────────────────────────────────────────────────────────
function useCounter(target: number, duration = 1600) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let startTs = 0
    const step = (ts: number) => {
      if (!startTs) startTs = ts
      const p     = Math.min((ts - startTs) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setCount(Math.round(eased * target))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])
  return count
}

// ── Mock data ─────────────────────────────────────────────────────────────────
const ATTENDANCE_DATA = [
  { day: 'May 17', pct: 89 },
  { day: 'May 18', pct: 92 },
  { day: 'May 19', pct: 87 },
  { day: 'May 20', pct: 94 },
  { day: 'May 21', pct: 91 },
  { day: 'May 22', pct: 95 },
  { day: 'May 23', pct: 93 },
]

const RISK_STUDENTS = [
  { name: 'Aliyev Jasur',      course: 'Matematika',  score: 87, absences: 14 },
  { name: 'Karimova Nilufar',  course: 'Fizika',      score: 71, absences: 11 },
  { name: 'Toshmatov Bobur',   course: 'Kimyo',       score: 64, absences: 9  },
  { name: 'Rahimova Zulfiya',  course: 'Biologiya',   score: 52, absences: 7  },
  { name: 'Nazarov Sherzod',   course: 'Tarix',       score: 43, absences: 6  },
]

type ActivityType = 'login' | 'attendance' | 'grade' | 'user' | 'course' | 'security' | 'report'
interface Activity {
  id: number; type: ActivityType; actor: string; msg: string; time: string; icon: Icon
}

const ACTIVITY: Activity[] = [
  { id: 1,  type: 'login',      actor: 'Aliyev Jasur',     msg: 'Tizimga kirdi',                    time: '2 daqiqa oldin',   icon: LogIn       },
  { id: 2,  type: 'attendance', actor: 'Rahimov Sardor',   msg: 'Davomat belgilandi — Matematika',  time: '15 daqiqa oldin',  icon: CalendarCheck },
  { id: 3,  type: 'grade',      actor: 'Admin',            msg: "Karimova baho qo'shildi: 85",      time: '32 daqiqa oldin',  icon: Star        },
  { id: 4,  type: 'user',       actor: 'Admin',            msg: "Yangi o'quvchi ro'yxatga olindi",  time: '1 soat oldin',     icon: UserPlus    },
  { id: 5,  type: 'course',     actor: 'Admin',            msg: 'Fizika kursi faollashtirildi',     time: '2 soat oldin',     icon: BookOpen    },
  { id: 6,  type: 'security',   actor: 'Toshmatov Bobur',  msg: "Noma'lum IP-dan kirish urinishi",  time: '3 soat oldin',     icon: AlertTriangle },
  { id: 7,  type: 'login',      actor: 'Rahimova Zulfiya', msg: 'Tizimga kirdi',                    time: '4 soat oldin',     icon: LogIn       },
  { id: 8,  type: 'grade',      actor: 'Nazarov M.',       msg: 'Matematika bahosi yangilandi: 92', time: '5 soat oldin',     icon: Star        },
  { id: 9,  type: 'report',     actor: 'Admin',            msg: "Oylik hisobot yaratildi",          time: '6 soat oldin',     icon: FileText    },
  { id: 10, type: 'security',   actor: 'System',           msg: '2FA muvaffaqiyatli yoqildi',       time: '8 soat oldin',     icon: ShieldCheck },
]

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  login:      '#3B82F6',
  attendance: '#22C55E',
  grade:      '#F59E0B',
  user:       '#A855F7',
  course:     '#14B8A6',
  security:   '#EF4444',
  report:     '#6B7280',
}

// ── Card shell ────────────────────────────────────────────────────────────────
function DashCard({
  children,
  className = '',
  style = {},
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${className}`}
      style={{
        background:   'var(--s-bg-card)',
        borderColor:  'var(--s-border)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Risk ring (SVG) ───────────────────────────────────────────────────────────
function RiskRing({ score }: { score: number }) {
  const R      = 18
  const cx     = 22; const cy = 22
  const circ   = 2 * Math.PI * R
  const offset = circ - (score / 100) * circ
  const color  = score >= 80 ? '#EF4444'
               : score >= 60 ? '#F97316'
               : score >= 45 ? '#F59E0B'
               :               '#EAB308'

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--s-border)" strokeWidth="3.5" />
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke={color}
        strokeWidth="3.5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="9.5" fontWeight="700">
        {score}%
      </text>
    </svg>
  )
}

// ── Recharts tooltip ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--s-bg)', border: '1px solid var(--s-border)',
      borderRadius: '8px', padding: '8px 12px',
    }}>
      <p style={{ color: 'var(--s-muted)', fontSize: '11px', marginBottom: '2px' }}>{label}</p>
      <p style={{ color: '#3B82F6', fontSize: '15px', fontWeight: 700 }}>{payload[0].value}%</p>
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────
interface KpiProps {
  label: string
  target: number
  suffix?: string
  icon: Icon
  trendDir: 'up' | 'down'
  trendVal: string
  trendColor: 'green' | 'amber' | 'red'
  pulse?: boolean
}

function KpiCard({ label, target, suffix = '', icon: Icon, trendDir, trendVal, trendColor, pulse }: KpiProps) {
  const count = useCounter(target)

  const colorMap = {
    green: { text: '#22C55E', bg: 'rgba(34,197,94,0.1)'  },
    amber: { text: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
    red:   { text: '#EF4444', bg: 'rgba(239,68,68,0.1)'  },
  }
  const { text: trendText, bg: trendBg } = colorMap[trendColor]
  const TrendIcon = trendDir === 'up' ? TrendingUp : TrendingDown

  return (
    <motion.div variants={staggerItem}>
      <DashCard>
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-medium" style={{ color: 'var(--s-muted)' }}>{label}</p>
          <div className="p-2 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)' }}>
            <Icon className="size-4" style={{ color: '#3B82F6' }} />
          </div>
        </div>

        <p className="text-3xl font-bold mb-3 tabular-nums" style={{ color: 'var(--s-text)' }}>
          {count}{suffix}
        </p>

        <div className="flex items-center gap-1.5">
          {pulse && (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full opacity-75 animate-ping" style={{ background: '#EF4444' }} />
              <span className="relative inline-flex size-2 rounded-full" style={{ background: '#EF4444' }} />
            </span>
          )}
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ color: trendText, background: trendBg }}
          >
            <TrendIcon className="size-3" />
            {trendVal}
          </span>
          <span className="text-xs" style={{ color: 'var(--s-muted)' }}>bu oy</span>
        </div>
      </DashCard>
    </motion.div>
  )
}

// ── Admin dashboard ───────────────────────────────────────────────────────────
function AdminDashboard() {
  const { t } = useLocale()
  const kpis: KpiProps[] = [
    { label: t('dashboard.totalStudents'), target: 247, icon: Users,          trendDir: 'up',   trendVal: '+12',  trendColor: 'green' },
    { label: t('dashboard.activeCourses'), target: 18,  icon: BookOpen,       trendDir: 'up',   trendVal: '+3',   trendColor: 'green' },
    { label: t('dashboard.avgAttendance'), target: 94,  suffix: '%', icon: CalendarCheck, trendDir: 'down', trendVal: '-2%',  trendColor: 'amber' },
    { label: t('dashboard.highRisk'),      target: 12,  icon: AlertTriangle,  trendDir: 'up',   trendVal: '+5',   trendColor: 'red', pulse: true },
  ]

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <motion.div
        className="kpi-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        variants={stagger}
        initial="initial"
        animate="animate"
      >
        {kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} />)}
      </motion.div>

      {/* Middle row: chart + risk list */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Attendance area chart */}
        <motion.div className="lg:col-span-3" {...fadeUp(0.2)}>
          <DashCard>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>{t('dashboard.attendanceTrend')}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>So'nggi 7 kun</p>
              </div>
              <Badge
                className="text-xs px-2 py-0.5"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: 'none' }}
              >
                ↑ 4% o'sdi
              </Badge>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={ATTENDANCE_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--s-border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: 'var(--s-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[80, 100]}
                  tick={{ fill: 'var(--s-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `${v}%`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  fill="url(#areaGrad)"
                  dot={{ fill: '#3B82F6', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#3B82F6', stroke: 'var(--s-bg)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </DashCard>
        </motion.div>

        {/* Dropout risk */}
        <motion.div className="lg:col-span-2" {...fadeUp(0.3)}>
          <DashCard className="h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>{t('dashboard.riskStudents')}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>Top 5 · qoldirish ehtimoli</p>
              </div>
              <AlertTriangle className="size-4" style={{ color: '#EF4444' }} />
            </div>

            <div className="space-y-3">
              {RISK_STUDENTS.map((s, i) => (
                <motion.div
                  key={s.name}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.07, duration: 0.35 }}
                  className="flex items-center gap-3"
                >
                  <RiskRing score={s.score} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--s-text)' }}>{s.name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--s-muted)' }}>{s.course} · {s.absences} sinfdan qoldi</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </DashCard>
        </motion.div>
      </div>

      {/* Activity feed */}
      <motion.div {...fadeUp(0.4)}>
        <DashCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>{t('dashboard.recentActivity')}</h2>
            <span className="text-xs" style={{ color: 'var(--s-muted)' }}>10 ta voqea</span>
          </div>

          <div className="space-y-0.5">
            {ACTIVITY.map((ev, i) => {
              const Icon  = ev.icon
              const color = ACTIVITY_COLORS[ev.type]
              return (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.45 + i * 0.04 }}
                  className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors group"
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div
                    className="size-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${color}18` }}
                  >
                    <Icon className="size-3.5" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug" style={{ color: 'var(--s-text)' }}>
                      <span className="font-medium">{ev.actor}</span>
                      {' '}
                      <span style={{ color: 'var(--s-muted)' }}>{ev.msg}</span>
                    </p>
                  </div>
                  <span className="text-xs shrink-0 mt-0.5 tabular-nums" style={{ color: 'var(--s-muted)' }}>{ev.time}</span>
                </motion.div>
              )
            })}
          </div>
        </DashCard>
      </motion.div>
    </div>
  )
}

// ── Teacher dashboard ─────────────────────────────────────────────────────────
function TeacherDashboard() {
  return (
    <motion.div className="space-y-6" {...fadeUp()}>
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--s-text)' }}>Mening kurslarim</h1>
      <p className="text-sm" style={{ color: 'var(--s-muted)' }}>Kurslar bo'limiga o'ting →</p>
    </motion.div>
  )
}

// ── Student dashboard ─────────────────────────────────────────────────────────
function StudentDashboard() {
  return (
    <motion.div className="space-y-6" {...fadeUp()}>
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--s-text)' }}>Mening ro'yxatlarim</h1>
      <p className="text-sm" style={{ color: 'var(--s-muted)' }}>Kurslar bo'limiga o'ting →</p>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { isAdmin, isTeacher } = useRole()
  if (isAdmin)   return <AdminDashboard />
  if (isTeacher) return <TeacherDashboard />
  return <StudentDashboard />
}
