'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, BookOpen, ClipboardList,
  CalendarCheck, BarChart3, ShieldCheck, LogOut, GraduationCap,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const allNavItems = [
  { href: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard, roles: ['ADMIN','TEACHER','STUDENT'] },
  { href: '/users',       label: 'Users',        icon: Users,           roles: ['ADMIN','SUPER_ADMIN'] },
  { href: '/courses',     label: 'Courses',      icon: BookOpen,        roles: ['ADMIN','TEACHER','STUDENT','SUPER_ADMIN'] },
  { href: '/enrollments', label: 'Enrollments',  icon: ClipboardList,   roles: ['ADMIN','TEACHER','STUDENT'] },
  { href: '/attendance',  label: 'Attendance',   icon: CalendarCheck,   roles: ['ADMIN','TEACHER','STUDENT'] },
  { href: '/analytics',   label: 'Analytics',    icon: BarChart3,       roles: ['ADMIN','TEACHER','STUDENT'] },
  { href: '/security',    label: 'Security',     icon: ShieldCheck,     roles: ['ADMIN', 'SUPER_ADMIN'] },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const pathname         = usePathname()

  if (!user) return null

  const navItems = allNavItems.filter(item => item.roles.includes(user.role))
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-card">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-4 border-b">
        <div className="size-7 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-xs font-bold text-primary-foreground">S</span>
        </div>
        <span className="font-semibold text-sm">SEASMP</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <Separator />

      {/* User */}
      <div className="p-3 flex items-center gap-2">
        <Avatar className="size-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{user.firstName} {user.lastName}</p>
          <p className="text-[11px] text-muted-foreground truncate">{user.role}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={logout} title="Logout">
          <LogOut className="size-4" />
        </Button>
      </div>
    </aside>
  )
}
