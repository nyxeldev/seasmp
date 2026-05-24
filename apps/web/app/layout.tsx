import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'SEASMP — Smart Education Platform',
  description: 'Smart Education Analytics & Security Monitoring Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground font-[var(--font-inter)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
