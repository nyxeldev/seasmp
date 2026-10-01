'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  analyticsApi, securityApi,
  type AnalyticsOverview,
} from '@/lib/api'
import { useLocale, type TKey } from '@/store/locale'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Users, BookOpen, CalendarCheck, AlertTriangle,
  LogIn, Star, UserPlus, ShieldCheck,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SkeletonKpi, SkeletonRow } from '@/components/ui/skeleton'
import {
  DashCard, KpiCard, RiskRing, ChartTooltip,
  fadeUp, stagger,
  type KpiProps, type Icon,
} from './dashboard-ui'

type ActivityType = 'login' | 'attendance' | 'grade' | 'user' | 'course' | 'security' | 'report'
interface Activity {
  id: number; type: ActivityType; actor: string; msg: string; time: string; icon: Icon
}

/** Audit harakatini tasmadagi ko'rinishga bog'laydi. Ro'yxatda yo'q harakat chiqmaydi.
 *  Matn joriy tilda `activity.<ACTION>` kaliti orqali olinadi. */
const AUDIT_ACTIVITY: Record<string, { type: ActivityType; icon: Icon }> = {
  LOGIN:            { type: 'login',      icon: LogIn },
  LOGIN_FAILED:     { type: 'security',   icon: AlertTriangle },
  ATTENDANCE_MARK:  { type: 'attendance', icon: CalendarCheck },
  GRADE_SUBMIT:     { type: 'grade',      icon: Star },
  CREATE:           { type: 'user',       icon: UserPlus },
  UPDATE:           { type: 'course',     icon: BookOpen },
  DELETE:           { type: 'security',   icon: AlertTriangle },
  ENROLL:           { type: 'user',       icon: UserPlus },
  ROLE_CHANGE:      { type: 'security',   icon: ShieldCheck },
  PASSWORD_CHANGE:  { type: 'security',   icon: ShieldCheck },
  TWO_FA_SETUP:     { type: 'security',   icon: ShieldCheck },
  ACCESS_DENIED:    { type: 'security',   icon: AlertTriangle },
  IP_BLOCKED:       { type: 'security',   icon: AlertTriangle },
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
function relTime(iso: string, t: (key: TKey) => string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60)    return t('activity.now')
  if (s < 3600)  return `${Math.round(s / 60)} ${t('activity.minutesAgo')}`
  if (s < 86400) return `${Math.round(s / 3600)} ${t('activity.hoursAgo')}`
  return `${Math.round(s / 86400)} ${t('activity.daysAgo')}`
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

/**
 * Admin boshqaruv paneli uchun ma'lumot olish. Ikki mustaqil so'rov (umumiy
 * ko'rsatkichlar + so'nggi faollik) bitta joyda — komponent faqat chizadi.
 */
function useAdminDashboardData() {
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
              actor: l.user ? `${l.user.firstName} ${l.user.lastName}` : (l.ipAddress ?? t('activity.system')),
              msg:   `${t(`activity.${l.action}` as TKey)}${l.resource ? ` — ${l.resource}` : ''}`,
              time:  relTime(l.createdAt, t),
              icon:  cfg.icon,
            } satisfies Activity
          })
        setActivity(rows)
      })
      .catch(() => { if (!cancelled) setActivity([]) })
    return () => { cancelled = true }
  }, [])

  return { data, loading, trend, activity }
}

export function AdminDashboard() {
  const { t } = useLocale()
  const { data, loading, trend, activity } = useAdminDashboardData()

  const kpis: KpiProps[] = [
    { label: t('dashboard.totalStudents'), target: data?.students ?? 0,       icon: Users,         trendColor: 'green' },
    { label: t('dashboard.activeCourses'), target: data?.activeCourses ?? 0,  icon: BookOpen,      trendColor: 'green' },
    { label: t('dashboard.avgAttendance'), target: Math.round(data?.attendanceRate ?? 0), suffix: '%', icon: CalendarCheck,
      trendColor: (data?.attendanceDelta ?? 0) >= 0 ? 'green' : 'amber',
      trendDir:   (data?.attendanceDelta ?? 0) >= 0 ? 'up' : 'down',
      trendVal:   data?.attendanceDelta != null ? `${data.attendanceDelta > 0 ? '+' : ''}${data.attendanceDelta}%` : undefined },
    { label: t('dashboard.highRisk'),      target: data?.highRisk ?? 0,       icon: AlertTriangle, trendColor: 'red', pulse: (data?.highRisk ?? 0) > 0 },
  ]

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
            <span className="text-xs" style={{ color: 'var(--s-muted)' }}>{activity.length} {t('dashboard.eventsCount')}</span>
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
