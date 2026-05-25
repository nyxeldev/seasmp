'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { securityApi, type AuditLog } from '@/lib/api'
import { useLocale } from '@/store/locale'
import { Bell, CheckCheck } from 'lucide-react'

// Only these actions deserve a notification bell alert
const NOTIFIABLE_ACTIONS = new Set([
  'HIGH_DROPOUT_RISK',
  'SECURITY_ALERT',
  'GRADE_SUBMITTED',
  'ENROLLMENT_CONFIRMED',
  'TWO_FACTOR_DISABLED',
  'BULK_DELETE',
  'SUSPICIOUS_ACTIVITY',
  'LOGIN_FAILED',
  'DELETE',
  'PASSWORD_CHANGE',
])

// Login/profile/routine ops → audit log only, never the bell
const NOISE_ACTIONS = new Set([
  'LOGIN', 'CREATE', 'UPDATE', 'READ', 'ATTENDANCE', 'ENROLL',
])

interface ActionConfig { icon: string; color: string; label: Record<string, string> }

const ACTION_CONFIG: Record<string, ActionConfig> = {
  HIGH_DROPOUT_RISK:    { icon: '⚠️', color: '#f59e0b', label: { uz: "Yuqori xavf aniqlandi",       ru: "Обнаружен высокий риск",       en: "High risk detected"      }},
  SECURITY_ALERT:       { icon: '🛡️', color: '#ef4444', label: { uz: "Xavfsizlik hodisasi",          ru: "Инцидент безопасности",        en: "Security incident"       }},
  GRADE_SUBMITTED:      { icon: '📝', color: '#3b82f6', label: { uz: "Yangi baho qo'yildi",          ru: "Выставлена оценка",            en: "New grade submitted"     }},
  ENROLLMENT_CONFIRMED: { icon: '✅', color: '#10b981', label: { uz: "Kursga yozilish tasdiqlandi",  ru: "Запись подтверждена",          en: "Enrollment confirmed"    }},
  TWO_FACTOR_DISABLED:  { icon: '🔓', color: '#ef4444', label: { uz: "2FA o'chirildi",               ru: "2FA отключён",                 en: "2FA disabled"            }},
  BULK_DELETE:          { icon: '🗑️', color: '#ef4444', label: { uz: "Ommaviy o'chirish",            ru: "Массовое удаление",            en: "Bulk deletion"           }},
  SUSPICIOUS_ACTIVITY:  { icon: '👁️', color: '#f59e0b', label: { uz: "Shubhali faoliyat",            ru: "Подозрительная активность",    en: "Suspicious activity"     }},
  LOGIN_FAILED:         { icon: '🔒', color: '#ef4444', label: { uz: "Kirishda xatolik",             ru: "Ошибка входа",                 en: "Login failed"            }},
  DELETE:               { icon: '🗑️', color: '#ef4444', label: { uz: "Yozuv o'chirildi",             ru: "Запись удалена",               en: "Record deleted"          }},
  PASSWORD_CHANGE:      { icon: '🔑', color: '#8b5cf6', label: { uz: "Parol o'zgartirildi",          ru: "Пароль изменён",               en: "Password changed"        }},
}

function timeAgo(date: string): string {
  const diff  = Date.now() - new Date(date).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)  return 'hozir'
  if (mins < 60) return `${mins} daqiqa oldin`
  if (hours < 24) return `${hours} soat oldin`
  return `${days} kun oldin`
}

function isNotifiable(log: AuditLog): boolean {
  if (NOISE_ACTIONS.has(log.action)) return false
  return NOTIFIABLE_ACTIONS.has(log.action) || (!NOISE_ACTIONS.has(log.action) && log.action !== 'LOGIN')
}

export function NotificationBell() {
  const { locale } = useLocale()
  const [open, setOpen]       = useState(false)
  const [logs, setLogs]       = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('notif-read') ?? '[]')) } catch { return new Set() }
  })
  const ref    = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await securityApi.auditLogs('limit=50&sortBy=createdAt&sortDir=desc')
      const all: AuditLog[] = Array.isArray(r.data) ? r.data : (r as any).data?.logs ?? []
      setLogs(all.filter(isNotifiable))
    } catch {
      // non-admin users won't have access — fail silently
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread = logs.filter(l => !readIds.has(l.id)).length

  const markAllRead = () => {
    const all = new Set([...readIds, ...logs.map(l => l.id)])
    setReadIds(all)
    localStorage.setItem('notif-read', JSON.stringify([...all]))
  }

  const handleClick = (log: AuditLog) => {
    const newRead = new Set([...readIds, log.id])
    setReadIds(newRead)
    localStorage.setItem('notif-read', JSON.stringify([...newRead]))
    setOpen(false)
    router.push('/security')
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg transition-colors outline-none"
        style={{ color: 'var(--s-muted)' }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'
          ;(e.currentTarget as HTMLElement).style.background = 'var(--s-hover)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'
          ;(e.currentTarget as HTMLElement).style.background = 'transparent'
        }}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: '#ef4444', border: '2px solid var(--s-header)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' as const }}
            className="absolute right-0 top-full mt-2 w-80 rounded-xl border overflow-hidden z-50 shadow-xl"
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center gap-2">
                <Bell className="size-4" style={{ color: '#3B82F6' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text1)' }}>
                  {locale === 'ru' ? 'Уведомления' : locale === 'en' ? 'Notifications' : 'Bildirishnomalar'}
                </span>
                {unread > 0 && (
                  <span
                    className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
                  >
                    {unread} {locale === 'ru' ? 'новых' : locale === 'en' ? 'new' : 'yangi'}
                  </span>
                )}
              </div>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <CheckCheck className="size-3.5" />
                  {locale === 'ru' ? 'Прочитать все' : locale === 'en' ? 'Mark all read' : "Barchasini o'qi"}
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="py-8 flex justify-center">
                  <div className="size-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <div className="py-10 text-center">
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                  <p className="text-sm" style={{ color: 'var(--color-text3)' }}>
                    {locale === 'ru'
                      ? 'Всё в порядке. Нет уведомлений.'
                      : locale === 'en'
                      ? 'All good. No notifications.'
                      : "Hamma narsa yaxshi. Bildirishnoma yo'q."}
                  </p>
                </div>
              ) : (
                logs.map(log => {
                  const config = ACTION_CONFIG[log.action]
                  const isRead = readIds.has(log.id)
                  const label = config?.label?.[locale] ?? log.action
                  const icon  = config?.icon ?? '🔔'
                  const color = config?.color ?? '#6b7280'
                  return (
                    <button
                      key={log.id}
                      onClick={() => handleClick(log)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left border-b last:border-0"
                      style={{
                        borderColor: 'var(--color-border)',
                        background: isRead ? 'transparent' : 'rgba(59,130,246,0.04)',
                      }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--s-hover)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = isRead ? 'transparent' : 'rgba(59,130,246,0.04)')}
                    >
                      <div
                        className="size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-base"
                        style={{ background: `${color}18` }}
                      >
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm leading-snug"
                          style={{ color: 'var(--color-text1)', fontWeight: isRead ? 400 : 500 }}
                        >
                          {label}
                        </p>
                        {log.user && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text3)' }}>
                            {log.user.firstName} {log.user.lastName}
                          </p>
                        )}
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text3)' }}>
                          {timeAgo(log.createdAt)}
                        </p>
                      </div>
                      {!isRead && (
                        <span className="size-2 rounded-full bg-red-500 shrink-0 mt-1.5" />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t text-center" style={{ borderColor: 'var(--color-border)' }}>
              <button
                onClick={() => { setOpen(false); router.push('/security') }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                {locale === 'ru' ? 'Все события →' : locale === 'en' ? 'View all activity →' : "Barcha faollikni ko'rish →"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
