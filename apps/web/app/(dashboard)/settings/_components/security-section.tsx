'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { useLocale } from '@/store/locale'
import { securityApi, usersApi, type Session, type AuditLog } from '@/lib/api'
import { toast } from 'sonner'
import { Lock, Shield, Monitor, Smartphone, Trash2, RefreshCw } from 'lucide-react'
import { Card, Field, PasswordStrength, Toggle, SubmitBtn } from './settings-ui'
import { TwoFaModal } from './two-fa-modal'

const pwSchema = z.object({
  current:  z.string().min(1, 'Joriy parol kiritilmadi'),
  next:     z.string().min(8, 'Kamida 8 ta belgi'),
  confirm:  z.string(),
}).refine(d => d.next === d.confirm, { message: 'Parollar mos kelmadi', path: ['confirm'] })
type PwForm = z.infer<typeof pwSchema>

/** Joriy foydalanuvchining so'nggi kirish urinishlari — sahifa ochilganda yuklanadi. */
function useLoginHistory(userEmail?: string) {
  const [loginHistory, setLoginHistory] = useState<AuditLog[]>([])
  const [histLoading, setHistLoading] = useState(false)

  useEffect(() => {
    setHistLoading(true)
    securityApi.auditLogs('action=LOGIN&limit=10&sortBy=createdAt&sortDir=desc')
      .then(r => {
        const all: AuditLog[] = Array.isArray(r.data) ? r.data : (r as any).data?.logs ?? []
        setLoginHistory(userEmail ? all.filter(l => l.user?.email === userEmail) : all)
      })
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }, [userEmail])

  return { loginHistory, histLoading }
}

const getDeviceIcon = (ua?: string) => {
  if (!ua) return <Monitor className="size-[18px]" />
  return /mobile|android|iphone/i.test(ua)
    ? <Smartphone className="size-[18px]" />
    : <Monitor className="size-[18px]" />
}

export function SecuritySection() {
  const { t } = useLocale()
  const { user } = useAuth()
  const [saved, setSaved]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [twoFa, setTwoFa]     = useState(false)
  const [alerts, setAlerts]   = useState(true)
  const [show2faModal, setShow2faModal] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessLoading, setSessLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const { loginHistory, histLoading } = useLoginHistory(user?.email)

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
            <Shield className="size-[18px] text-blue-400 shrink-0 mt-0.5" />
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
              <RefreshCw className={`size-4 ${sessLoading ? 'animate-spin' : ''}`} />
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
                      ? <RefreshCw className="size-4 animate-spin" />
                      : <Trash2 className="size-4" />}
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Login History */}
        <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--s-border)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--s-text)' }}>
            🕐 {t('settings.loginHistory')}
          </p>
          {histLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--s-alt)' }} />
              ))}
            </div>
          ) : loginHistory.length === 0 ? (
            <p className="text-xs py-2" style={{ color: 'var(--s-muted)' }}>{t('settings.noLoginHistory')}</p>
          ) : (
            <div className="space-y-1">
              {loginHistory.map(entry => (
                <div key={entry.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: 'var(--s-alt)', border: '1px solid var(--s-border)' }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Monitor className="size-4 shrink-0" style={{ color: 'var(--s-muted)' }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--s-text)' }}>
                        {entry.ipAddress ?? 'IP noma\'lum'}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--s-muted)' }}>
                        {entry.userAgent?.split(' ')[0] ?? 'Brauzer'}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-[11px] shrink-0 ml-3"
                    style={{ color: (entry.statusCode ?? 200) >= 400 ? '#ef4444' : 'var(--s-muted)' }}
                  >
                    {new Date(entry.createdAt).toLocaleString('uz-UZ')}
                  </span>
                </div>
              ))}
            </div>
          )}
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
