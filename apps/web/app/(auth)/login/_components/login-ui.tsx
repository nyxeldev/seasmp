'use client'

// Login sahifasining barcha bosqichlari (credentials/2FA) baham ko'radigan
// taqdimot qismlari — biror qadam o'zgaruvchisi yoki biznes mantiqni bilmaydi.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Eye, EyeOff, BarChart3, Shield, Zap } from 'lucide-react'

// ── Floating label input ──────────────────────────────────────────────────────
export function FloatingInput({
  id, label, type = 'text', value, onChange, required, autoFocus,
}: {
  id: string
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  autoFocus?: boolean
}) {
  const [showPwd, setShowPwd] = useState(false)
  const [focused, setFocused] = useState(false)
  const isPassword = type === 'password'
  const floated = focused || value.length > 0

  return (
    <div className="relative">
      <input
        id={id}
        type={isPassword ? (showPwd ? 'text' : 'password') : type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        autoFocus={autoFocus}
        placeholder=" "
        className={[
          'peer w-full rounded-xl px-4 pt-6 pb-2 text-sm placeholder-transparent',
          'border transition-all duration-200 outline-none',
          isPassword ? 'pr-11' : '',
          focused ? 'shadow-[inset_3px_0_0_#3B82F6,0_0_0_3px_rgba(59,130,246,0.10)]' : '',
        ].join(' ')}
        style={{
          background: 'var(--s-input)',
          color: 'var(--s-text)',
          borderColor: focused ? '#3B82F6' : 'var(--s-border)',
        }}
      />
      <label
        htmlFor={id}
        className={[
          'absolute left-4 pointer-events-none transition-all duration-200',
          floated
            ? 'top-2 text-[10px] font-medium text-blue-400'
            : 'top-1/2 -translate-y-1/2 text-sm',
        ].join(' ')}
        style={floated ? {} : { color: 'var(--s-muted)' }}
      >
        {label}
      </label>
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPwd(s => !s)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: 'var(--s-muted)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-text)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)' }}
        >
          {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
    </div>
  )
}

// ── Gradient button (with shimmer) ───────────────────────────────────────────
export function GradientButton({
  type = 'button', disabled, loading, onClick, children,
}: {
  type?: 'button' | 'submit'
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={[
        'seasmp-btn',
        'w-full h-12 rounded-xl font-semibold text-white text-sm tracking-wide',
        'flex items-center justify-center gap-2 transition-all duration-200',
        'hover:shadow-[0_4px_28px_rgba(59,130,246,0.4)] hover:brightness-110',
        'active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
      ].join(' ')}
      style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)' }}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

export const otpInputBase = [
  'w-full h-16 text-center text-[2rem] font-mono tracking-[0.6em] rounded-xl',
  'border placeholder-transparent',
  'focus:outline-none focus:border-blue-500',
  'focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] transition-all',
].join(' ')
export const otpInputStyle = { background: 'var(--s-input)', color: 'var(--s-text)', borderColor: 'var(--s-border)' }

// ── Left panel (persistent across all steps) ─────────────────────────────────
export function LeftPanel() {
  const pills = [
    { icon: <BarChart3 size={13} />, label: 'Analytics' },
    { icon: <Shield size={13} />,    label: 'Security' },
    { icon: <Zap size={13} />,       label: 'Real-time' },
  ]

  return (
    <div
      className="hidden md:relative md:flex md:w-[55%] overflow-hidden flex-col justify-between p-10 lg:p-16 min-h-screen"
      style={{ background: '#0F172A' }}
    >
      {/* Animated grid */}
      <div
        className="absolute inset-0 seasmp-grid-animate"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59,130,246,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.07) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 1 }}>
        {[
          { left: '8%',  top: '18%', size: 4, anim: 'seasmp-p1 7s  ease-in-out infinite 0s' },
          { left: '82%', top: '12%', size: 3, anim: 'seasmp-p2 9s  ease-in-out infinite 1s' },
          { left: '60%', top: '55%', size: 5, anim: 'seasmp-p3 8s  ease-in-out infinite 2s' },
          { left: '25%', top: '72%', size: 3, anim: 'seasmp-p4 10s ease-in-out infinite 0.5s' },
          { left: '72%', top: '38%', size: 4, anim: 'seasmp-p5 6s  ease-in-out infinite 3s' },
          { left: '45%', top: '88%', size: 2, anim: 'seasmp-p1 11s ease-in-out infinite 1.5s' },
          { left: '15%', top: '45%', size: 3, anim: 'seasmp-p2 8s  ease-in-out infinite 2.5s' },
          { left: '90%', top: '70%', size: 2, anim: 'seasmp-p3 9s  ease-in-out infinite 0.8s' },
        ].map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: 'rgba(59,130,246,0.55)',
              boxShadow: '0 0 6px rgba(59,130,246,0.4)',
              animation: p.anim,
            }}
          />
        ))}
      </div>

      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 25% 35%, rgba(59,130,246,0.14) 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 70% 80%, rgba(99,102,241,0.07) 0%, transparent 70%)
          `,
          zIndex: 2,
        }}
      />

      {/* Logo */}
      <motion.div
        className="relative z-10"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-blue-400" strokeWidth={2.5} />
          <span className="text-blue-400 text-base font-bold tracking-widest uppercase">
            SEASMP
          </span>
        </div>
      </motion.div>

      {/* Main brand block */}
      <motion.div
        className="relative z-10 flex-1 flex flex-col justify-center"
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.75, delay: 0.15 }}
      >
        <h1
          className="text-[clamp(3.5rem,8vw,6rem)] font-bold tracking-tight text-white select-none leading-none mb-4"
          style={{
            textShadow: '0 0 40px rgba(59,130,246,0.4)',
            letterSpacing: '-0.03em',
          }}
        >
          SEASMP
        </h1>

        <p className="text-white/45 text-sm lg:text-base font-light max-w-xs leading-relaxed">
          Smart Education Analytics &<br className="hidden lg:block" />
          Security Monitoring Platform
        </p>
      </motion.div>

      {/* Feature pills */}
      <motion.div
        className="relative z-10 flex flex-wrap gap-2"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.9 }}
      >
        {pills.map(p => (
          <div
            key={p.label}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-white/60"
            style={{
              background: 'rgba(59,130,246,0.10)',
              border: '1px solid rgba(59,130,246,0.18)',
            }}
          >
            <span className="text-blue-400">{p.icon}</span>
            {p.label}
          </div>
        ))}
      </motion.div>
    </div>
  )
}
