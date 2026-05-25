'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { attendanceApi, coursesApi, enrollmentsApi, type Attendance, type Course, type Enrollment } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useLocale } from '@/store/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { QrCode, RefreshCw, Plus, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

// ── Heatmap helpers ───────────────────────────────────────────────────────────
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

const STATUS_META: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType<{ className?: string }> }> = {
  PRESENT: { label: 'Keldi',      color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  Icon: CheckCircle  },
  ABSENT:  { label: 'Kelmadi',    color: '#EF4444', bg: 'rgba(239,68,68,0.12)', Icon: XCircle      },
  LATE:    { label: 'Kech keldi', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', Icon: AlertCircle  },
}

const LEGEND = [
  { cls: 'heat-none',  label: "Dars yo'q" },
  { cls: 'heat-zero',  label: '0%'        },
  { cls: 'heat-low',   label: '<50%'      },
  { cls: 'heat-med',   label: '<70%'      },
  { cls: 'heat-good',  label: '<90%'      },
  { cls: 'heat-great', label: '90%+'      },
]

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const { user } = useAuth()
  const { t }    = useLocale()
  const [records, setRecords]         = useState<Attendance[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [courses, setCourses]         = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState('ALL')
  const [markOpen, setMarkOpen]       = useState(false)
  const [qrOpen, setQrOpen]           = useState(false)
  const [qrData, setQrData]           = useState<{ token: string; qrCodeUrl: string; expiresIn: number } | null>(null)
  const [countdown, setCountdown]     = useState(0)
  const countdownRef                  = useRef<ReturnType<typeof setInterval> | null>(null)
  const [form, setForm]               = useState({ enrollmentId: '', lessonDate: '', status: 'PRESENT' })
  const [qrForm, setQrForm]           = useState({ courseId: '', lessonDate: '' })
  const [qrLoading, setQrLoading]     = useState(false)

  const load = () =>
    attendanceApi.list().then(r => setRecords(r.data)).catch(e => toast.error(e.message))

  useEffect(() => {
    load()
    enrollmentsApi.list().then(r => setEnrollments(r.data)).catch(() => {})
    coursesApi.list().then(r => setCourses(r.data)).catch(() => {})
  }, []) // eslint-disable-line

  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (!qrData) { setCountdown(0); return }
    setCountdown(qrData.expiresIn)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!)
          setQrData(null)
          toast.warning('QR kod muddati tugadi')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [qrData])

  const mark = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await attendanceApi.mark(form)
      toast.success('Davomat belgilandi')
      setMarkOpen(false)
      setForm({ enrollmentId: '', lessonDate: '', status: 'PRESENT' })
      load()
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Xato') }
  }

  const generateQr = async (e: React.FormEvent) => {
    e.preventDefault()
    setQrLoading(true)
    try {
      const res = await attendanceApi.generateQr(qrForm.courseId, qrForm.lessonDate)
      setQrData(res.data)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Xato')
    } finally {
      setQrLoading(false)
    }
  }

  const isTeacher = user?.role === 'TEACHER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const teacherCourses = courses.length > 0
    ? courses
    : Array.from(new Map(enrollments.map(e => [e.course.id, e.course])).values())

  // ── Filtered records ────────────────────────────────────────────────────────
  const selectedCourseTitle = teacherCourses.find(c => c.id === selectedCourse)?.title
  const filtered = selectedCourse === 'ALL' || !selectedCourseTitle
    ? records
    : records.filter(r => r.enrollment.course.title === selectedCourseTitle)

  // ── Calendar heatmap: last 30 days ──────────────────────────────────────────
  const heatmapDays = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      d.setHours(0, 0, 0, 0)
      const dateStr = d.toISOString().split('T')[0]

      const dayRecs = filtered.filter(r => {
        const rd = new Date(r.lessonDate)
        return rd.toISOString().split('T')[0] === dateStr
      })
      const total   = dayRecs.length
      const present = dayRecs.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length
      const pct     = total > 0 ? Math.round((present / total) * 100) : -1

      return { date: d, dateStr, pct, total }
    })
  }, [filtered])

  // ── Today's / most-recent session ──────────────────────────────────────────
  const todayStr    = new Date().toISOString().split('T')[0]
  const todayRecs   = filtered.filter(r => new Date(r.lessonDate).toISOString().split('T')[0] === todayStr)
  const displayRecs = todayRecs.length > 0 ? todayRecs : filtered.slice(0, 15)
  const sessionDate = displayRecs.length > 0
    ? new Date(displayRecs[0].lessonDate).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  const stats = {
    present: displayRecs.filter(r => r.status === 'PRESENT').length,
    absent:  displayRecs.filter(r => r.status === 'ABSENT').length,
    late:    displayRecs.filter(r => r.status === 'LATE').length,
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--s-text)' }}>{t('attendance.title')}</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>{records.length} ta yozuv</p>
        </div>

        {isTeacher && (
          <Dialog open={markOpen} onOpenChange={setMarkOpen}>
            <DialogTrigger render={
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors shrink-0"
                style={{ borderColor: 'var(--s-border)', color: 'var(--s-muted)', background: 'transparent' }}
              />
            }>
              <Plus className="size-4" /> {t('attendance.mark')}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Davomat belgilash</DialogTitle></DialogHeader>
              <form onSubmit={mark} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Talaba ro'yxati</Label>
                  <Select value={form.enrollmentId} onValueChange={v => setForm(f => ({...f, enrollmentId: v ?? ''}))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Talabani tanlang" /></SelectTrigger>
                    <SelectContent>
                      {enrollments.map(e => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.student.firstName} {e.student.lastName} — {e.course.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Dars sanasi</Label>
                  <Input type="date" value={form.lessonDate}
                    onChange={e => setForm(f => ({...f, lessonDate: e.target.value}))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Holat</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({...f, status: v ?? ''}))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRESENT">{t('attendance.present')}</SelectItem>
                      <SelectItem value="ABSENT">{t('attendance.absent')}</SelectItem>
                      <SelectItem value="LATE">{t('attendance.late')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter showCloseButton>
                  <Button type="submit">{t('common.save')}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Course selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedCourse} onValueChange={v => setSelectedCourse(v ?? 'ALL')}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Barcha kurslar</SelectItem>
            {teacherCourses.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs" style={{ color: 'var(--s-muted)' }}>
          {heatmapDays.filter(d => d.total > 0).length} ta faol kun (so'nggi 30 kun)
        </span>
      </div>

      {/* Calendar heatmap */}
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
          {heatmapDays.map(({ date, dateStr, pct, total }) => (
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
          {LEGEND.map(({ cls, label }) => (
            <div key={cls} className="flex items-center gap-1.5">
              <div className={`heat-cell ${cls}`}
                style={{ width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: 'var(--s-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Today's attendance */}
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
              {todayRecs.length > 0 ? t('attendance.today') : "So'nggi dars davomati"}
            </h2>
            {sessionDate && <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>{sessionDate}</p>}
          </div>
          {displayRecs.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1" style={{ color: '#22C55E' }}>
                <CheckCircle className="size-3.5" /> {stats.present}
              </span>
              <span className="flex items-center gap-1" style={{ color: '#F59E0B' }}>
                <AlertCircle className="size-3.5" /> {stats.late}
              </span>
              <span className="flex items-center gap-1" style={{ color: '#EF4444' }}>
                <XCircle className="size-3.5" /> {stats.absent}
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
                    <Clock className="size-3" />
                    {new Date(r.lessonDate).toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' })}
                  </div>
                  <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ color: meta.color, background: meta.bg }}>
                    <Icon className="size-3" /> {meta.label}
                  </span>
                </div>
              </motion.div>
            )
          }) : (
            <div className="py-12 text-center">
              <p className="text-sm" style={{ color: 'var(--s-muted)' }}>Davomat yozuvlari mavjud emas</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Fixed QR button + Dialog ─────────────────────────────────────── */}
      {isTeacher && (
        <Dialog open={qrOpen} onOpenChange={v => { setQrOpen(v); if (!v) setQrData(null) }}>
          <DialogTrigger render={
            <button
              style={{
                position:     'fixed',
                bottom:       '32px',
                right:        '32px',
                display:      'flex',
                alignItems:   'center',
                gap:          '8px',
                padding:      '12px 20px',
                background:   '#3b82f6',
                color:        'white',
                border:       'none',
                borderRadius: '12px',
                cursor:       'pointer',
                fontSize:     '14px',
                fontWeight:   500,
                boxShadow:    '0 4px 20px rgba(59,130,246,0.4)',
                zIndex:       100,
              }}
            />
          }>
            <QrCode className="size-4" /> {t('attendance.qr')}
          </DialogTrigger>

          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>QR Davomat</DialogTitle></DialogHeader>
            <form onSubmit={generateQr} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Kurs</Label>
                <Select value={qrForm.courseId} onValueChange={v => setQrForm(f => ({...f, courseId: v ?? ''}))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Kursni tanlang" /></SelectTrigger>
                  <SelectContent>
                    {teacherCourses.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Dars sanasi</Label>
                <Input type="date" value={qrForm.lessonDate}
                  onChange={e => setQrForm(f => ({...f, lessonDate: e.target.value}))} required />
              </div>
              <Button type="submit" disabled={!qrForm.courseId || !qrForm.lessonDate || qrLoading}>
                {qrLoading ? 'Yaratilmoqda...' : t('attendance.qr')}
              </Button>
            </form>

            {qrData && (
              <div className="flex flex-col items-center gap-3 pt-3 border-t"
                style={{ borderColor: 'var(--s-border)' }}>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrData.qrCodeUrl} alt="QR Code"
                    className="rounded-xl p-2 size-56"
                    style={{ background: '#fff' }} />
                  {countdown <= 30 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-4xl font-bold font-mono ${countdown <= 10 ? 'text-red-500' : 'text-orange-500'}`}>
                        {countdown}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--s-muted)' }}>
                  <span className={countdown <= 10 ? 'text-red-400 font-semibold' : ''}>{countdown}s qoldi</span>
                  <button
                    type="button"
                    onClick={() => generateQr({ preventDefault: () => {} } as React.FormEvent)}
                    disabled={qrLoading}
                    className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <RefreshCw className="size-3.5" /> Yangilash
                  </button>
                </div>
                <p className="text-xs text-center" style={{ color: 'var(--s-muted)' }}>
                  Talabalar bu QR kodni skanerlashsin
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
