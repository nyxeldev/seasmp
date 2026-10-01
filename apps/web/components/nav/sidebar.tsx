'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useLocale } from '@/store/locale'
import type { TKey } from '@/store/locale'
import {
  LayoutDashboard, BookOpen, Users, CalendarCheck,
  TrendingUp, ShieldCheck, Settings, LogOut, Shield, ChevronLeft,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// ── Harakat ───────────────────────────────────────────────────────────────────
// Yig'ilgan va yozilgan kengliklar. Ikonka HAR IKKI holatda bir xil gorizontal
// nuqtada turishi uchun ular bilan birga hisoblanadi — ikonka sakramasa,
// ochilish-yopilish sokin ko'rinadi.
const RAIL_W = 64
const FULL_W = 220
const NAV_PAD = 8            // nav elementining px-2 chekkasi
const ICON_W = 18            // lucide size-[18px]
/** Ikonkaning chap chekkadan masofasi — tor holatda markazda turishi uchun */
const ICON_LEFT = (RAIL_W - NAV_PAD * 2 - ICON_W) / 2

/** Sokin, "elastik" emas egri chiziq — sakramaydi, cho'zilmaydi */
const EASE = [0.22, 1, 0.36, 1] as const
const WIDTH_S = 0.26

export const SIDEBAR_WIDTH = { rail: RAIL_W, full: FULL_W }

// ── Context ───────────────────────────────────────────────────────────────────
interface SidebarCtx { collapsed: boolean; toggle: () => void }
const SidebarContext = createContext<SidebarCtx>({ collapsed: false, toggle: () => {} })
export const useSidebar = () => useContext(SidebarContext)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('sidebar-collapsed') === 'true'
    return false
  })
  const toggle = () => setCollapsed(v => {
    const next = !v
    if (typeof window !== 'undefined') localStorage.setItem('sidebar-collapsed', String(next))
    return next
  })
  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>
}

// ── Nav definition ─────────────────────────────────────────────────────────────
const ALL_NAV: {
  href: string
  key: TKey
  icon: React.ElementType
  roles: string[]
}[] = [
  { href: '/dashboard',  key: 'nav.dashboard',  icon: LayoutDashboard, roles: ['ADMIN','TEACHER','STUDENT','SUPER_ADMIN'] },
  { href: '/courses',    key: 'nav.courses',    icon: BookOpen,         roles: ['ADMIN','TEACHER','STUDENT','SUPER_ADMIN'] },
  { href: '/users',      key: 'nav.students',   icon: Users,            roles: ['ADMIN','SUPER_ADMIN'] },
  { href: '/attendance', key: 'nav.attendance', icon: CalendarCheck,    roles: ['ADMIN','TEACHER','STUDENT'] },
  { href: '/analytics',  key: 'nav.analytics',  icon: TrendingUp,       roles: ['ADMIN','SUPER_ADMIN','TEACHER'] },
  { href: '/security',   key: 'nav.security',   icon: ShieldCheck,      roles: ['ADMIN','SUPER_ADMIN'] },
  { href: '/settings',   key: 'nav.settings',   icon: Settings,         roles: ['ADMIN','TEACHER','STUDENT','SUPER_ADMIN'] },
]

// ── Tooltip ───────────────────────────────────────────────────────────────────
function NavTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' as const }}
            className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap pointer-events-none z-50 border"
            style={{
              background: 'var(--color-card)',
              color: 'var(--color-text1)',
              borderColor: 'var(--color-border)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            {label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent"
              style={{ borderRightColor: 'var(--color-border)' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Theme toggle section ──────────────────────────────────────────────────────
function ThemeSection({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme()
  const { t } = useLocale()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const isDark = theme === 'dark'

  return (
    <div style={{
      padding:         collapsed ? '10px 0' : '10px 16px',
      borderTop:       '1px solid var(--color-border)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  collapsed ? 'center' : 'space-between',
      gap:             '8px',
    }}>
      {!collapsed && (
        <span style={{ fontSize: '12px', color: 'var(--color-text2)', userSelect: 'none' }}>
          {isDark ? `🌙 ${t('theme.dark')}` : `☀️ ${t('theme.light')}`}
        </span>
      )}
      <button
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label="Toggle theme"
        style={{
          width:        '44px',
          height:       '24px',
          borderRadius: '12px',
          border:       'none',
          cursor:       'pointer',
          position:     'relative',
          background:   isDark ? '#3b82f6' : '#e2e8f0',
          transition:   'background 0.3s',
          flexShrink:   0,
        }}
      >
        <span style={{
          position:       'absolute',
          top:            '2px',
          left:           isDark ? '22px' : '2px',
          width:          '20px',
          height:         '20px',
          borderRadius:   '50%',
          background:     'white',
          transition:     'left 0.3s',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontSize:       '11px',
          boxShadow:      '0 1px 3px rgba(0,0,0,0.2)',
        }}>
          {isDark ? '🌙' : '☀️'}
        </span>
      </button>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export function Sidebar() {
  const { user, logout }      = useAuth()
  const pathname              = usePathname()
  const { collapsed, toggle } = useSidebar()
  const { t }                 = useLocale()
  const reduce                = useReducedMotion()

  /**
   * Yorliqlar uchun harakat. Faqat `opacity` va `transform` — bular kompozitor
   * qatlamida bajariladi. Ilgari bu yerda `width: 0 → auto` animatsiya qilinardi:
   * brauzer har kadrda o'nlab element uchun layoutni qayta hisoblashi kerak edi
   * va shundan siltanish chiqardi.
   *
   * Vaqtlash assimetrik: yozilganda yorliq konteyner kengaygach paydo bo'ladi,
   * yig'ilganda esa darhol yo'qoladi — aks holda matn tor zolakka "surilib"
   * kirgandek ko'rinadi.
   */
  const labelMotion = reduce
    ? { initial: false as const, animate: { opacity: collapsed ? 0 : 1 }, transition: { duration: 0 } }
    : {
        initial:    { opacity: 0, x: -8 },
        animate:    { opacity: 1, x: 0 },
        exit:       { opacity: 0, x: -8 },
        transition: { duration: 0.18, ease: EASE, delay: 0.06 },
      }

  const widthTransition = reduce
    ? { duration: 0 }
    : { duration: WIDTH_S, ease: EASE }

  if (!user) return null

  const navItems = ALL_NAV.filter(item => item.roles.includes(user.role))
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
  const avatarUrl = user.avatarUrl

  return (
    <div style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
      <motion.aside
        animate={{ width: collapsed ? RAIL_W : FULL_W }}
        transition={widthTransition}
        className="flex h-screen flex-col border-r overflow-hidden"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(20px) saturate(150%)',
          WebkitBackdropFilter: 'blur(20px) saturate(150%)',
          borderColor: 'var(--glass-border)',
        }}
      >
        {/* Brand + toggle */}
        <div className="flex items-center gap-2 border-b px-3"
          style={{ borderColor: 'var(--color-border)', height: '56px', minHeight: '56px' }}>
          <div className="size-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Shield className="size-[18px] text-white" />
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span key="label" {...labelMotion}
                className="font-semibold text-sm whitespace-nowrap"
                style={{ color: 'var(--color-text1)' }}>
                SEASMP
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 flex flex-col gap-0.5">
          {navItems.map(({ href, key, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            const label = t(key)
            const link = (
              <Link key={href} href={href}
                className="flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-colors relative overflow-hidden"
                style={{
                  // Ikonka ikkala holatda ham bir xil nuqtada turadi: yig'ilganda
                  // zolakning markazida, yozilganda esa o'sha joyda qoladi.
                  // Ilgari `justifyContent` almashardi va ikonka har ochilishda
                  // gorizontal sakrardi — ko'zga eng ko'p tashlanadigan joyi shu edi.
                  paddingLeft:  `${ICON_LEFT}px`,
                  paddingRight: '10px',
                  color:      active ? '#fff' : 'var(--color-text2)',
                  background: active ? '#2563EB' : 'transparent',
                }}
                onMouseEnter={e => { if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--color-text1)'
                }}}
                onMouseLeave={e => { if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--color-text2)'
                }}}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-white/60" />}
                <Icon className="size-[18px] shrink-0" />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span key="text" {...labelMotion}
                      className="whitespace-nowrap">
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            )
            return collapsed
              ? <NavTooltip key={href} label={label}>{link}</NavTooltip>
              : link
          })}
        </nav>

        {/* Theme toggle */}
        <ThemeSection collapsed={collapsed} />

        {/* User footer */}
        <div className="p-3 flex items-center gap-2 min-w-0"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          <Avatar className="size-8 shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={user.firstName} />}
            <AvatarFallback style={{ background: '#3B82F6', fontSize: '11px', color: '#fff' }}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div key="user-info" {...labelMotion}
                className="flex flex-1 items-center gap-1 min-w-0 overflow-hidden">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text1)' }}>
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--color-text3)' }}>{user.role}</p>
                </div>
                <button onClick={logout} title={t('common.logout')}
                  className="p-1.5 rounded-md transition-colors shrink-0"
                  style={{ color: 'var(--color-text3)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = '#f87171'
                    ;(e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.1)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--color-text3)'
                    ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}>
                  <LogOut className="size-[18px]" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>

      {/* Tortish tugmasi — yopiq/ochiq holatini o'qning burilishi ko'rsatadi */}
      <button
        onClick={toggle}
        // aria-label ekran o'quvchilar uchun qoladi, lekin `title` yo'q:
        // sichqoncha ustiga kelganda brauzer ko'rsatadigan izoh keraksiz edi
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        style={{
          position:       'absolute',
          right:          '-14px',
          top:            '72px',
          width:          '28px',
          height:         '28px',
          background:     'var(--color-card)',
          border:         '1px solid var(--color-border)',
          borderRadius:   '50%',
          cursor:         'pointer',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          zIndex:         10,
          color:          'var(--color-text2)',
          fontSize:       '13px',
          fontWeight:     600,
          boxShadow:      '0 2px 8px rgba(0,0,0,0.12)',
          transition:     'background 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.18)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = 'var(--color-card)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'
        }}
      >
        {/* Matn o'qi ('←'/'→') o'rniga ikonka: shriftga bog'liq emas, qolgan
            interfeys bilan bir xil to'plamdan va burilishi holatni ko'rsatadi */}
        <motion.span
          animate={{ rotate: collapsed ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: WIDTH_S, ease: EASE }}
          className="flex"
        >
          <ChevronLeft className="size-4" />
        </motion.span>
      </button>
    </div>
  )
}
