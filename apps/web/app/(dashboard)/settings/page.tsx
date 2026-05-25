'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { useLocale } from '@/store/locale'
import { securityApi, usersApi, type Session } from '@/lib/api'
import { toast } from 'sonner'
import {
  User, Lock, Bell, Shield, Eye, EyeOff, Check,
  Mail, Monitor, Smartphone, Trash2, RefreshCw, X, Copy,
} from 'lucide-react'
import { AvatarUpload } from '@/components/avatar-upload'

const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
})

// ── Shared card ───────────────────────────────────────────────────────────────
function Card({
  title, description, icon: Icon, children, delay = 0,
}: {
  title: string; description: string; icon: React.ElementType<{ className?: string; style?: React.CSSProperties }>; children: React.ReactNode; delay?: number
}) {
  return (
    <motion.div {...fadeUp(delay)} className="rounded-xl border p-6"
      style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}>
      <div className="flex items-start gap-3 mb-6 pb-5 border-b" style={{ borderColor: 'var(--s-border)' }}>
        <div className="p-2.5 rounded-lg shrink-0" style={{ background: 'rgba(59,130,246,0.1)' }}>
          <Icon className="size-4.5" style={{ color: '#3B82F6' }} />
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
function Field({ label, error, type = 'text', ...props }: {
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
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── Password strength ─────────────────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
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
function Toggle({ label, description, checked, onChange }: {
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
        <span className="absolute top-0.5 left-0.5 size-4.5 rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(0)' }} />
      </button>
    </div>
  )
}

// ── Submit button ─────────────────────────────────────────────────────────────
function SubmitBtn({ loading, saved, label }: { loading?: boolean; saved?: boolean; label?: string }) {
  const { t } = useLocale()
  const btnLabel = label ?? t('settings.save')
  return (
    <button type="submit" disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-60 seasmp-btn"
      style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>
      {loading ? <RefreshCw className="size-4 animate-spin" /> : saved ? <><Check className="size-4" /> {t('settings.saved')}</> : btnLabel}
    </button>
  )
}

// ── 2FA QR Modal ──────────────────────────────────────────────────────────────
function TwoFaModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ qrCodeUrl: string; secret: string; backupCodes?: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  useState(() => {
    securityApi.setup2fa().then(r => {
      setData(r.data)
      setLoading(false)
    }).catch(() => { toast.error('2FA sozlamalarini yuklashda xato'); onClose() })
  })

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setConfirming(true)
    try {
      await securityApi.confirm2fa(code)
      setDone(true)
      toast.success('2FA faollashtirildi!')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setConfirming(false)
    }
  }

  const copySecret = () => {
    if (data?.secret) { navigator.clipboard.writeText(data.secret); toast.success('Nusxalandi') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.25, ease: 'easeOut' as const }}
        className="w-full max-w-sm rounded-2xl border p-6 space-y-5"
        style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: 'var(--s-text)' }}>2FA Sozlash</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--s-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'; (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
            <X className="size-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="size-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : done ? (
          <div className="text-center py-6 space-y-3">
            <div className="size-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
              <Check className="size-7 text-green-400" />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--s-text)' }}>2FA faollashtirildi!</p>
            <p className="text-xs" style={{ color: 'var(--s-muted)' }}>Hisobingiz endi qo'shimcha himoyalangan.</p>
            <button onClick={onClose}
              className="mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: '#2563EB' }}>Yopish</button>
          </div>
        ) : data ? (
          <>
            <p className="text-xs" style={{ color: 'var(--s-muted)' }}>
              Google Authenticator yoki Authy ilovasida QR-kodni skanerlang.
            </p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.qrCodeUrl} alt="2FA QR Code"
                className="size-40 rounded-lg"
                style={{ background: '#fff', padding: '8px' }} />
            </div>
            <div className="rounded-lg px-3 py-2.5 flex items-center gap-2"
              style={{ background: 'var(--s-input)', border: '1px solid var(--s-border)' }}>
              <code className="text-xs flex-1 break-all" style={{ color: 'var(--s-text)' }}>{data.secret}</code>
              <button onClick={copySecret} className="shrink-0 text-text3 hover:text-text1 transition-colors">
                <Copy className="size-3.5" />
              </button>
            </div>
            <form onSubmit={confirm} className="space-y-3">
              <Field label="Tasdiqlash kodi (6 raqam)" value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="000000" maxLength={6} inputMode="numeric" />
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2 rounded-lg text-sm transition-colors"
                  style={{ border: '1px solid var(--s-border)', color: 'var(--s-muted)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'}>Bekor</button>
                <button type="submit" disabled={confirming || code.length !== 6}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: '#2563EB' }}>
                  {confirming ? 'Tekshirilmoqda…' : 'Tasdiqlash'}
                </button>
              </div>
            </form>
            {(data.backupCodes?.length ?? 0) > 0 && (
              <details className="text-xs" style={{ color: 'var(--s-muted)' }}>
                <summary className="cursor-pointer transition-colors"
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'}>
                  Zaxira kodlar ({data.backupCodes!.length})
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {data.backupCodes!.map(c => (
                    <code key={c} className="rounded px-2 py-1" style={{ background: 'var(--s-alt)', color: 'var(--s-text)' }}>{c}</code>
                  ))}
                </div>
              </details>
            )}
          </>
        ) : null}
      </motion.div>
    </div>
  )
}

// ── Profile section ───────────────────────────────────────────────────────────
const profileSchema = z.object({
  firstName: z.string().min(2, 'Kamida 2 ta harf'),
  lastName:  z.string().min(2, 'Kamida 2 ta harf'),
  email:     z.string().email('Noto\'g\'ri email'),
  phone:     z.string().optional(),
})
type ProfileForm = z.infer<typeof profileSchema>

function ProfileSection() {
  const { user, refresh } = useAuth()
  const { t } = useLocale()
  const [saved, setSaved]       = useState(false)
  const [loading, setLoading]   = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user?.avatarUrl)

  const { register, handleSubmit, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName:  user?.lastName ?? '',
      email:     user?.email ?? '',
    },
  })

  const onSubmit = async (data: ProfileForm) => {
    setLoading(true)
    try {
      await usersApi.updateMe(data)
      setSaved(true)
      toast.success("Profil yangilandi")
      setTimeout(() => setSaved(false), 2500)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Xato')
    } finally {
      setLoading(false)
    }
  }

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'U'

  return (
    <motion.div {...fadeUp(0)} className="rounded-2xl border"
      style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}>
      <div className="settings-profile" style={{
        display: 'grid',
        gridTemplateColumns: 'clamp(160px, 20%, 200px) 1fr',
        gap: '32px',
        padding: '32px',
      }}>
        {/* Left: Avatar + name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <AvatarUpload
            currentUrl={avatarUrl}
            initials={initials}
            onUploadComplete={url => { setAvatarUrl(url); refresh() }}
          />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--s-text)' }}>
              {user?.firstName} {user?.lastName}
            </p>
            <span style={{
              display: 'inline-block', marginTop: '4px',
              background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
              fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: 500,
            }}>
              {user?.role}
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--s-muted)', textAlign: 'center' }}>
            {t('settings.avatarHint')}
          </p>
        </div>

        {/* Right: Form fields */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('settings.firstName')} error={errors.firstName?.message}
              {...register('firstName')} placeholder={t('settings.firstName')} />
            <Field label={t('settings.lastName')} error={errors.lastName?.message}
              {...register('lastName')} placeholder={t('settings.lastName')} />
          </div>
          <Field label={t('settings.email')} type="email" error={errors.email?.message}
            {...register('email')} placeholder="email@example.com" />
          <Field label={t('settings.phone')} {...register('phone')} placeholder="+998 90 000 00 00" />
          <div className="flex justify-end pt-1">
            <SubmitBtn loading={loading} saved={saved} />
          </div>
        </form>
      </div>
    </motion.div>
  )
}

// ── Security section ──────────────────────────────────────────────────────────
const pwSchema = z.object({
  current:  z.string().min(1, 'Joriy parol kiritilmadi'),
  next:     z.string().min(8, 'Kamida 8 ta belgi'),
  confirm:  z.string(),
}).refine(d => d.next === d.confirm, { message: 'Parollar mos kelmadi', path: ['confirm'] })
type PwForm = z.infer<typeof pwSchema>

function SecuritySection() {
  const { t } = useLocale()
  const [saved, setSaved]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [twoFa, setTwoFa]     = useState(false)
  const [alerts, setAlerts]   = useState(true)
  const [show2faModal, setShow2faModal] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessLoading, setSessLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<PwForm>({
    resolver: zodResolver(pwSchema),
  })
  const nextPw = watch('next', '')

  const onSubmit = async (data: PwForm) => {
    setLoading(true)
    try {
      await usersApi.changePassword(data.current, data.next)
      setSaved(true)
      toast.success('Parol yangilandi')
      reset()
      setTimeout(() => setSaved(false), 2500)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handle2faToggle = (v: boolean) => {
    if (v) { setShow2faModal(true) }
    else   { setTwoFa(false); toast.info('2FA o\'chirildi') }
  }

  const loadSessions = async () => {
    setSessLoading(true)
    try {
      const r = await securityApi.sessions()
      setSessions(Array.isArray(r.data) ? r.data : [])
    } catch {
      toast.error("Sessiyalarni yuklab bo'lmadi")
    } finally {
      setSessLoading(false)
    }
  }

  const revokeSession = async (id: string) => {
    setRevokingId(id)
    try {
      await securityApi.revokeSession(id)
      setSessions(s => s.filter(x => x.id !== id))
      toast.success('Sessiya tugatildi')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRevokingId(null)
    }
  }

  const getDeviceIcon = (ua?: string) => {
    if (!ua) return <Monitor className="size-4" />
    return /mobile|android|iphone/i.test(ua)
      ? <Smartphone className="size-4" />
      : <Monitor className="size-4" />
  }

  return (
    <>
      <Card title={t('settings.security')} description={t('settings.securityDescription')} icon={Lock} delay={0.1}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Field label={t('settings.currentPassword')} type="password" error={errors.current?.message}
            {...register('current')} placeholder="••••••••" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('settings.newPassword')} type="password" error={errors.next?.message}
              {...register('next')} placeholder="••••••••" />
            <Field label={t('settings.confirmPassword')} type="password" error={errors.confirm?.message}
              {...register('confirm')} placeholder="••••••••" />
          </div>
          {nextPw && <PasswordStrength password={nextPw} />}

          <div className="rounded-lg p-4 space-y-0 mt-2"
            style={{ background: 'var(--s-alt)', border: '1px solid var(--s-border)' }}>
            <Toggle label={t('settings.twoFactor')}
              description={t('settings.twoFactorDesc')}
              checked={twoFa} onChange={handle2faToggle} />
            <Toggle label={t('settings.suspiciousLogin')}
              description={t('settings.suspLoginDesc')}
              checked={alerts} onChange={setAlerts} />
          </div>

          <div className="flex items-start gap-3 rounded-lg p-3"
            style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
            <Shield className="size-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--s-muted)' }}>
              So'nggi kirish: <span className="font-medium" style={{ color: 'var(--s-text)' }}>Bugun, 10:32</span> — Toshkent, O'zbekiston
            </p>
          </div>

          <div className="flex justify-end pt-1">
            <SubmitBtn loading={loading} saved={saved} />
          </div>
        </form>

        {/* Sessions */}
        <div className="mt-6 pt-5 border-t space-y-3" style={{ borderColor: 'var(--s-border)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>{t('settings.activeSessions')}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>{t('settings.allDevices')}</p>
            </div>
            <button onClick={loadSessions} disabled={sessLoading}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50">
              <RefreshCw className={`size-3.5 ${sessLoading ? 'animate-spin' : ''}`} />
              {t('attendance.refresh')}
            </button>
          </div>

          {sessions.length === 0 && !sessLoading && (
            <p className="text-xs py-2" style={{ color: 'var(--s-muted)' }}>{t('settings.loadSessions')}</p>
          )}

          {sessLoading && (
            <div className="space-y-2">
              {[0,1,2].map(i => (
                <div key={i} className="h-12 rounded-lg animate-pulse"
                  style={{ background: 'var(--s-alt)' }} />
              ))}
            </div>
          )}

          <AnimatePresence>
            {sessions.map(sess => (
              <motion.div key={sess.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2, ease: 'easeOut' as const }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ background: 'var(--s-alt)', border: '1px solid var(--s-border)' }}>
                <span className="shrink-0" style={{ color: 'var(--s-muted)' }}>{getDeviceIcon(sess.userAgent)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--s-text)' }}>
                    {sess.userAgent
                      ? sess.userAgent.split(' ')[0]?.replace(/\//g, ' ') ?? 'Brauzer'
                      : 'Noma\'lum qurilma'}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--s-muted)' }}>
                    {sess.ipAddress ?? 'IP noma\'lum'} · {new Date(sess.createdAt).toLocaleDateString('uz-UZ')}
                  </p>
                </div>
                {sess.isRevoked ? (
                  <span className="text-[11px]" style={{ color: 'var(--s-muted)' }}>Yakunlangan</span>
                ) : (
                  <button onClick={() => revokeSession(sess.id)} disabled={revokingId === sess.id}
                    className="p-1.5 rounded-md hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                    style={{ color: 'var(--s-muted)' }}>
                    {revokingId === sess.id
                      ? <RefreshCw className="size-3.5 animate-spin" />
                      : <Trash2 className="size-3.5" />}
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Card>

      <AnimatePresence>
        {show2faModal && (
          <TwoFaModal onClose={() => { setShow2faModal(false); setTwoFa(true) }} />
        )}
      </AnimatePresence>
    </>
  )
}

// ── Notifications section ─────────────────────────────────────────────────────
function NotificationsSection() {
  const { t } = useLocale()
  const [prefs, setPrefs] = useState({
    attendance: true, grades: true, risk: true,
    system: false, weeklyReport: true, email: true,
  })
  const [saved, setSaved] = useState(false)
  const set = (k: keyof typeof prefs) => (v: boolean) => setPrefs(p => ({ ...p, [k]: v }))

  return (
    <Card title={t('settings.notifications')} description={t('settings.notifDescription')} icon={Bell} delay={0.2}>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--s-border)' }}>
        <div className="px-4 py-2.5" style={{ background: 'var(--s-alt)' }}>
          <div className="flex items-center gap-2">
            <Bell className="size-3.5" style={{ color: 'var(--s-muted)' }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--s-muted)' }}>Tizim ichida</span>
          </div>
        </div>
        <div className="px-4">
          <Toggle label="Davomat ogohlantirishlari" description="O'quvchi dars qoldirganda" checked={prefs.attendance} onChange={set('attendance')} />
          <Toggle label="Baho yangilanishlari" description="Yangi baho kiritilganda" checked={prefs.grades} onChange={set('grades')} />
          <Toggle label="Xavf ogohlantirishlari" description="O'quvchi xavf darajasi oshganda" checked={prefs.risk} onChange={set('risk')} />
          <Toggle label="Tizim xabarlari" description="Texnik xizmat va yangilanishlar" checked={prefs.system} onChange={set('system')} />
        </div>
        <div className="px-4 py-2.5 mt-1" style={{ background: 'var(--s-alt)' }}>
          <div className="flex items-center gap-2">
            <Mail className="size-3.5" style={{ color: 'var(--s-muted)' }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--s-muted)' }}>Email</span>
          </div>
        </div>
        <div className="px-4">
          <Toggle label="Email bildirishnomalar" description="Muhim voqealar haqida emailga xabar" checked={prefs.email} onChange={set('email')} />
          <Toggle label="Haftalik hisobot" description="Har dushanba kuni umumiy hisobot" checked={prefs.weeklyReport} onChange={set('weeklyReport')} />
        </div>
      </div>
      <div className="flex justify-end pt-4">
        <button onClick={() => { setSaved(true); toast.success(t('settings.saved')); setTimeout(() => setSaved(false), 2500) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all seasmp-btn"
          style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>
          {saved ? <><Check className="size-4" /> {t('settings.saved')}</> : t('settings.save')}
        </button>
      </div>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { t } = useLocale()
  return (
    <div style={{ maxWidth: '960px', paddingBottom: '40px' }}>
      <style>{`
        .settings-profile { grid-template-columns: clamp(160px, 20%, 200px) 1fr !important; }
        @media (max-width: 768px) {
          .settings-profile { grid-template-columns: 1fr !important; }
          .settings-profile > div:first-child { align-items: flex-start !important; }
          .settings-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <motion.div {...fadeUp()} style={{ marginBottom: '24px' }}>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--s-text)' }}>{t('settings.title')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--s-muted)' }}>{t('settings.description')}</p>
      </motion.div>

      {/* Profile — full width */}
      <div style={{ marginBottom: '24px' }}>
        <ProfileSection />
      </div>

      {/* Security + Notifications — 2 column */}
      <div className="settings-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '24px',
      }}>
        <SecuritySection />
        <NotificationsSection />
      </div>
    </div>
  )
}
