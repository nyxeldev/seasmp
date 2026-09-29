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
import {
  securityApi, notificationsApi,
  type AuditLog, type AppNotification,
} from '@/lib/api'
import { useRealtimeEvent } from '@/lib/realtime'
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

/** Shaxsiy bildirishnoma turlarining rangi */
const PERSONAL_COLOR: Record<string, string> = {
  ATTENDANCE_MARKED: '#3b82f6',
  GRADE_POSTED:      '#22c55e',
  ENROLLED:          '#8b5cf6',
  DROPOUT_RISK:      '#f59e0b',
  SECURITY_ALERT:    '#ef4444',
}

/** Ro'yxatga tushadigan yagona ko'rinish — manbasi qanday bo'lishidan qat'i nazar */
interface Item {
  id:       string
  kind:     'audit' | 'personal'
  title:    string
  subtitle: string | null
  color:    string
  at:       string
  href:     string
  /** Bir xil hodisa necha marta takrorlangani; 1 bo'lsa ko'rsatilmaydi */
  count:    number
  /** Guruhga kirgan barcha yozuvlar — "o'qildi" belgisi hammasiga qo'yiladi */
  ids:      string[]
  /**
   * Shaxsiy bildirishnomalar uchun o'qilgan holati SERVERDA saqlanadi
   * (`notifications.read_at`). Ogohlantirish va audit yozuvlarida bunday
   * ustun yo'q, shuning uchun ular localStorage ga tayanadi — o'sha
   * vaqtinchalik yechim faqat shu ikki manba uchun qoladi.
   */
  read?:    boolean
  /** Server tomonidagi id — o'qilgan deb belgilash uchun */
  notificationId?: string
  /** Qalqon belgisi: xavfsizlikka oid xabarlar ajralib tursin */
  security?: boolean
}

/**
 * Bir xil turdagi va bir xil odamga tegishli ketma-ket hodisalarni bittaga
 * yig'adi. Aniqlash qatlami sovish oynasi bilan ishlaydi, shuning uchun uzoq
 * davom etgan hodisa soatlar davomida o'nlab bir xil yozuv qoldiradi va ular
 * ro'yxatni bosib ketadi — foydali narsa ko'rinmay qoladi.
 */
function groupRepeats(items: Item[]): Item[] {
  const out: Item[] = []
  for (const item of items) {
    const prev = out[out.length - 1]
    if (prev && prev.title === item.title && prev.subtitle === item.subtitle) {
      prev.count += 1
      prev.ids.push(...item.ids)
      continue
    }
    out.push({ ...item, ids: [...item.ids] })
  }
  return out
}

const LOCALE_TAG: Record<Locale, string> = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' }

/**
 * Nisbiy vaqt. Ilgari bu funksiya tilga qaramay o'zbekcha satr qaytarardi
 * ("5 daqiqa oldin"), ya'ni ruscha va inglizcha interfeysda ham shunday chiqardi.
 *
 * Diqqat: `Intl.RelativeTimeFormat` 'uz-UZ' ni qo'llab-quvvatlanganlar ro'yxatida
 * ko'rsatadi, lekin unda tarjima ma'lumoti yo'q va natija "-22 h" ko'rinishida
 * chiqadi. Shuning uchun o'zbekcha qo'lda yoziladi, ru/en esa Intl'ga qoldiriladi.
 */
function timeAgo(date: string, locale: Locale): string {
  const past = Math.round((Date.now() - new Date(date).getTime()) / 1000)
  const abs  = Math.abs(past)

  if (locale === 'uz') {
    if (abs < 60) return 'hozir'
    if (abs < 3600)  return `${Math.round(abs / 60)} daqiqa oldin`
    if (abs < 86400) return `${Math.round(abs / 3600)} soat oldin`
    return `${Math.round(abs / 86400)} kun oldin`
  }

  const rtf  = new Intl.RelativeTimeFormat(LOCALE_TAG[locale], { numeric: 'auto' })
  const secs = -past
  if (abs < 60)    return rtf.format(secs, 'second')
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

  // Shaxsiy bildirishnomalar HAMMA uchun. Ogohlantirish va audit jurnali
  // esa imtiyozli manbalar bo'lib qoladi — ular rolga tegishli, shaxsga emas.
  //
  // Ilgari butun qo'ng'iroq shu ikki manbadan yasalgani uchun talaba va
  // o'qituvchi uni umuman ko'rmasdi.
  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const [open, setOpen]       = useState(false)
  const [personal, setPersonal] = useState<AppNotification[]>([])
  const [logs, setLogs]       = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]')) } catch { return new Set() }
  })
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const notifRes = await notificationsApi.list('limit=30')
        .catch(() => ({ data: [] as AppNotification[] }))
      setPersonal(Array.isArray(notifRes.data) ? notifRes.data : [])

      if (!isPrivileged) return
      // Xavfsizlik ogohlantirishlari ENDI bildirishnoma sifatida keladi
      // (notifyAdmins), shuning uchun bu yerdan alohida o'qilmaydi — aks
      // holda admin ularni ikki marta ko'rardi. Audit jurnali esa boshqa
      // narsa: unda o'qilgan holati yo'q va u rolga tegishli.
      const logRes = await securityApi.auditLogs('limit=50')
        .catch(() => ({ data: [] as AuditLog[] }))
      setLogs((Array.isArray(logRes.data) ? logRes.data : []).filter(l => l.action in AUDIT_CONFIG))
    } finally {
      setLoading(false)
    }
  }, [user, isPrivileged])

  useEffect(() => {
    if (!user) return
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load, user])

  // Jonli xabar — so'rovni kutmasdan. Davriy yuklash baribir qoladi:
  // soket uzilib qolsa qo'ng'iroq jimjit eskirib qolmasligi kerak.
  useRealtimeEvent('notification:new', () => { load() })

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
    const fromLogs: Item[] = logs.map(l => ({
      id:    `audit:${l.id}`,
      ids:   [`audit:${l.id}`],
      count: 1,
      kind:  'audit',
      title: say(locale, AUDIT_CONFIG[l.action].label),
      subtitle: l.user ? `${l.user.firstName} ${l.user.lastName}` : (l.ipAddress ?? null),
      color: AUDIT_CONFIG[l.action].color,
      at:    l.createdAt,
      href:  '/security/audit',
    }))

    const fromPersonal: Item[] = personal.map(n => ({
      id:    `notif:${n.id}`,
      ids:   [`notif:${n.id}`],
      count: 1,
      kind:  'personal',
      title: n.title,
      subtitle: n.body,
      color: PERSONAL_COLOR[n.type] ?? '#3b82f6',
      at:    n.createdAt,
      href:  n.link ?? '/dashboard',
      read:  n.readAt !== null,
      notificationId: n.id,
      security: n.type === 'SECURITY_ALERT',
    }))

    const sorted = [...fromPersonal, ...fromLogs]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

    return groupRepeats(sorted).slice(0, 30)
  }, [logs, personal, locale])

  // Shaxsiy bildirishnomada holat SERVERDAN keladi; ogohlantirish va audit
  // yozuvlarida bunday ustun yo'q, ular localStorage ga tayanadi.
  // Guruhdagi BARCHA yozuvlar o'qilgan bo'lsagina guruh o'qilgan hisoblanadi.
  const isRead = (item: Item) =>
    item.read ?? item.ids.every(id => readIds.has(id))
  const unread = items.filter(i => !isRead(i)).length

  const persistRead = (next: Set<string>) => {
    // Eng yangi READ_CAP tasini saqlab qolamiz — aks holda ro'yxat cheksiz o'sadi
    const trimmed = new Set([...next].slice(-READ_CAP))
    setReadIds(trimmed)
    try { localStorage.setItem(READ_KEY, JSON.stringify([...trimmed])) } catch { /* private rejim */ }
  }

  const markAllRead = async () => {
    persistRead(new Set([...readIds, ...items.flatMap(i => i.ids)]))
    // Shaxsiylar serverda belgilanadi. Xato bo'lsa jim o'tamiz: keyingi
    // yuklashda haqiqiy holat qaytadi va noto'g'ri ko'rinish tuzaladi.
    setPersonal(prev => prev.map(n => n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
    try { await notificationsApi.markAllRead() } catch { load() }
  }

  const openItem = (item: Item) => {
    persistRead(new Set([...readIds, ...item.ids]))
    if (item.notificationId) {
      const id = item.notificationId
      setPersonal(prev => prev.map(n =>
        n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n))
      notificationsApi.markRead(id).catch(() => load())
    }
    setOpen(false)
    router.push(item.href)
  }

  // Kirilmagan bo'lsa qo'ng'iroq umuman ko'rsatilmaydi
  if (!user) return null

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
        {/* Qo'ng'iroq boshqa ikonkalardan kattaroq: hisoblagich nishoni uning
            ustiga tushadi va kichik o'lchamda ikonkaning o'zi deyarli
            ko'rinmay qolardi. Nishon ham chetga surildi. */}
        <Bell className="size-5" />
        {unread > 0 && (
          <motion.span
            key={unread}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white leading-none"
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
                <Bell className="size-[18px]" style={{ color: '#3B82F6' }} />
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
                  <CheckCheck className="size-4" />
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
                  const read = isRead(item)
                  return (
                    <button
                      key={item.id}
                      role="menuitem"
                      onClick={() => openItem(item)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left border-b last:border-0 transition-colors hover:bg-[var(--s-hover)]"
                      style={{
                        borderColor: 'var(--color-border)',
                        background: read ? 'transparent' : 'rgba(59,130,246,0.04)',
                      }}
                    >
                      <div className="size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: `${item.color}18`, color: item.color }}>
                        {item.security ? <ShieldAlert className="size-[18px]" /> : <Bell className="size-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug flex items-center gap-1.5"
                          style={{ color: 'var(--color-text1)', fontWeight: read ? 400 : 500 }}>
                          <span className="truncate">{item.title}</span>
                          {item.count > 1 && (
                            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-px rounded-full"
                              style={{ background: `${item.color}22`, color: item.color }}>
                              ×{item.count}
                            </span>
                          )}
                        </p>
                        {item.subtitle && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text3)' }}>{item.subtitle}</p>
                        )}
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text3)' }}>
                          {timeAgo(item.at, locale)}
                        </p>
                      </div>
                      {!read && <span className="size-2 rounded-full bg-red-500 shrink-0 mt-1.5" />}
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
