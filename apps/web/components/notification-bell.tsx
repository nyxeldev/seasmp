'use client'

/**
 * Bildirishnomalar qo'ng'irog'i.
 *
 * Ikki manbadan oziqlanadi:
 *   1. Hal qilinmagan xavfsizlik ogohlantirishlari — aniqlash qatlamlari chiqargan
 *      hodisalar, eng muhimi
 *   2. Audit jurnalidagi DIQQATGA SAZOVOR harakatlar — kirish xatolari, rol
 *      o'zgarishi, 2FA o'chirilishi va shunga o'xshash kam uchraydigan voqealar
 *
 * Nega qayta yozildi: eski `isNotifiable` da oq ro'yxat amalda ishlamasdi —
 * ikkinchi shart har doim rost edi, chunki shovqin ro'yxati yuqorida allaqachon
 * qaytarib yuborilgan. Natijada har bir sahifa ko'rishi ("ACCESS") bildirishnoma
 * bo'lib chiqardi; aniqlash qatlami ishga tushgach bazada 445 ta shunday yozuv
 * yig'ildi. Ustiga harakat nomlari haqiqiy `AuditAction` enumiga mos emas edi
 * (GRADE_SUBMITTED / TWO_FACTOR_DISABLED kabi mavjud bo'lmagan qiymatlar), shu
 * sababli haqiqiy hodisalar xom enum satri ko'rinishida chiqardi.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { securityApi, type AuditLog, type SecurityAlert } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useLocale, type Locale } from '@/store/locale'
import { Bell, CheckCheck, ShieldAlert } from 'lucide-react'

type L10n = Record<Locale, string>
const say = (l: Locale, s: L10n) => s[l] ?? s.uz

// ── Qaysi audit harakatlari bildirishnomaga loyiq ────────────────────────────
// Qat'iy OQ ro'yxat: bu yerda yo'q harakat qo'ng'iroqqa tushmaydi. Kundalik
// oqim (ACCESS, LOGIN, CREATE, UPDATE …) audit jurnalida qoladi — u yerda ular
// kerak, lekin qo'ng'iroqda emas.
const AUDIT_CONFIG: Record<string, { color: string; label: L10n }> = {
  LOGIN_FAILED:     { color: '#ef4444', label: { uz: "Kirishda xatolik",       ru: 'Ошибка входа',          en: 'Failed sign-in'     } },
  ACCESS_DENIED:    { color: '#f59e0b', label: { uz: "Ruxsatsiz urinish",      ru: 'Отказано в доступе',    en: 'Access denied'      } },
  ROLE_CHANGE:      { color: '#8b5cf6', label: { uz: "Rol o'zgartirildi",      ru: 'Роль изменена',         en: 'Role changed'       } },
  PASSWORD_CHANGE:  { color: '#8b5cf6', label: { uz: "Parol o'zgartirildi",    ru: 'Пароль изменён',        en: 'Password changed'   } },
  TWO_FA_DISABLE:   { color: '#ef4444', label: { uz: "2FA o'chirildi",         ru: '2FA отключён',          en: '2FA disabled'       } },
  BACKUP_CODE_USED: { color: '#f59e0b', label: { uz: "Zaxira kod ishlatildi",  ru: 'Использован код',       en: 'Backup code used'   } },
  IP_BLOCKED:       { color: '#ef4444', label: { uz: "IP bloklandi",           ru: 'IP заблокирован',       en: 'IP blocked'         } },
  DELETE:           { color: '#ef4444', label: { uz: "Yozuv o'chirildi",       ru: 'Запись удалена',        en: 'Record deleted'     } },
}

const ALERT_LABEL: Record<string, L10n> = {
  UNAUTHORIZED_OBJECT_ACCESS: { uz: "Ruxsatsiz obyektga murojaat", ru: 'Доступ к чужому объекту', en: 'Unauthorized object access' },
  BEHAVIOR_ANOMALY:           { uz: "Xatti-harakat anomaliyasi",   ru: 'Аномалия поведения',      en: 'Behaviour anomaly'          },
  MASS_DATA_ACCESS:           { uz: "Ommaviy ma'lumot chiqarish",  ru: 'Массовая выгрузка',       en: 'Mass data access'           },
  PRIVILEGE_ESCALATION:       { uz: "Huquqlarni oshirish",         ru: 'Повышение привилегий',    en: 'Privilege escalation'       },
  BRUTE_FORCE:                { uz: "Parol tanlash urinishi",      ru: 'Подбор пароля',           en: 'Brute force'                },
  MULTI_DEVICE:               { uz: "Bir vaqtda ko'p qurilma",     ru: 'Много устройств',         en: 'Multiple devices'           },
  UNUSUAL_HOUR:               { uz: "G'ayrioddiy vaqtda kirish",   ru: 'Вход в необычное время',  en: 'Unusual hour sign-in'       },
  BULK_DELETE:                { uz: "Ommaviy o'chirish",           ru: 'Массовое удаление',       en: 'Bulk deletion'              },
  RATE_LIMIT:                 { uz: "So'rovlar chegarasi",         ru: 'Превышен лимит',          en: 'Rate limit'                 },
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#64748b',
}

/** Ro'yxatga tushadigan yagona ko'rinish — manbasi qanday bo'lishidan qat'i nazar */
interface Item {
  id:       string
  kind:     'alert' | 'audit'
  title:    string
  subtitle: string | null
  color:    string
  at:       string
  href:     string
}

const LOCALE_TAG: Record<Locale, string> = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' }

/**
 * Nisbiy vaqt. Ilgari bu funksiya tilga qaramay o'zbekcha satr qaytarardi
 * ("5 daqiqa oldin"), ya'ni ruscha va inglizcha interfeysda ham shunday chiqardi.
 */
function timeAgo(date: string, locale: Locale): string {
  const rtf   = new Intl.RelativeTimeFormat(LOCALE_TAG[locale], { numeric: 'auto' })
  const secs  = Math.round((new Date(date).getTime() - Date.now()) / 1000)
  const abs   = Math.abs(secs)
  if (abs < 60)    return rtf.format(Math.round(secs), 'second')
  if (abs < 3600)  return rtf.format(Math.round(secs / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour')
  return rtf.format(Math.round(secs / 86400), 'day')
}

const READ_KEY = 'notif-read'
const POLL_MS  = 60_000
/** localStorage cheksiz o'smasin — faqat shuncha oxirgi id saqlanadi */
const READ_CAP = 300

export function NotificationBell() {
  const { locale } = useLocale()
  const { user } = useAuth()
  const router = useRouter()

  // Qo'ng'iroq audit jurnali va ogohlantirishlarga tayanadi, ular esa faqat
  // adminlarga ochiq. Boshqa rollarda so'rov har daqiqada 401 qaytarardi va
  // qo'ng'iroq baribir bo'sh turardi — shuning uchun umuman ko'rsatilmaydi.
  const canSee = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const [open, setOpen]       = useState(false)
  const [alerts, setAlerts]   = useState<SecurityAlert[]>([])
  const [logs, setLogs]       = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]')) } catch { return new Set() }
  })
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!canSee) return
    setLoading(true)
    try {
      const [alertRes, logRes] = await Promise.all([
        securityApi.alerts('resolved=false&limit=20').catch(() => ({ data: [] as SecurityAlert[] })),
        securityApi.auditLogs('limit=50').catch(() => ({ data: [] as AuditLog[] })),
      ])
      setAlerts(Array.isArray(alertRes.data) ? alertRes.data : [])
      setLogs((Array.isArray(logRes.data) ? logRes.data : []).filter(l => l.action in AUDIT_CONFIG))
    } finally {
      setLoading(false)
    }
  }, [canSee])

  useEffect(() => {
    if (!canSee) return
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load, canSee])

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey   = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Ogohlantirishlar birinchi — ular audit yozuvidan muhimroq
  const items: Item[] = useMemo(() => {
    const fromAlerts: Item[] = alerts.map(a => ({
      id:    `alert:${a.id}`,
      kind:  'alert',
      title: say(locale, ALERT_LABEL[a.type] ?? { uz: a.type, ru: a.type, en: a.type }),
      subtitle: a.user ? `${a.user.firstName} ${a.user.lastName}` : (a.ipAddress ?? null),
      color: SEVERITY_COLOR[a.severity] ?? '#64748b',
      at:    a.createdAt,
      href:  '/security',
    }))

    const fromLogs: Item[] = logs.map(l => ({
      id:    `audit:${l.id}`,
      kind:  'audit',
      title: say(locale, AUDIT_CONFIG[l.action].label),
      subtitle: l.user ? `${l.user.firstName} ${l.user.lastName}` : (l.ipAddress ?? null),
      color: AUDIT_CONFIG[l.action].color,
      at:    l.createdAt,
      href:  '/security/audit',
    }))

    return [...fromAlerts, ...fromLogs]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 30)
  }, [alerts, logs, locale])

  const unread = items.filter(i => !readIds.has(i.id)).length

  const persistRead = (next: Set<string>) => {
    // Eng yangi READ_CAP tasini saqlab qolamiz — aks holda ro'yxat cheksiz o'sadi
    const trimmed = new Set([...next].slice(-READ_CAP))
    setReadIds(trimmed)
    try { localStorage.setItem(READ_KEY, JSON.stringify([...trimmed])) } catch { /* private rejim */ }
  }

  const markAllRead = () => persistRead(new Set([...readIds, ...items.map(i => i.id)]))

  const openItem = (item: Item) => {
    persistRead(new Set([...readIds, item.id]))
    setOpen(false)
    router.push(item.href)
  }

  if (!canSee) return null

  const title = say(locale, { uz: 'Bildirishnomalar', ru: 'Уведомления', en: 'Notifications' })

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={unread > 0 ? `${title} (${unread})` : title}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative p-2 rounded-lg outline-none transition-colors hover:bg-[var(--s-hover)] focus-visible:ring-2 focus-visible:ring-blue-500/50"
        style={{ color: open ? 'var(--s-text)' : 'var(--s-muted)' }}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <motion.span
            key={unread}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: '#ef4444', border: '2px solid var(--s-header)' }}
          >
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' as const }}
            className="absolute right-0 top-full mt-2 w-80 rounded-xl border overflow-hidden z-50 shadow-xl"
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <Bell className="size-4" style={{ color: '#3B82F6' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text1)' }}>{title}</span>
                {unread > 0 && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                    {unread} {say(locale, { uz: 'yangi', ru: 'новых', en: 'new' })}
                  </span>
                )}
              </div>
              {unread > 0 && (
                <button onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  <CheckCheck className="size-3.5" />
                  {say(locale, { uz: "Barchasini o'qi", ru: 'Прочитать все', en: 'Mark all read' })}
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="py-8 flex justify-center">
                  <div className="size-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <div className="py-10 text-center px-6">
                  <p className="text-sm" style={{ color: 'var(--color-text3)' }}>
                    {say(locale, {
                      uz: "Diqqat talab qiladigan hodisa yo'q.",
                      ru: 'Событий, требующих внимания, нет.',
                      en: 'Nothing needs your attention.',
                    })}
                  </p>
                </div>
              ) : (
                items.map(item => {
                  const isRead = readIds.has(item.id)
                  return (
                    <button
                      key={item.id}
                      role="menuitem"
                      onClick={() => openItem(item)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left border-b last:border-0 transition-colors hover:bg-[var(--s-hover)]"
                      style={{
                        borderColor: 'var(--color-border)',
                        background: isRead ? 'transparent' : 'rgba(59,130,246,0.04)',
                      }}
                    >
                      <div className="size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: `${item.color}18`, color: item.color }}>
                        {item.kind === 'alert' ? <ShieldAlert className="size-4" /> : <Bell className="size-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug"
                          style={{ color: 'var(--color-text1)', fontWeight: isRead ? 400 : 500 }}>
                          {item.title}
                        </p>
                        {item.subtitle && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text3)' }}>{item.subtitle}</p>
                        )}
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text3)' }}>
                          {timeAgo(item.at, locale)}
                        </p>
                      </div>
                      {!isRead && <span className="size-2 rounded-full bg-red-500 shrink-0 mt-1.5" />}
                    </button>
                  )
                })
              )}
            </div>

            <div className="px-4 py-2.5 border-t text-center" style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={() => { setOpen(false); router.push('/security') }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                {say(locale, { uz: "Barcha hodisalar →", ru: 'Все события →', en: 'View all activity →' })}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
