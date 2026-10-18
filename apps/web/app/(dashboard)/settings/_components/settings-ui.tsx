'use client'

// Sozlamalar sahifasining uchta bo'limi (profil/xavfsizlik/bildirishnoma)
// baham ko'radigan shakl qurilish bloklari.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Check, RefreshCw } from 'lucide-react'
import { useLocale } from '@/store/locale'

export const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
})

// ── Shared card ───────────────────────────────────────────────────────────────
export function Card({
  title, description, icon: Icon, children, delay = 0,
}: {
  title: string; description: string; icon: React.ElementType<{ className?: string; style?: React.CSSProperties }>; children: React.ReactNode; delay?: number
}) {
  return (
    <motion.div {...fadeUp(delay)} className="rounded-xl border p-6"
      style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}>
      <div className="flex items-start gap-3 mb-6 pb-5 border-b" style={{ borderColor: 'var(--s-border)' }}>
        <div className="p-2.5 rounded-lg shrink-0" style={{ background: 'rgba(59,130,246,0.1)' }}>
          <Icon className="size-[18px].5" style={{ color: '#3B82F6' }} />
        </div>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>{title}</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>{description}</p>
        </div>
      </div>
      {children}
    </motion.div>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────────
export function Field({ label, error, type = 'text', ...props }: {
  label: string; error?: string; type?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: 'var(--s-muted)' }}>{label}</label>
      <div className="relative">
        <input
          type={isPassword && show ? 'text' : type}
          {...props}
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all disabled:opacity-40 pr-10"
          style={{
            background: 'var(--s-input)',
            border: `1px solid ${error ? '#EF4444' : 'var(--s-border)'}`,
            color: 'var(--s-text)',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = error ? '#EF4444' : '#3B82F6'
            e.currentTarget.style.boxShadow = `inset 3px 0 0 ${error ? '#EF4444' : '#3B82F6'}`
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = error ? '#EF4444' : 'var(--s-border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color: 'var(--s-muted)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'}>
            {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── Password strength ─────────────────────────────────────────────────────────
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length
  const levels = [
    { label: "Juda zaif", color: '#EF4444' },
    { label: "Zaif",      color: '#F59E0B' },
    { label: "O'rtacha",  color: '#EAB308' },
    { label: "Kuchli",    color: '#22C55E' },
  ]
  const lvl = levels[score - 1] ?? levels[0]
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0,1,2,3].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i < score ? lvl.color : 'var(--s-border)' }} />
        ))}
      </div>
      <p className="text-xs" style={{ color: lvl.color }}>{lvl.label}</p>
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────────────
export function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0"
      style={{ borderColor: 'var(--s-border)' }}>
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--s-text)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>{description}</p>
      </div>
      <button onClick={() => onChange(!checked)} aria-pressed={checked}
        className="relative shrink-0 w-10 h-5.5 rounded-full transition-colors"
        style={{ background: checked ? '#3B82F6' : 'var(--s-border)' }}>
        <span className="absolute top-0.5 left-0.5 size-[18px].5 rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(0)' }} />
      </button>
    </div>
  )
}

// ── Submit button ─────────────────────────────────────────────────────────────
export function SubmitBtn({ loading, saved, label }: { loading?: boolean; saved?: boolean; label?: string }) {
  const { t } = useLocale()
  const btnLabel = label ?? t('settings.save')
  return (
    <button type="submit" disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-60 seasmp-btn"
      style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>
      {loading ? <RefreshCw className="size-[18px] animate-spin" /> : saved ? <><Check className="size-[18px]" /> {t('settings.saved')}</> : btnLabel}
    </button>
  )
}
