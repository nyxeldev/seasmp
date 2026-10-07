'use client'

// Analitika sahifasining admin/teacher ko'rinishlari baham ko'radigan
// taqdimot qismlari va kichik hisoblash yordamchilari.

// ── Animation ──────────────────────────────────────────────────────────────────
export const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
})

// ── Card shell ────────────────────────────────────────────────────────────────
export function DC({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border p-5 ${className}`}
      style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}>
      {children}
    </div>
  )
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DarkTooltip({ active, payload, label, unit = '' }: any) {
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
export const TYPE_LABEL: Record<string, string> = {
  QUIZ: 'Nazorat', HOMEWORK: 'Uy ishi', MIDTERM: 'Oraliq', FINAL: 'Yakuniy',
}

// ── Risk bar color ────────────────────────────────────────────────────────────
export function riskColor(score: number) {
  return score >= 80 ? '#EF4444' : score >= 60 ? '#F97316' : score >= 40 ? '#F59E0B' : '#22C55E'
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function RiskBar({ score }: { score: number }) {
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
