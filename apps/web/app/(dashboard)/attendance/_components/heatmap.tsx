'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useLocale } from '@/store/locale'
import type { Attendance } from '@/lib/api'

function heatClass(rate: number): string {
  if (rate < 0)   return 'heat-none'
  if (rate === 0) return 'heat-zero'
  if (rate < 50)  return 'heat-low'
  if (rate < 70)  return 'heat-med'
  if (rate < 90)  return 'heat-good'
  return 'heat-great'
}

function fmt(d: Date) {
  return d.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' })
}

const LEGEND = [
  { cls: 'heat-none',  key: 'heat-none'  as const },
  { cls: 'heat-zero',  key: 'heat-zero'  as const },
  { cls: 'heat-low',   key: 'heat-low'   as const },
  { cls: 'heat-med',   key: 'heat-med'   as const },
  { cls: 'heat-good',  key: 'heat-good'  as const },
  { cls: 'heat-great', key: 'heat-great' as const },
]

const LEGEND_LABELS: Record<string, { uz: string; ru: string; en: string }> = {
  'heat-none':  { uz: "Dars yo'q", ru: 'Нет урока', en: 'No class' },
  'heat-zero':  { uz: '0%',        ru: '0%',         en: '0%'       },
  'heat-low':   { uz: '<50%',      ru: '<50%',        en: '<50%'     },
  'heat-med':   { uz: '<70%',      ru: '<70%',        en: '<70%'     },
  'heat-good':  { uz: '<90%',      ru: '<90%',        en: '<90%'     },
  'heat-great': { uz: '90%+',      ru: '90%+',        en: '90%+'     },
}

export interface HeatmapDay { date: Date; dateStr: string; pct: number; total: number }

/** So'nggi 30 kunlik davomat kunlari — issiqlik xaritasi va "X faol kun"
 *  yorlig'i bitta hisoblashni baham ko'radi (ikki marta sanalmasligi uchun). */
export function useHeatmapDays(records: Attendance[]): HeatmapDay[] {
  return useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      d.setHours(0, 0, 0, 0)
      const dateStr = d.toISOString().split('T')[0]

      const dayRecs = records.filter(r => {
        const rd = new Date(r.lessonDate)
        return rd.toISOString().split('T')[0] === dateStr
      })
      const total   = dayRecs.length
      const present = dayRecs.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length
      const pct     = total > 0 ? Math.round((present / total) * 100) : -1

      return { date: d, dateStr, pct, total }
    })
  }, [records])
}

/** So'nggi 30 kunlik davomat issiqlik xaritasi. */
export function AttendanceHeatmap({ days }: { days: HeatmapDay[] }) {
  const { t, locale } = useLocale()

  return (
    <motion.div
      className="rounded-xl border p-5"
      style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' as const }}
    >
      <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--s-text)' }}>
        {t('attendance.heatmap')}
      </h2>

      {/* Cells: 14×14px, 2px gap */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
        {days.map(({ date, dateStr, pct, total }) => (
          <div
            key={dateStr}
            title={pct >= 0
              ? `${fmt(date)}: ${pct}% davomat (${total} talaba)`
              : `${fmt(date)}: Dars yo'q`}
            className={`heat-cell ${heatClass(pct)}`}
            style={{
              width: '14px', height: '14px',
              borderRadius: '3px',
              cursor: 'default',
              transition: 'transform 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.4)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 flex-wrap">
        {LEGEND.map(({ cls, key }) => (
          <div key={cls} className="flex items-center gap-1.5">
            <div className={`heat-cell ${cls}`}
              style={{ width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'var(--s-muted)' }}>
              {LEGEND_LABELS[key]?.[locale] ?? key}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
