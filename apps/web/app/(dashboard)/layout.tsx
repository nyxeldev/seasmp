'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Sidebar, SidebarProvider } from '@/components/nav/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ChevronRight, User, LogOut } from 'lucide-react'
import { LanguageSwitcher } from '@/components/lang-switcher'
import { NotificationBell } from '@/components/notification-bell'
import { GlobalSearch } from '@/components/global-search'
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts'
import { useLocale } from '@/store/locale'
import type { TKey } from '@/store/locale'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const SEGMENT_KEYS: Record<string, TKey> = {
  dashboard:   'nav.dashboard',
  courses:     'nav.courses',
  users:       'nav.students',
  attendance:  'nav.attendance',
  analytics:   'nav.analytics',
  security:    'nav.security',
  settings:    'nav.settings',
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb() {
  const pathname = usePathname()
  const { t } = useLocale()
  const segments = pathname.split('/').filter(Boolean)
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm">
      {segments.map((seg, i) => {
        const key = SEGMENT_KEYS[seg]
        const label = key ? t(key) : seg
        const isLast = i === segments.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5" style={{ color: 'var(--s-muted)' }} />}
            <span style={{ color: isLast ? 'var(--s-text)' : 'var(--s-muted)', fontWeight: isLast ? 500 : 400 }}>
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
  const { t } = useLocale()
  if (!user) return null

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
  const avatarUrl = user.avatarUrl

  return (
    <header
      className="h-14 flex items-center justify-between px-6 shrink-0 border-b"
      style={{ background: 'var(--s-header)', borderColor: 'var(--s-border)' }}
    >
      <Breadcrumb />

      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <NotificationBell />

        {/* Avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--s-hover)] transition-colors outline-none cursor-pointer ml-1">
            <Avatar className="size-7">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={user.firstName} />}
              <AvatarFallback style={{ background: '#3B82F6', fontSize: '11px', color: '#fff' }}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm hidden sm:block select-none" style={{ color: 'var(--s-muted)' }}>
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
              <User /> {t('settings.profile')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={logout}>
              <LogOut /> {t('common.logout')}
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--s-bg)' }}>
        <div className="size-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) return null

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--s-bg)' }}>
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopHeader />
          <main className="flex-1 overflow-y-auto p-6">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <GlobalSearch />
      <KeyboardShortcuts />
    </SidebarProvider>
  )
}
