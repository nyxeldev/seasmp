'use client'

import { ThemeProvider } from 'next-themes'
import { LocaleProvider } from '@/lib/locale-context'
import { AuthProvider } from '@/lib/auth-context'
import { RealtimeProvider } from '@/lib/realtime'
import { Toaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="seasmp-theme" disableTransitionOnChange={false}>
        <AuthProvider>
          <RealtimeProvider>
            {children}
            <Toaster richColors position="top-right" />
          </RealtimeProvider>
        </AuthProvider>
      </ThemeProvider>
    </LocaleProvider>
  )
}
