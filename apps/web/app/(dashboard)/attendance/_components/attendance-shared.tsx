'use client'

// Davomat sahifasining uchta bo'limi (bugungi ro'yxat, guruh varaqasi, QR)
// baham ko'radigan holat belgisi (PRESENT/ABSENT/LATE) ko'rinishi.

import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useLocale } from '@/store/locale'

export interface StatusMeta {
  label: string
  color: string
  bg: string
  Icon: React.ElementType<{ className?: string }>
}

export function useStatusMeta(): Record<string, StatusMeta> {
  const { t } = useLocale()
  return {
    PRESENT: { label: t('attendance.present'), color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  Icon: CheckCircle  },
    ABSENT:  { label: t('attendance.absent'),  color: '#EF4444', bg: 'rgba(239,68,68,0.12)', Icon: XCircle      },
    LATE:    { label: t('attendance.late'),    color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', Icon: AlertCircle  },
  }
}
