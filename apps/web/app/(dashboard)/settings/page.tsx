'use client'

import { motion } from 'framer-motion'
import { useLocale } from '@/store/locale'
import { fadeUp } from './_components/settings-ui'
import { ProfileSection } from './_components/profile-section'
import { SecuritySection } from './_components/security-section'
import { NotificationsSection } from './_components/notifications-section'

export default function SettingsPage() {
  const { t } = useLocale()
  return (
    <div style={{ maxWidth: '960px', paddingBottom: '40px' }}>
      <style>{`
        .settings-profile { grid-template-columns: clamp(160px, 20%, 200px) 1fr !important; }
        @media (max-width: 768px) {
          .settings-profile { grid-template-columns: 1fr !important; }
          .settings-profile > div:first-child { align-items: flex-start !important; }
          .settings-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <motion.div {...fadeUp()} style={{ marginBottom: '24px' }}>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--s-text)' }}>{t('settings.title')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--s-muted)' }}>{t('settings.description')}</p>
      </motion.div>

      {/* Profile — full width */}
      <div style={{ marginBottom: '24px' }}>
        <ProfileSection />
      </div>

      {/* Security + Notifications — 2 column */}
      <div className="settings-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '24px',
      }}>
        <SecuritySection />
        <NotificationsSection />
      </div>
    </div>
  )
}
