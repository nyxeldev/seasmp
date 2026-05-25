'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { securityApi, type AuditLog } from '@/lib/api'
import { Bell, CheckCheck, LogIn, Shield, Users, BookOpen, CalendarCheck, Settings } from 'lucide-react'

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)  return 'hozir'
  if (mins < 60) return `${mins} daqiqa oldin`
  if (hours < 24) return `${hours} soat oldin`
  return `${days} kun oldin`
}

const ACTION_META: Record<string, { icon: React.ElementType<{className?: string}>, color: string, bg: string }> = {
  LOGIN:           { icon: LogIn,        color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  CREATE:          { icon: Users,        color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  UPDATE:          { icon: Settings,     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  DELETE:          { icon: Shield,       color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  PASSWORD_CHANGE: { icon: Shield,       color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  ENROLL:          { icon: BookOpen,     color: '#06B6D4', bg: 'rgba(6,182,212,0.12)'  },
  ATTENDANCE:      { icon: CalendarCheck, color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
}

const RESOURCE_ROUTE: Record<string, string> = {
  users:       '/users',
  courses:     '/courses',
  enrollments: '/courses',
  attendance:  '/attendance',
  security:    '/security',
}

function actionLabel(log: AuditLog): string {
  const a = log.action; const r = log.resource
  if (a === 'LOGIN')           return "Tizimga kirdi"
  if (a === 'CREATE' && r === 'users')    return "Yangi foydalanuvchi qo'shildi"
  if (a === 'CREATE' && r === 'courses')  return "Yangi kurs yaratildi"
  if (a === 'CREATE' && r === 'attendance') return "Davomat belgilandi"
  if (a === 'UPDATE')          return `${r} yangilandi`
  if (a === 'DELETE')          return `${r} o'chirildi`
  if (a === 'PASSWORD_CHANGE') return "Parol o'zgartirildi"
  return `${a} — ${r}`
}

export function NotificationBell() {
  const [open, setOpen]           = useState(false)
  const [logs, setLogs]           = useState<AuditLog[]>([])
  const [loading, setLoading]     = useState(false)
  const [readIds, setReadIds]     = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('notif-read') ?? '[]')) } catch { return new Set() }
  })
  const ref    = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await securityApi.auditLogs('limit=10&sortBy=createdAt&sortDir=desc')
      setLogs(r.data)
    } catch { /* ignore — user might not be admin */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
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
    const route = RESOURCE_ROUTE[log.resource] ?? '/dashboard'
    setOpen(false)
    router.push(route)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg transition-colors outline-none"
        style={{ color: 'var(--s-muted)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'; (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: '#3B82F6', border: '2px solid var(--s-header)' }}>
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
            style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--s-border)' }}>
              <div className="flex items-center gap-2">
                <Bell className="size-4" style={{ color: '#3B82F6' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>
                  Bildirishnomalar
                </span>
                {unread > 0 && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full text-blue-400"
                    style={{ background: 'rgba(59,130,246,0.12)' }}>
                    {unread} yangi
                  </span>
                )}
              </div>
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  <CheckCheck className="size-3.5" />
                  Barchasini o'qi
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
                  <Bell className="size-8 mx-auto mb-2" style={{ color: 'var(--s-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--s-muted)' }}>Bildirishnomalar yo'q</p>
                </div>
              ) : (
                logs.map(log => {
                  const meta = ACTION_META[log.action] ?? ACTION_META.UPDATE
                  const Icon = meta.icon
                  const isRead = readIds.has(log.id)
                  return (
                    <button key={log.id} onClick={() => handleClick(log)}
                      className="w-full flex items-start gap-3 px-4 py-3 transition-colors text-left border-b last:border-0"
                      style={{
                        borderColor: 'var(--s-border)',
                        background: isRead ? 'transparent' : 'var(--s-alt)',
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isRead ? 'transparent' : 'var(--s-alt)'}
                    >
                      <div className="size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: meta.bg }}>
                        <Icon className="size-4" style={{ color: meta.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--s-text)' }}>
                          {actionLabel(log)}
                        </p>
                        {log.user && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--s-muted)' }}>
                            {log.user.firstName} {log.user.lastName}
                          </p>
                        )}
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--s-muted)' }}>
                          {timeAgo(log.createdAt)}
                        </p>
                      </div>
                      {!isRead && (
                        <span className="size-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t text-center" style={{ borderColor: 'var(--s-border)' }}>
              <button onClick={() => { setOpen(false); router.push('/security') }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                Barcha faollikni ko'rish →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
