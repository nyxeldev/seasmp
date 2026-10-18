'use client'

// Dashboard sahifasining uchta roli (admin/teacher/student) baham ko'radigan
// UI qurilish bloklari: kartalar, KPI ko'rsatkichi, xavf halqasi va
// animatsiya sozlamalari. Hech biri biror rolga xos ma'lumot bilmaydi.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useLocale } from '@/store/locale'

export type Icon = React.ElementType<{ className?: string; style?: React.CSSProperties }>

// ── Animation helpers ─────────────────────────────────────────────────────────
export const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 24 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: 'easeOut' as const, delay },
})

export const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
}

export const staggerItem = {
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

// ── useCounter ────────────────────────────────────────────────────────────────
export function useCounter(target: number, duration = 1600) {
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

// ── Card shell ────────────────────────────────────────────────────────────────
export function DashCard({
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
export function RiskRing({ score }: { score: number }) {
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
export function ChartTooltip({ active, payload, label }: any) {
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
export interface KpiProps {
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

export function KpiCard({ label, target, suffix = '', icon: Icon, trendDir, trendVal, trendColor, pulse }: KpiProps) {
  const count = useCounter(target)
  const { t } = useLocale()

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
              <span className="text-xs" style={{ color: 'var(--s-muted)' }}>{t('dashboard.vsPreviousPeriod')}</span>
            </>
          )}
        </div>
      </DashCard>
    </motion.div>
  )
}
