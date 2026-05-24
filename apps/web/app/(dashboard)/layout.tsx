'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Sidebar, SidebarProvider } from '@/components/nav/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Bell, ChevronRight, User, LogOut } from 'lucide-react'

// ── Breadcrumb ────────────────────────────────────────────────────────────────
const LABELS: Record<string, string> = {
  dashboard:   'Dashboard',
  courses:     'Kurslar',
  users:       "O'quvchilar",
  attendance:  'Davomat',
  analytics:   'Analytics',
  security:    'Xavfsizlik',
  settings:    'Sozlamalar',
  enrollments: "Ro'yxatlar",
  risk:        'Xavf tahlili',
  audit:       'Audit log',
  grades:      'Baholar',
}

function Breadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm">
      {segments.map((seg, i) => {
        const label  = LABELS[seg] ?? seg
        const isLast = i === segments.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-slate-500" />}
            <span className={isLast ? 'text-white font-medium' : 'text-slate-400'}>
              {label}
            </span>
          </span>
        )
      })}
    </nav>
  )
}

// ── Top header ────────────────────────────────────────────────────────────────
function TopHeader() {
  const { user, logout } = useAuth()
  if (!user) return null

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()

  return (
    <header
      className="h-14 flex items-center justify-between px-6 border-b shrink-0"
      style={{ background: '#1E293B', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <Breadcrumb />

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors">
          <Bell className="size-4" />
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-blue-500 ring-2 ring-[#1E293B]" />
        </button>

        {/* Avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-700/50 transition-colors outline-none cursor-pointer">
            <Avatar className="size-7">
              <AvatarFallback style={{ background: '#3B82F6', fontSize: '11px', color: '#fff' }}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-slate-300 hidden sm:block select-none">
              {user.firstName}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <p className="font-medium">{user.firstName} {user.lastName}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{user.email}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User /> Profil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={logout}>
              <LogOut /> Chiqish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router            = useRouter()

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0F172A' }}>
        <div className="size-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) return null

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: '#0F172A' }}>
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopHeader />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
