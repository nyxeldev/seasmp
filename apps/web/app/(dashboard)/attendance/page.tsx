'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { attendanceApi, coursesApi, enrollmentsApi, type Attendance, type Course, type Enrollment } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { QrCode, RefreshCw, Plus, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

// ── Heatmap helpers ───────────────────────────────────────────────────────────
function heatColor(pct: number) {
  if (pct < 0)   return 'rgba(255,255,255,0.04)'
  if (pct === 0) return 'rgba(239,68,68,0.2)'
  if (pct < 60)  return '#14532d'
  if (pct < 80)  return '#166534'
  if (pct < 90)  return '#16a34a'
  return '#22c55e'
}

function fmt(d: Date) {
  return d.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' })
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType<{ className?: string }> }> = {
  PRESENT: { label: 'Keldi',    color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  Icon: CheckCircle  },
  ABSENT:  { label: 'Kelmadi', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', Icon: XCircle      },
  LATE:    { label: 'Kech keldi', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', Icon: AlertCircle  },
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const { user } = useAuth()
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
    } catch (err: any) { toast.error(err.message) }
  }

  const generateQr = async (e: React.FormEvent) => {
    e.preventDefault()
    setQrLoading(true)
    try {
      const res = await attendanceApi.generateQr(qrForm.courseId, qrForm.lessonDate)
      setQrData(res.data)
    } catch (err: any) {
      toast.error(err.message)
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
    <div className="space-y-5 relative">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Davomat</h1>
          <p className="text-xs text-slate-400 mt-0.5">{records.length} ta yozuv</p>
        </div>

        {isTeacher && (
          <Dialog open={markOpen} onOpenChange={setMarkOpen}>
            <DialogTrigger render={
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors shrink-0"
                style={{ borderColor: 'rgba(255,255,255,0.12)', color: '#94A3B8', background: 'transparent' }}
              />
            }>
              <Plus className="size-4" /> Belgilash
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
                      <SelectItem value="PRESENT">Keldi</SelectItem>
                      <SelectItem value="ABSENT">Kelmadi</SelectItem>
                      <SelectItem value="LATE">Kech keldi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter showCloseButton>
                  <Button type="submit">Saqlash</Button>
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
        <span className="text-xs text-slate-500">
          {heatmapDays.filter(d => d.total > 0).length} ta faol kun (so'nggi 30 kun)
        </span>
      </div>

      {/* Calendar heatmap */}
      <motion.div
        className="rounded-xl border p-5"
        style={{ background: '#1E293B', borderColor: 'rgba(255,255,255,0.06)' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' as const }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Davomat xaritasi</h2>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>Kam</span>
            {['rgba(255,255,255,0.04)', '#14532d', '#166534', '#16a34a', '#22c55e'].map((c, i) => (
              <span key={i} className="size-3 rounded-sm inline-block" style={{ background: c }} />
            ))}
            <span>Ko'p</span>
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {heatmapDays.map(({ date, dateStr, pct, total }) => (
            <div
              key={dateStr}
              title={`${fmt(date)}: ${pct >= 0 ? `${pct}% davomat (${total} talaba)` : "Dars yo'q"}`}
              className="size-7 rounded-md cursor-default transition-transform hover:scale-110"
              style={{ background: heatColor(pct) }}
            />
          ))}
        </div>

        {/* Heatmap legend row */}
        <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm inline-block" style={{ background: 'rgba(239,68,68,0.2)' }} />
            <span>0% davomat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm inline-block" style={{ background: '#22c55e' }} />
            <span>90%+ davomat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm inline-block" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <span>Dars yo'q</span>
          </div>
        </div>
      </motion.div>

      {/* Today's attendance */}
      <motion.div
        className="rounded-xl border"
        style={{ background: '#1E293B', borderColor: 'rgba(255,255,255,0.06)' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' as const, delay: 0.1 }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="text-sm font-semibold text-white">
              {todayRecs.length > 0 ? "Bugungi davomat" : "So'nggi dars davomati"}
            </h2>
            {sessionDate && <p className="text-xs text-slate-400 mt-0.5">{sessionDate}</p>}
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

        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
          {displayRecs.length > 0 ? displayRecs.map((r, i) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.ABSENT
            const Icon = meta.Icon
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.03 }}
                className="flex items-center gap-3 px-5 py-3 hover:bg-white/2 transition-colors"
              >
                <div className="size-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                  style={{ background: `${meta.color}22` }}>
                  {r.enrollment.student.firstName[0]}{r.enrollment.student.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {r.enrollment.student.firstName} {r.enrollment.student.lastName}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{r.enrollment.course.title}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
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
              <p className="text-sm text-slate-400">Davomat yozuvlari mavjud emas</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Floating QR button + Dialog ─────────────────────────────────────── */}
      {isTeacher && (
        <Dialog open={qrOpen} onOpenChange={v => { setQrOpen(v); if (!v) setQrData(null) }}>
          <DialogTrigger render={
            <button
              className="fixed bottom-8 right-8 flex items-center gap-2.5 px-5 py-3 rounded-full text-sm font-semibold text-white shadow-2xl seasmp-btn z-40"
              style={{
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                boxShadow: '0 8px 32px rgba(59,130,246,0.45)',
              }}
            />
          }>
            <QrCode className="size-4.5" /> QR Yaratish
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
                {qrLoading ? 'Yaratilmoqda...' : 'QR Yaratish'}
              </Button>
            </form>

            {qrData && (
              <div className="flex flex-col items-center gap-3 pt-3 border-t"
                style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="relative">
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
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <span className={countdown <= 10 ? 'text-red-400 font-semibold' : ''}>{countdown}s qoldi</span>
                  <button
                    type="button"
                    onClick={() => generateQr({ preventDefault: () => {} } as any)}
                    disabled={qrLoading}
                    className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <RefreshCw className="size-3.5" /> Yangilash
                  </button>
                </div>
                <p className="text-xs text-slate-500 text-center">
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
