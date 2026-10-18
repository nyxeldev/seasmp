'use client'

import { useState } from 'react'
import { useLocale } from '@/store/locale'
import { toast } from 'sonner'
import { Bell, Mail, Check } from 'lucide-react'
import { Card, Toggle } from './settings-ui'

export function NotificationsSection() {
  const { t } = useLocale()
  const [prefs, setPrefs] = useState({
    attendance: true, grades: true, risk: true,
    system: false, weeklyReport: true, email: true,
  })
  const [saved, setSaved] = useState(false)
  const set = (k: keyof typeof prefs) => (v: boolean) => setPrefs(p => ({ ...p, [k]: v }))

  return (
    <Card title={t('settings.notifications')} description={t('settings.notifDescription')} icon={Bell} delay={0.2}>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--s-border)' }}>
        <div className="px-4 py-2.5" style={{ background: 'var(--s-alt)' }}>
          <div className="flex items-center gap-2">
            <Bell className="size-4" style={{ color: 'var(--s-muted)' }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--s-muted)' }}>Tizim ichida</span>
          </div>
        </div>
        <div className="px-4">
          <Toggle label="Davomat ogohlantirishlari" description="O'quvchi dars qoldirganda" checked={prefs.attendance} onChange={set('attendance')} />
          <Toggle label="Baho yangilanishlari" description="Yangi baho kiritilganda" checked={prefs.grades} onChange={set('grades')} />
          <Toggle label="Xavf ogohlantirishlari" description="O'quvchi xavf darajasi oshganda" checked={prefs.risk} onChange={set('risk')} />
          <Toggle label="Tizim xabarlari" description="Texnik xizmat va yangilanishlar" checked={prefs.system} onChange={set('system')} />
        </div>
        <div className="px-4 py-2.5 mt-1" style={{ background: 'var(--s-alt)' }}>
          <div className="flex items-center gap-2">
            <Mail className="size-4" style={{ color: 'var(--s-muted)' }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--s-muted)' }}>Email</span>
          </div>
        </div>
        <div className="px-4">
          <Toggle label="Email bildirishnomalar" description="Muhim voqealar haqida emailga xabar" checked={prefs.email} onChange={set('email')} />
          <Toggle label="Haftalik hisobot" description="Har dushanba kuni umumiy hisobot" checked={prefs.weeklyReport} onChange={set('weeklyReport')} />
        </div>
      </div>
      <div className="flex justify-end pt-4">
        <button onClick={() => { setSaved(true); toast.success(t('settings.saved')); setTimeout(() => setSaved(false), 2500) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all seasmp-btn"
          style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>
          {saved ? <><Check className="size-[18px]" /> {t('settings.saved')}</> : t('settings.save')}
        </button>
      </div>
    </Card>
  )
}
