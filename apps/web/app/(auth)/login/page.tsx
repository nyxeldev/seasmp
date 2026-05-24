'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { authApi, ApiError, type User } from '@/lib/api'
import { toast } from 'sonner'
import {
  ShieldCheck, Key, Copy, ArrowLeft, Loader2,
  BarChart3, Shield, Zap, Eye, EyeOff, Sun, Moon,
} from 'lucide-react'
import { useTheme } from 'next-themes'

type Step =
  | 'credentials'
  | 'totp'
  | 'backup'
  | 'setup_loading'
  | 'setup_qr'
  | 'setup_verify'
  | 'setup_codes'

// ── Animated counter ──────────────────────────────────────────────────────────
function useCounter(target: number, duration = 2200) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let raf: number
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setCount(Math.round(eased * target))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return count
}

// ── Floating label input ──────────────────────────────────────────────────────
function FloatingInput({
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
          'peer w-full rounded-xl px-4 pt-6 pb-2 text-sm text-white placeholder-transparent',
          'bg-white/5 border transition-all duration-200 outline-none',
          isPassword ? 'pr-11' : '',
          focused
            ? 'border-blue-500 bg-white/[0.08] shadow-[inset_3px_0_0_#3B82F6,0_0_0_3px_rgba(59,130,246,0.10)]'
            : 'border-[#334155] hover:border-[#475569]',
        ].join(' ')}
      />
      <label
        htmlFor={id}
        className={[
          'absolute left-4 pointer-events-none transition-all duration-200',
          floated
            ? 'top-2 text-[10px] font-medium text-blue-400'
            : 'top-1/2 -translate-y-1/2 text-sm text-white/40',
        ].join(' ')}
      >
        {label}
      </label>
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPwd(s => !s)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
        >
          {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
    </div>
  )
}

// ── Gradient button (with shimmer) ───────────────────────────────────────────
function GradientButton({
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

// ── Left panel (persistent across all steps) ─────────────────────────────────
function LeftPanel() {
  const students   = useCounter(247)
  const attendance = useCounter(94)
  const courses    = useCounter(12)

  const stats = [
    { value: students,   suffix: '',  label: 'Students' },
    { value: attendance, suffix: '%', label: 'Attendance' },
    { value: courses,    suffix: '',  label: 'Active Courses' },
  ]

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

        {/* Stat counters */}
        <div className="flex items-center gap-6 lg:gap-8 mt-10">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-6 lg:gap-8">
              {i > 0 && (
                <div
                  className="self-stretch w-px"
                  style={{ background: 'rgba(255,255,255,0.08)', minHeight: '3rem' }}
                />
              )}
              <motion.div
                className="flex flex-col"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 + i * 0.12, duration: 0.45 }}
              >
                <span
                  className="font-bold text-white tabular-nums leading-none"
                  style={{ fontSize: '3rem' }}
                >
                  {s.value}{s.suffix}
                </span>
                <span className="text-white/35 text-[11px] mt-1.5 font-medium">{s.label}</span>
              </motion.div>
            </div>
          ))}
        </div>
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { login, completeLogin } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const [step, setStep]       = useState<Step>('credentials')
  const [loading, setLoading] = useState(false)

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  const [twoFactorToken, setTwoFactorToken] = useState('')
  const [otpCode, setOtpCode]               = useState('')

  const [backupInput, setBackupInput] = useState('')

  const [setupToken, setSetupToken]     = useState('')
  const [qrCodeUrl, setQrCodeUrl]       = useState('')
  const [secret, setSecret]             = useState('')
  const [setupCode, setSetupCode]       = useState('')
  const [backupCodes, setBackupCodes]   = useState<string[]>([])
  const [pendingToken, setPendingToken] = useState('')
  const [pendingUser, setPendingUser]   = useState<User | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (step !== 'setup_loading') return
    let cancelled = false
    authApi.setup2faStart(setupToken)
      .then(res => {
        if (cancelled) return
        setQrCodeUrl(res.data.qrCodeUrl)
        setSecret(res.data.secret)
        setStep('setup_qr')
      })
      .catch(err => {
        if (cancelled) return
        toast.error(err instanceof ApiError ? err.message : 'Xatolik yuz berdi')
        setStep('credentials')
      })
    return () => { cancelled = true }
  }, [step, setupToken])

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.step === 'requires_2fa') {
        setTwoFactorToken(result.twoFactorToken)
        setStep('totp')
      } else if (result.step === 'requires_setup') {
        setSetupToken(result.setupToken)
        setStep('setup_loading')
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.verify2fa(twoFactorToken, otpCode)
      completeLogin(res.data.accessToken, res.data.user)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Noto'g'ri kod")
      setOtpCode('')
    } finally {
      setLoading(false)
    }
  }

  const handleBackup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.backupCode(twoFactorToken, backupInput)
      completeLogin(res.data.accessToken, res.data.user)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Noto'g'ri backup kod")
    } finally {
      setLoading(false)
    }
  }

  const handleSetupVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.setup2faFinish(setupToken, setupCode)
      setBackupCodes(res.data.backupCodes)
      setPendingToken(res.data.accessToken)
      setPendingUser(res.data.user)
      setStep('setup_codes')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Noto'g'ri kod")
      setSetupCode('')
    } finally {
      setLoading(false)
    }
  }

  const otpInputBase = [
    'w-full h-16 text-center text-[2rem] font-mono tracking-[0.6em] rounded-xl',
    'bg-white/5 border border-white/10 text-white placeholder-white/20',
    'focus:outline-none focus:border-blue-500 focus:bg-white/[0.08]',
    'focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] transition-all',
  ].join(' ')

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Left branding panel ─────────────────────────────────────────── */}
      <LeftPanel />

      {/* ── Right form panel ────────────────────────────────────────────── */}
      <div
        className="relative w-full md:w-[45%] flex flex-col min-h-screen"
        style={{ background: '#1E293B' }}
      >
        {/* Theme toggle */}
        <div className="absolute top-5 right-5 z-20">
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="w-9 h-9 rounded-lg flex items-center justify-center
              text-white/35 hover:text-white/70 hover:bg-white/8 transition-all"
          >
            {mounted && resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        {/* Centered form */}
        <div className="flex-1 flex items-center justify-center px-8 sm:px-12 py-16">
          <div className="w-full max-w-[360px]">
            <AnimatePresence mode="wait">

              {/* ── credentials ───────────────────────────────────────── */}
              {step === 'credentials' && (
                <motion.div
                  key="credentials"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.32 }}
                >
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-white mb-1.5">Xush kelibsiz</h2>
                    <p className="text-white/38 text-sm">Davom etish uchun tizimga kiring</p>
                  </div>

                  <form onSubmit={handleCredentials} className="flex flex-col gap-3.5">
                    <FloatingInput
                      id="email" label="Email manzil" type="email"
                      value={email} onChange={setEmail} required
                    />
                    <FloatingInput
                      id="password" label="Parol" type="password"
                      value={password} onChange={setPassword} required
                    />

                    <div className="flex justify-end mt-0.5">
                      <button
                        type="button"
                        className="text-[11px] text-white/35 hover:text-blue-400 transition-colors"
                      >
                        Parolni unutdingizmi?
                      </button>
                    </div>

                    <GradientButton type="submit" loading={loading} disabled={loading}>
                      {!loading && 'Kirish'}
                      {loading && 'Kirilmoqda...'}
                    </GradientButton>
                  </form>

                  <div className="mt-9 pt-6 border-t border-white/[0.06]">
                    <p className="text-[11px] text-white/18 text-center font-mono">
                      admin@seasmp.uz · Admin@1234
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── totp ──────────────────────────────────────────────── */}
              {step === 'totp' && (
                <motion.div
                  key="totp"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.32 }}
                >
                  <button type="button" onClick={() => setStep('credentials')}
                    className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/65 mb-7 transition-colors">
                    <ArrowLeft size={13} /> Orqaga
                  </button>

                  <div className="mb-8">
                    <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20
                      flex items-center justify-center mb-4">
                      <ShieldCheck size={20} className="text-blue-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1.5">2FA Tasdiqlash</h2>
                    <p className="text-white/38 text-sm">Authenticator ilovangizdan 6 raqamli kodni kiriting</p>
                  </div>

                  <form onSubmit={handleTotp} className="flex flex-col gap-3.5">
                    <input
                      type="text" inputMode="numeric" maxLength={6}
                      value={otpCode} autoFocus placeholder="000000"
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className={otpInputBase}
                    />
                    <GradientButton type="submit" loading={loading}
                      disabled={loading || otpCode.length !== 6}>
                      {!loading && 'Kirish'}
                      {loading && 'Tekshirilmoqda...'}
                    </GradientButton>
                  </form>

                  <button type="button" onClick={() => setStep('backup')}
                    className="mt-5 w-full flex items-center justify-center gap-1.5
                      text-xs text-white/28 hover:text-white/60 transition-colors">
                    <Key size={12} /> Backup kod ishlatish
                  </button>
                </motion.div>
              )}

              {/* ── backup ────────────────────────────────────────────── */}
              {step === 'backup' && (
                <motion.div
                  key="backup"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.32 }}
                >
                  <button type="button" onClick={() => setStep('totp')}
                    className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/65 mb-7 transition-colors">
                    <ArrowLeft size={13} /> Authenticator kodiga qaytish
                  </button>

                  <div className="mb-8">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20
                      flex items-center justify-center mb-4">
                      <Key size={20} className="text-amber-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1.5">Backup kod</h2>
                    <p className="text-white/38 text-sm">Avval saqlangan backup kodingizni kiriting</p>
                  </div>

                  <form onSubmit={handleBackup} className="flex flex-col gap-3.5">
                    <input
                      type="text" value={backupInput} autoFocus placeholder="XXXX-XXXX"
                      onChange={e => setBackupInput(e.target.value.toUpperCase())}
                      className={[
                        'w-full h-14 text-center font-mono tracking-[0.35em] text-lg rounded-xl',
                        'bg-white/5 border border-white/10 text-white placeholder-white/20',
                        'focus:outline-none focus:border-blue-500 focus:bg-white/[0.08]',
                        'focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] transition-all',
                      ].join(' ')}
                    />
                    <GradientButton type="submit" loading={loading} disabled={loading || !backupInput.trim()}>
                      {!loading && 'Kirish'}
                      {loading && 'Tekshirilmoqda...'}
                    </GradientButton>
                  </form>
                </motion.div>
              )}

              {/* ── setup_loading ─────────────────────────────────────── */}
              {step === 'setup_loading' && (
                <motion.div
                  key="setup_loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4 py-20"
                >
                  <Loader2 size={30} className="animate-spin text-blue-400" />
                  <p className="text-white/38 text-sm">2FA sozlanmoqda...</p>
                </motion.div>
              )}

              {/* ── setup_qr ──────────────────────────────────────────── */}
              {step === 'setup_qr' && (
                <motion.div
                  key="setup_qr"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.32 }}
                >
                  <div className="mb-6">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <h2 className="text-xl font-bold text-white">2FA Sozlash</h2>
                      <span className="text-[10px] bg-orange-500/12 text-orange-400
                        border border-orange-500/18 px-2 py-0.5 rounded-full font-medium">
                        Majburiy
                      </span>
                    </div>
                    <p className="text-white/38 text-sm">
                      QR kodni Google Authenticator yoki Authy bilan skanerlang
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-4">
                    {qrCodeUrl && (
                      <div className="p-3 bg-white rounded-2xl shadow-[0_0_32px_rgba(59,130,246,0.2)]">
                        <img src={qrCodeUrl} alt="2FA QR Code" className="w-44 h-44" />
                      </div>
                    )}
                    <div className="w-full">
                      <p className="text-[11px] text-white/28 mb-1.5">Qo'lda kiritish uchun secret:</p>
                      <div className="flex items-center gap-2 bg-white/5 border border-white/8
                        rounded-xl px-3 py-2.5">
                        <code className="text-[11px] font-mono text-white/55 flex-1 break-all select-all">
                          {secret}
                        </code>
                        <button type="button"
                          onClick={() => { navigator.clipboard.writeText(secret); toast.success('Nusxalandi') }}
                          className="text-white/28 hover:text-white/65 transition-colors shrink-0">
                          <Copy size={13} />
                        </button>
                      </div>
                    </div>
                    <GradientButton onClick={() => setStep('setup_verify')}>
                      Scan qildim, kodni kiritaman →
                    </GradientButton>
                  </div>
                </motion.div>
              )}

              {/* ── setup_verify ──────────────────────────────────────── */}
              {step === 'setup_verify' && (
                <motion.div
                  key="setup_verify"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.32 }}
                >
                  <button type="button" onClick={() => setStep('setup_qr')}
                    className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/65 mb-7 transition-colors">
                    <ArrowLeft size={13} /> Orqaga
                  </button>

                  <div className="mb-8">
                    <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20
                      flex items-center justify-center mb-4">
                      <ShieldCheck size={20} className="text-blue-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1.5">Kodni kiriting</h2>
                    <p className="text-white/38 text-sm">
                      Authenticator ilovangiz ko'rsatayotgan 6 raqamli kodni kiriting
                    </p>
                  </div>

                  <form onSubmit={handleSetupVerify} className="flex flex-col gap-3.5">
                    <input
                      type="text" inputMode="numeric" maxLength={6}
                      value={setupCode} autoFocus placeholder="000000"
                      onChange={e => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className={otpInputBase}
                    />
                    <GradientButton type="submit" loading={loading}
                      disabled={loading || setupCode.length !== 6}>
                      {!loading && '2FA ni yoqish'}
                      {loading && 'Tekshirilmoqda...'}
                    </GradientButton>
                  </form>
                </motion.div>
              )}

              {/* ── setup_codes ───────────────────────────────────────── */}
              {step === 'setup_codes' && (
                <motion.div
                  key="setup_codes"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.32 }}
                >
                  <div className="mb-6">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20
                      flex items-center justify-center mb-4">
                      <Key size={20} className="text-amber-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1.5">Backup kodlaringiz</h2>
                    <p className="text-white/38 text-sm">Har biri faqat bir marta ishlatiladi.</p>
                  </div>

                  <div className="bg-amber-500/[0.07] border border-amber-500/14 rounded-xl px-4 py-3 mb-4">
                    <p className="text-xs text-amber-400/75">
                      ⚠ Bu kodlar faqat bir marta ko'rsatiladi. Xavfsiz joyda saqlang.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {backupCodes.map((code, i) => (
                      <div key={i}
                        className="font-mono text-sm bg-white/5 border border-white/[0.07]
                          rounded-lg px-3 py-2 text-center tracking-wider text-white/75 select-all">
                        {code}
                      </div>
                    ))}
                  </div>

                  <button type="button"
                    onClick={() => { navigator.clipboard.writeText(backupCodes.join('\n')); toast.success('Barcha kodlar nusxalandi') }}
                    className="w-full h-10 rounded-xl text-xs font-medium text-white/40 hover:text-white/70
                      border border-white/8 hover:border-white/18 flex items-center justify-center gap-2
                      transition-all mb-3">
                    <Copy size={13} /> Barcha kodlarni nusxalash
                  </button>

                  <GradientButton onClick={() => pendingUser && completeLogin(pendingToken, pendingUser)}>
                    Saqdim, davom etish →
                  </GradientButton>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-5 text-center">
          <p className="text-[11px] text-white/14">© 2026 SEASMP. Barcha huquqlar himoyalangan.</p>
        </div>
      </div>
    </div>
  )
}
