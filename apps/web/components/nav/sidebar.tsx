'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, BookOpen, Users, CalendarCheck,
  TrendingUp, ShieldCheck, Settings, LogOut, Shield,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

// ── Context ───────────────────────────────────────────────────────────────────
interface SidebarCtx { collapsed: boolean; toggle: () => void }
const SidebarContext = createContext<SidebarCtx>({ collapsed: false, toggle: () => {} })
export const useSidebar = () => useContext(SidebarContext)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true'
    }
    return false
  })

  const toggle = () =>
    setCollapsed(v => {
      const next = !v
      if (typeof window !== 'undefined') localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

// ── Nav items ──────────────────────────────────────────────────────────────────
const ALL_NAV = [
  { href: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard, roles: ['ADMIN','TEACHER','STUDENT','SUPER_ADMIN'] },
  { href: '/courses',    label: 'Kurslar',      icon: BookOpen,        roles: ['ADMIN','TEACHER','STUDENT','SUPER_ADMIN'] },
  { href: '/users',      label: "O'quvchilar",  icon: Users,           roles: ['ADMIN','SUPER_ADMIN'] },
  { href: '/attendance', label: 'Davomat',      icon: CalendarCheck,   roles: ['ADMIN','TEACHER','STUDENT'] },
  { href: '/analytics',  label: 'Analytics',    icon: TrendingUp,      roles: ['ADMIN','TEACHER'] },
  { href: '/security',   label: 'Xavfsizlik',   icon: ShieldCheck,     roles: ['ADMIN','SUPER_ADMIN'] },
  { href: '/settings',   label: 'Sozlamalar',   icon: Settings,        roles: ['ADMIN','TEACHER','STUDENT','SUPER_ADMIN'] },
] as const

// ── Sidebar ───────────────────────────────────────────────────────────────────
export function Sidebar() {
  const { user, logout } = useAuth()
  const pathname         = usePathname()
  const { collapsed, toggle } = useSidebar()

  if (!user) return null

  const navItems = ALL_NAV.filter(item => (item.roles as readonly string[]).includes(user.role))
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r overflow-hidden shrink-0',
        'transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-[220px]',
      )}
      style={{ background: '#1E293B', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      {/* Brand + toggle */}
      <div
        className="flex items-center gap-2 border-b px-3"
        style={{ borderColor: 'rgba(255,255,255,0.06)', height: '56px' }}
      >
        <div className="size-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <Shield className="size-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm text-white">SEASMP</span>
        )}
        <button
          onClick={toggle}
          aria-label="Toggle sidebar"
          className={cn(
            'p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors shrink-0',
            collapsed ? 'mx-auto' : 'ml-auto',
          )}
        >
          {collapsed
            ? <PanelLeftOpen className="size-4" />
            : <PanelLeftClose className="size-4" />
          }
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 flex flex-col gap-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2' : 'px-2.5',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-white',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )
        })}
      </nav>

      <Separator style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* User footer */}
      <div className={cn('p-3 flex items-center gap-2', collapsed && 'justify-center')}>
        <Avatar className="size-8 shrink-0">
          <AvatarFallback style={{ background: '#3B82F6', fontSize: '11px', color: '#fff' }}>
            {initials}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{user.role}</p>
            </div>
            <button
              onClick={logout}
              title="Chiqish"
              className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-700/50 transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
