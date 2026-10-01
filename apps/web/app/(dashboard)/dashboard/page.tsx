'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import Link from 'next/link'
import {
  analyticsApi, securityApi, coursesApi,
  type AnalyticsOverview, type Course, type PyTeacherKpi, type StudentStats,
} from '@/lib/api'
import { useRole } from '@/hooks/useRole'
import { useLocale } from '@/store/locale'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Users, BookOpen, CalendarCheck, AlertTriangle,
  TrendingUp, TrendingDown, LogIn, Star, UserPlus,
  ShieldCheck, FileText, ArrowRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SkeletonKpi, SkeletonRow } from '@/components/ui/skeleton'

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

type ActivityType = 'login' | 'attendance' | 'grade' | 'user' | 'course' | 'security' | 'report'
interface Activity {
  id: number; type: ActivityType; actor: string; msg: string; time: string; icon: Icon
}

/** Audit harakatini tasmadagi ko'rinishga bog'laydi. Ro'yxatda yo'q harakat chiqmaydi. */
const AUDIT_ACTIVITY: Record<string, { type: ActivityType; msg: string; icon: Icon }> = {
  LOGIN:            { type: 'login',      msg: 'Tizimga kirdi',            icon: LogIn },
  LOGIN_FAILED:     { type: 'security',   msg: 'Kirishda xatolik',         icon: AlertTriangle },
  ATTENDANCE_MARK:  { type: 'attendance', msg: 'Davomat belgilandi',       icon: CalendarCheck },
  GRADE_SUBMIT:     { type: 'grade',      msg: "Baho qo'yildi",            icon: Star },
  CREATE:           { type: 'user',       msg: 'Yangi yozuv yaratildi',    icon: UserPlus },
  UPDATE:           { type: 'course',     msg: 'Yozuv yangilandi',         icon: BookOpen },
  DELETE:           { type: 'security',   msg: "Yozuv o'chirildi",         icon: AlertTriangle },
  ENROLL:           { type: 'user',       msg: 'Kursga yozildi',           icon: UserPlus },
  ROLE_CHANGE:      { type: 'security',   msg: "Rol o'zgartirildi",        icon: ShieldCheck },
  PASSWORD_CHANGE:  { type: 'security',   msg: "Parol o'zgartirildi",      icon: ShieldCheck },
  TWO_FA_SETUP:     { type: 'security',   msg: '2FA yoqildi',              icon: ShieldCheck },
  ACCESS_DENIED:    { type: 'security',   msg: 'Ruxsatsiz urinish',        icon: AlertTriangle },
  IP_BLOCKED:       { type: 'security',   msg: 'IP bloklandi',             icon: AlertTriangle },
}

/**
 * Grafik o'qi uchun qisqa sana.
 *
 * `toLocaleDateString('uz-UZ', { month: 'short' })` brauzerda "M09" qaytaradi —
 * uz lokalining oy nomlari to'liq emas. Shuning uchun o'zbekcha qo'lda.
 */
const UZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek']

function shortDate(iso: string, locale: string): string {
  const d = new Date(iso)
  if (locale === 'uz') return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`
  return d.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric' })
}

/** Qisqa nisbiy vaqt — tasma uchun */
function relTime(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60)    return 'hozir'
  if (s < 3600)  return `${Math.round(s / 60)} daqiqa oldin`
  if (s < 86400) return `${Math.round(s / 3600)} soat oldin`
  return `${Math.round(s / 86400)} kun oldin`
}

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
      className={`glass-surface rounded-xl p-5 ${className}`}
      style={style}
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
  // Trend ixtiyoriy: hamma ko'rsatkich uchun oldingi davr bilan taqqoslash
  // mavjud emas (talaba soni tarixi saqlanmaydi). Ma'lumot bo'lmasa nishon
  // umuman chizilmaydi — to'qib chiqarilgan "+12" dan ko'ra shunisi halol.
  trendDir?: 'up' | 'down'
  trendVal?: string
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
            <Icon className="size-[18px]" style={{ color: '#3B82F6' }} />
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
          {trendVal && (
            <>
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ color: trendText, background: trendBg }}
              >
                <TrendIcon className="size-3.5" />
                {trendVal}
              </span>
              <span className="text-xs" style={{ color: 'var(--s-muted)' }}>oldingi davrga nisbatan</span>
            </>
          )}
        </div>
      </DashCard>
    </motion.div>
  )
}

// ── Admin dashboard ───────────────────────────────────────────────────────────
function AdminDashboard() {
  const { t, locale } = useLocale()

  // Bu sahifa ilgari qattiq yozilgan raqamlarni chizardi (247 o'quvchi, 94%
  // davomat, "Aliyev Jasur — 87% xavf"). Bazada bunday ma'lumot yo'q edi, ya'ni
  // ekrandagi hech narsa tizimning haqiqiy holatini aks ettirmasdi.
  const [data, setData]       = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    analyticsApi.overview(30)
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const kpis: KpiProps[] = [
    { label: t('dashboard.totalStudents'), target: data?.students ?? 0,       icon: Users,         trendColor: 'green' },
    { label: t('dashboard.activeCourses'), target: data?.activeCourses ?? 0,  icon: BookOpen,      trendColor: 'green' },
    { label: t('dashboard.avgAttendance'), target: Math.round(data?.attendanceRate ?? 0), suffix: '%', icon: CalendarCheck,
      trendColor: (data?.attendanceDelta ?? 0) >= 0 ? 'green' : 'amber',
      trendDir:   (data?.attendanceDelta ?? 0) >= 0 ? 'up' : 'down',
      trendVal:   data?.attendanceDelta != null ? `${data.attendanceDelta > 0 ? '+' : ''}${data.attendanceDelta}%` : undefined },
    { label: t('dashboard.highRisk'),      target: data?.highRisk ?? 0,       icon: AlertTriangle, trendColor: 'red', pulse: (data?.highRisk ?? 0) > 0 },
  ]

  // Grafik uchun sana yorlig'i — foydalanuvchi tilida
  // useMemo: Recharts massiv identiteti o'zgarsa animatsiyani qayta boshlaydi
  const trend = useMemo(
    () => (data?.attendanceTrend ?? []).slice(-14).map(d => ({
      day: shortDate(d.date, locale),
      pct: d.rate,
    })),
    [data, locale],
  )

  // ── Faollik tasmasi ────────────────────────────────────────────────────────
  // Ilgari bu ro'yxat ham to'qima edi ("Aliyev Jasur tizimga kirdi — 2 daqiqa
  // oldin"). Endi audit jurnalidan o'qiladi; kundalik oqim (ACCESS) chiqarib
  // tashlanadi, aks holda tasma faqat sahifa ko'rishlaridan iborat bo'lardi.
  const [activity, setActivity] = useState<Activity[]>([])

  useEffect(() => {
    let cancelled = false
    securityApi.auditLogs('limit=40')
      .then(r => {
        if (cancelled) return
        const rows = (Array.isArray(r.data) ? r.data : [])
          .filter(l => l.action in AUDIT_ACTIVITY)
          .slice(0, 10)
          .map((l, i) => {
            const cfg = AUDIT_ACTIVITY[l.action]
            return {
              id:    i,
              type:  cfg.type,
              actor: l.user ? `${l.user.firstName} ${l.user.lastName}` : (l.ipAddress ?? 'Tizim'),
              msg:   `${cfg.msg}${l.resource ? ` — ${l.resource}` : ''}`,
              time:  relTime(l.createdAt),
              icon:  cfg.icon,
            } satisfies Activity
          })
        setActivity(rows)
      })
      .catch(() => { if (!cancelled) setActivity([]) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6">
      {/* Sahifaning h1 i. Talaba va o'qituvchi variantlarida bor edi, admin
          variantida esa umuman yo'q edi — ya'ni asosiy sahifa sarlavhasiz
          qolardi. Ekran o'quvchilar sahifani shundan aniqlaydi. */}
      <h1 className="text-xl font-semibold" style={{ color: 'var(--s-text)' }}>
        {t('dashboard.title')}
      </h1>

      {/* KPI cards */}
      <motion.div
        className="kpi-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        variants={stagger}
        initial="initial"
        animate="animate"
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)
          : kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} />)}
      </motion.div>

      {/* Middle row: chart + risk list */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Attendance area chart */}
        <motion.div className="lg:col-span-3" {...fadeUp(0.2)}>
          <DashCard>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>{t('dashboard.attendanceTrend')}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>So'nggi {trend.length} dars kuni</p>
              </div>
              {/* Oldingi davr bilan haqiqiy taqqoslash. Ilgari bu yerda
                  o'zgarmas "↑ 4% o'sdi" turardi. */}
              {data?.attendanceDelta != null && (
                <Badge
                  className="text-xs px-2 py-0.5"
                  style={
                    data.attendanceDelta >= 0
                      ? { background: 'rgba(34,197,94,0.1)',  color: '#22C55E', border: 'none' }
                      : { background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: 'none' }
                  }
                >
                  {data.attendanceDelta >= 0 ? '↑' : '↓'} {Math.abs(data.attendanceDelta)}%
                </Badge>
              )}
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
              <AlertTriangle className="size-[18px]" style={{ color: '#EF4444' }} />
            </div>

            <div className="space-y-3">
              {loading && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
              {(data?.topRisk ?? []).map((s, i) => (
                <motion.div
                  key={s.enrollmentId}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.07, duration: 0.35 }}
                  className="flex items-center gap-3"
                >
                  <RiskRing score={Math.round(s.score * 100)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--s-text)' }}>{s.studentName}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--s-muted)' }}>{s.courseTitle}</p>
                  </div>
                </motion.div>
              ))}
              {!loading && (data?.topRisk.length ?? 0) === 0 && (
                <p className="text-xs py-6 text-center" style={{ color: 'var(--s-muted)' }}>
                  Xavf ostidagi o&apos;quvchi yo&apos;q
                </p>
              )}
            </div>
          </DashCard>
        </motion.div>
      </div>

      {/* Activity feed */}
      <motion.div {...fadeUp(0.4)}>
        <DashCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>{t('dashboard.recentActivity')}</h2>
            <span className="text-xs" style={{ color: 'var(--s-muted)' }}>{activity.length} ta voqea</span>
          </div>

          <div className="space-y-0.5">
            {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
            {activity.length === 0 && !loading && (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--s-muted)' }}>
                Hozircha voqea yo&apos;q
              </p>
            )}
            {activity.map((ev, i) => {
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
                    <Icon className="size-4" style={{ color }} />
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
  const { user } = useAuth()
  const { t }     = useLocale()

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

// ── Student dashboard ─────────────────────────────────────────────────────────
function StudentDashboard() {
  const { user } = useAuth()
  const { t }     = useLocale()

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

  const kpis: KpiProps[] = [
    { label: t('student.coursesEnrolled'), target: courses.length, icon: BookOpen,      trendColor: 'green' },
    { label: t('student.avgAttendance'),   target: avgAttendance,  suffix: '%', icon: CalendarCheck, trendColor: 'green' },
    { label: t('student.avgGrade'),        target: avgGrade,       suffix: '%', icon: Star,          trendColor: 'green' },
    { label: t('student.highRisk'),        target: highRiskCount,  icon: AlertTriangle, trendColor: 'red', pulse: highRiskCount > 0 },
  ]

  const statusColor = (status: string) =>
    status === 'ACTIVE' ? { background: 'rgba(34,197,94,0.1)', color: '#22C55E' }
    : status === 'COMPLETED' ? { background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }
    : { background: 'rgba(239,68,68,0.1)', color: '#EF4444' }

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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { isAdmin, isTeacher } = useRole()
  if (isAdmin)   return <AdminDashboard />
  if (isTeacher) return <TeacherDashboard />
  return <StudentDashboard />
}
