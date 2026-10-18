'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { resolveMediaUrl } from '@/lib/api'
import { Sidebar, SidebarProvider } from '@/components/nav/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ChevronRight, User, LogOut } from 'lucide-react'
import { LanguageSwitcher } from '@/components/lang-switcher'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { NotificationBell } from '@/components/notification-bell'
import { GlobalSearch } from '@/components/global-search'
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts'
import { useLocale } from '@/store/locale'
import type { TKey } from '@/store/locale'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { BreadcrumbTitleProvider, useBreadcrumbTitleValue } from '@/lib/breadcrumb'

const SEGMENT_KEYS: Record<string, TKey> = {
  dashboard:   'nav.dashboard',
  courses:     'nav.courses',
  users:       'nav.students',
  // /students marshruti ham bor — u yetishmagani uchun breadcrumb'da
  // tarjimasiz "students" ko'rinardi
  students:    'nav.students',
  enrollments: 'nav.enrollments',
  attendance:  'nav.attendance',
  grades:      'nav.grades',
  analytics:   'nav.analytics',
  audit:       'nav.audit',
  risk:        'nav.risk',
  security:    'nav.security',
  settings:    'nav.settings',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb() {
  const pathname = usePathname()
  const { t } = useLocale()
  const entityTitle = useBreadcrumbTitleValue()
  const segments = pathname.split('/').filter(Boolean)
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm">
      {segments.map((seg, i) => {
        const key = SEGMENT_KEYS[seg]
        // Ro'yxatda yo'q segment — bu obyektning identifikatori (slug yoki UUID).
        // Manzil qatorida slug turishi mumkin, lekin breadcrumb'da obyektning
        // to'liq nomi ko'rinishi kerak: "web-dasturlash-asoslari" emas,
        // "Web dasturlash asoslari". Nom hali yuklanmagan bo'lsa slug qoladi,
        // UUID esa qisqartiriladi — u baribir hech narsa anglatmaydi.
        const label = key
          ? t(key)
          : entityTitle ?? (UUID_RE.test(seg) ? `${seg.slice(0, 8)}…` : seg)
        const isLast = i === segments.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-4" style={{ color: 'var(--s-muted)' }} />}
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
  const router = useRouter()
  if (!user) return null

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
  const avatarUrl = resolveMediaUrl(user.avatarUrl)

  return (
    <header
      className="h-14 flex items-center justify-between px-6 shrink-0 border-b z-10 relative"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        borderColor: 'var(--glass-border)',
      }}
    >
      <Breadcrumb />

      <div className="flex items-center gap-1">
        <ThemeSwitcher />
        <LanguageSwitcher />
        <NotificationBell />

        {/* Avatar dropdown — ism matni olib tashlandi (joy tejash uchun),
            to'liq ism va rol hamon ochilganda ko'rinadi */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--s-hover)] transition-colors outline-none cursor-pointer ml-1">
            <Avatar className="size-7">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={user.firstName} />}
              <AvatarFallback style={{ background: '#3B82F6', fontSize: '11px', color: '#fff' }}>
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <p className="font-medium">{user.firstName} {user.lastName}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{user.email}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings')}>
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
      <div className="glass-ambient min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: 'var(--s-bg)' }}>
        <div className="size-9 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        <span className="text-xs font-medium tracking-wide" style={{ color: 'var(--s-muted)' }}>SEASMP</span>
      </div>
    )
  }

  if (!user) return null

  return (
    <SidebarProvider>
      {/* Provider TopHeader'ni ham, sahifani ham qamrab olishi kerak:
          sahifa nomni yozadi, breadcrumb esa uni o'qiydi. */}
      <BreadcrumbTitleProvider>
      <div className="glass-ambient flex h-screen overflow-hidden" style={{ background: 'var(--s-bg)' }}>
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
      </BreadcrumbTitleProvider>
      <GlobalSearch />
      <KeyboardShortcuts />
    </SidebarProvider>
  )
}
