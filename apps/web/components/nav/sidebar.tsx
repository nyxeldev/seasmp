'use client'

import { createContext, useContext, useState, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, BookOpen, Users, CalendarCheck,
  TrendingUp, ShieldCheck, Settings, LogOut, Shield,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

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

// ── Nav items ──────────────────────────────────────────────────────────────────
const ALL_NAV = [
  { href: '/dashboard',  label: 'Dashboard',    icon: LayoutDashboard, roles: ['ADMIN','TEACHER','STUDENT','SUPER_ADMIN'] },
  { href: '/courses',    label: 'Kurslar',       icon: BookOpen,        roles: ['ADMIN','TEACHER','STUDENT','SUPER_ADMIN'] },
  { href: '/users',      label: "O'quvchilar",   icon: Users,           roles: ['ADMIN','SUPER_ADMIN'] },
  { href: '/attendance', label: 'Davomat',       icon: CalendarCheck,   roles: ['ADMIN','TEACHER','STUDENT'] },
  { href: '/analytics',  label: 'Analytics',     icon: TrendingUp,      roles: ['ADMIN','TEACHER'] },
  { href: '/security',   label: 'Xavfsizlik',    icon: ShieldCheck,     roles: ['ADMIN','SUPER_ADMIN'] },
  { href: '/settings',   label: 'Sozlamalar',    icon: Settings,        roles: ['ADMIN','TEACHER','STUDENT','SUPER_ADMIN'] },
] as const

// ── Tooltip ───────────────────────────────────────────────────────────────────
function NavTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' as const }}
            className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1 rounded-md text-xs font-medium text-white whitespace-nowrap pointer-events-none z-50"
            style={{ background: '#334155', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
          >
            {label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent"
              style={{ borderRightColor: '#334155' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export function Sidebar() {
  const { user, logout }      = useAuth()
  const pathname              = usePathname()
  const { collapsed, toggle } = useSidebar()

  if (!user) return null

  const navItems = ALL_NAV.filter(item => (item.roles as readonly string[]).includes(user.role))
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex h-screen flex-col border-r overflow-hidden shrink-0"
      style={{ background: '#1E293B', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      {/* Brand + toggle */}
      <div
        className="flex items-center gap-2 border-b px-3"
        style={{ borderColor: 'rgba(255,255,255,0.06)', height: '56px', minHeight: '56px' }}
      >
        <div className="size-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <Shield className="size-4 text-white" />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              key="label"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' as const }}
              className="font-semibold text-sm text-white overflow-hidden whitespace-nowrap"
            >
              SEASMP
            </motion.span>
          )}
        </AnimatePresence>
        <button
          onClick={toggle}
          aria-label="Toggle sidebar"
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors shrink-0 ml-auto"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 flex flex-col gap-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const link = (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-colors relative overflow-hidden"
              style={{
                paddingLeft: collapsed ? undefined : '10px',
                paddingRight: collapsed ? undefined : '10px',
                justifyContent: collapsed ? 'center' : undefined,
                color: active ? '#fff' : '#94A3B8',
                background: active ? '#2563EB' : 'transparent',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(100,116,139,0.2)'
                if (!active) (e.currentTarget as HTMLElement).style.color = '#fff'
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
                if (!active) (e.currentTarget as HTMLElement).style.color = '#94A3B8'
              }}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-white/60"
                />
              )}
              <Icon className="size-4 shrink-0" />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    key="text"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' as const }}
                    className="truncate overflow-hidden whitespace-nowrap"
                  >
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

      {/* Separator */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

      {/* User footer */}
      <div className="p-3 flex items-center gap-2 min-w-0">
        <Avatar className="size-8 shrink-0">
          <AvatarFallback style={{ background: '#3B82F6', fontSize: '11px', color: '#fff' }}>
            {initials}
          </AvatarFallback>
        </Avatar>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="user-info"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' as const }}
              className="flex flex-1 items-center gap-1 min-w-0 overflow-hidden"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{user.firstName} {user.lastName}</p>
                <p className="text-[11px] text-slate-400 truncate">{user.role}</p>
              </div>
              <button
                onClick={logout}
                title="Chiqish"
                className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-700/50 transition-colors shrink-0"
              >
                <LogOut className="size-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  )
}
