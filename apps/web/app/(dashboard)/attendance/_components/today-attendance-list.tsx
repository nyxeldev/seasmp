'use client'

import { motion } from 'framer-motion'
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useLocale } from '@/store/locale'
import type { Attendance } from '@/lib/api'
import { useStatusMeta } from './attendance-shared'

/** Bugungi davomat ro'yxati; bugun uchun yozuv bo'lmasa so'nggi 15 tasini ko'rsatadi. */
export function TodayAttendanceList({ records }: { records: Attendance[] }) {
  const { t } = useLocale()
  const STATUS_META = useStatusMeta()

  const todayStr    = new Date().toISOString().split('T')[0]
  const todayRecs   = records.filter(r => new Date(r.lessonDate).toISOString().split('T')[0] === todayStr)
  const displayRecs = todayRecs.length > 0 ? todayRecs : records.slice(0, 15)
  const sessionDate = displayRecs.length > 0
    ? new Date(displayRecs[0].lessonDate).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  const stats = {
    present: displayRecs.filter(r => r.status === 'PRESENT').length,
    absent:  displayRecs.filter(r => r.status === 'ABSENT').length,
    late:    displayRecs.filter(r => r.status === 'LATE').length,
  }

  return (
    <motion.div
      className="rounded-xl border"
      style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' as const, delay: 0.1 }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: 'var(--s-border)' }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--s-text)' }}>
            {todayRecs.length > 0 ? t('attendance.today') : t('attendance.recentLesson')}
          </h2>
          {sessionDate && <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>{sessionDate}</p>}
        </div>
        {displayRecs.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1" style={{ color: '#22C55E' }}>
              <CheckCircle className="size-4" /> {stats.present}
            </span>
            <span className="flex items-center gap-1" style={{ color: '#F59E0B' }}>
              <AlertCircle className="size-4" /> {stats.late}
            </span>
            <span className="flex items-center gap-1" style={{ color: '#EF4444' }}>
              <XCircle className="size-4" /> {stats.absent}
            </span>
          </div>
        )}
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--s-border)' }}>
        {displayRecs.length > 0 ? displayRecs.map((r, i) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.ABSENT
          const Icon = meta.Icon
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.03 }}
              className="flex items-center gap-3 px-5 py-3 transition-colors"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div className="size-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background: `${meta.color}22`, color: meta.color }}>
                {r.enrollment.student.firstName[0]}{r.enrollment.student.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--s-text)' }}>
                  {r.enrollment.student.firstName} {r.enrollment.student.lastName}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--s-muted)' }}>{r.enrollment.course.title}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--s-muted)' }}>
                  <Clock className="size-3.5" />
                  {new Date(r.lessonDate).toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' })}
                </div>
                <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ color: meta.color, background: meta.bg }}>
                  <Icon className="size-3.5" /> {meta.label}
                </span>
              </div>
            </motion.div>
          )
        }) : (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--s-muted)' }}>{t('attendance.noRecords')}</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
