'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { attendanceApi, enrollmentsApi, type Attendance, type Enrollment } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useCourse } from '@/lib/use-course'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useRealtime, useRealtimeEvent, type AttendanceMarkedEvent } from '@/lib/realtime'
import { ArrowLeft, Plus, QrCode } from 'lucide-react'

const STATUS_OPTS = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const
type AttStatus = typeof STATUS_OPTS[number]

const variantMap: Record<AttStatus, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  PRESENT: 'default', ABSENT: 'destructive', LATE: 'secondary', EXCUSED: 'outline',
}

export default function CourseAttendancePage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [records, setRecords]         = useState<Attendance[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [filterDate, setFilterDate]   = useState('')
  const [open, setOpen]               = useState(false)
  const [qrOpen, setQrOpen]           = useState(false)
  const [qrToken, setQrToken]         = useState<string | null>(null)
  const [qrImage, setQrImage]         = useState<string | null>(null)
  const [qrCountdown, setQrCountdown] = useState(0)

  const [form, setForm]               = useState({ enrollmentId: '', lessonDate: '', status: 'PRESENT' as AttStatus })
  const [qrDate, setQrDate]           = useState(new Date().toISOString().slice(0, 10))
  const [loading, setLoading]         = useState(true)
  const [marking, setMarking]         = useState(false)
  const [qrGenerating, setQrGenerating] = useState(false)

  // Manzildagi qism slug bo'lishi mumkin — quyidagi so'rovlar esa UUID kutadi
  const { courseId } = useCourse(id)

  const load = useCallback(() => {
    if (!courseId) return
    setLoading(true)
    const q = filterDate ? `lessonDate=${filterDate}&limit=500` : 'limit=500'
    attendanceApi.byCourse(courseId, q)
      .then(r => setRecords(r.data))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [courseId, filterDate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!courseId) return
    enrollmentsApi.list(`courseId=${courseId}&limit=200`).then(r => setEnrollments(r.data)).catch(() => {})
  }, [courseId])

  // Kurs xonasiga qo'shilish. Server ruxsatni O'ZI tekshiradi — xonaga
  // faqat shu kursning o'qituvchisi, yozilgan talabasi yoki admin kiradi.
  const { socket } = useRealtime()
  useEffect(() => {
    if (!socket || !courseId) return
    socket.emit('join:course', courseId)
    return () => { socket.emit('leave:course', courseId) }
  }, [socket, courseId])

  // Boshqa birov (yoki QR bilan talabaning o'zi) davomat belgilasa, jadval
  // sahifani yangilamasdan to'ldiriladi.
  useRealtimeEvent<AttendanceMarkedEvent>('attendance:marked', (e) => {
    if (e.courseId !== courseId) return
    load()
  })

  // QR countdown
  useEffect(() => {
    if (qrCountdown <= 0) return
    const t = setTimeout(() => {
      setQrCountdown(c => {
        if (c <= 1) { setQrToken(null); toast.info("QR tokenning muddati tugadi") }
        return c - 1
      })
    }, 1000)
    return () => clearTimeout(t)
  }, [qrCountdown])

  const mark = async (e: React.FormEvent) => {
    e.preventDefault()
    setMarking(true)
    try {
      await attendanceApi.mark(form)
      toast.success("Davomat belgilandi")
      setOpen(false)
      setForm({ enrollmentId: '', lessonDate: '', status: 'PRESENT' })
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setMarking(false)
    }
  }

  const generateQr = async () => {
    // `id` — manzildagi qism, u slug bo'lishi mumkin. API bu yerda UUID kutadi,
    // shuning uchun aniqlangan kursning identifikatori yuboriladi.
    if (!courseId) return
    setQrGenerating(true)
    try {
      const res = await attendanceApi.generateQr(courseId, qrDate)
      setQrToken(res.data.token)
      setQrImage(res.data.qrCodeUrl)
      setQrCountdown(res.data.expiresIn)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setQrGenerating(false)
    }
  }

  // Aggregate by date — show summary stats
  const uniqueDates = [...new Set(records.map(r => r.lessonDate))].sort().reverse()
  const statsByDate = uniqueDates.map(date => {
    const day = records.filter(r => r.lessonDate === date)
    return {
      date,
      present: day.filter(r => r.status === 'PRESENT').length,
      absent:  day.filter(r => r.status === 'ABSENT').length,
      late:    day.filter(r => r.status === 'LATE').length,
      total:   day.length,
    }
  })

  const isTeacher = user?.role === 'TEACHER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const qrFmt = `${Math.floor(qrCountdown / 60)}:${String(qrCountdown % 60).padStart(2, '0')}`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href={`/courses/${id}`} />}>
          <ArrowLeft className="size-[18px]" />
        </Button>
        <h1 className="text-2xl font-semibold">Davomat</h1>
      </div>

      {/* Summary cards */}
      {statsByDate.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Jami darslar", value: uniqueDates.length },
            { label: "O'rtacha davomat", value: statsByDate.length ? `${Math.round(statsByDate.reduce((s,d) => s + (d.present/Math.max(d.total,1)*100), 0)/statsByDate.length)}%` : '—' },
            { label: "Jami yozuvlar", value: records.length },
            { label: "Talabalar", value: enrollments.length },
          ].map(({ label, value }) => (
            <Card key={label} size="sm">
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle></CardHeader>
              <CardContent><p className="font-medium">{value}</p></CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="w-40"
          placeholder="Sana bo'yicha"
        />
        {filterDate && (
          <Button variant="ghost" size="sm" onClick={() => setFilterDate('')}>Tozalash</Button>
        )}

        {isTeacher && (
          <>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button variant="outline" />}>
                <Plus className="size-[18px]" /> Qo'lda belgilash
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Davomat belgilash</DialogTitle></DialogHeader>
                <form onSubmit={mark} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Talaba</Label>
                    <Select value={form.enrollmentId} onValueChange={v => setForm(f => ({...f, enrollmentId: v ?? ''}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Talabani tanlang" /></SelectTrigger>
                      <SelectContent>
                        {enrollments.map(e => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.student.firstName} {e.student.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Dars sanasi</Label>
                    <Input type="date" value={form.lessonDate} onChange={e => setForm(f => ({...f, lessonDate: e.target.value}))} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Holat</Label>
                    <Select value={form.status} onValueChange={v => setForm(f => ({...f, status: (v ?? 'PRESENT') as AttStatus}))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTS.map(s => <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter showCloseButton>
                    <Button type="submit" disabled={!form.enrollmentId || !form.lessonDate || marking}>
                      {marking ? 'Saqlanmoqda...' : 'Belgilash'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={qrOpen} onOpenChange={v => { setQrOpen(v); if (!v) { setQrToken(null); setQrImage(null); setQrCountdown(0) } }}>
              <DialogTrigger render={<Button />}>
                <QrCode className="size-[18px]" /> QR davomat
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>QR davomat tokeni</DialogTitle></DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Dars sanasi</Label>
                    <Input type="date" value={qrDate} onChange={e => setQrDate(e.target.value)} />
                  </div>
                  {!qrToken ? (
                    <Button onClick={generateQr} disabled={qrGenerating}>
                      {qrGenerating ? 'Yaratilmoqda...' : 'Token yaratish'}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Muddati tugaydi</span>
                        <Badge variant={qrCountdown < 60 ? 'destructive' : 'default'} className="text-lg px-3 py-1 font-mono">
                          {qrFmt}
                        </Badge>
                      </div>
                      {/* QR endi xom tokenni emas, to'liq havolani kodlaydi
                          (/attendance/scan?token=...) — telefon kamerasi bilan
                          skanerlansa, talaba to'g'ridan-to'g'ri davomat
                          belgilanadigan sahifaga ochiladi. */}
                      {qrImage && (
                        <div className="flex justify-center bg-white rounded-lg p-3">
                          <img src={qrImage} alt="QR davomat kodi" className="size-44" />
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground text-center">
                        Talabalar buni telefon kamerasi bilan skanerlasa, davomat avtomatik belgilanadi
                      </p>
                      <Button variant="outline" onClick={generateQr} disabled={qrGenerating} className="w-full">
                        {qrGenerating ? 'Yaratilmoqda...' : 'Qayta yaratish'}
                      </Button>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      {/* Records table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sana</TableHead>
            <TableHead>Talaba</TableHead>
            <TableHead>Holat</TableHead>
            <TableHead>Belgilangan vaqt</TableHead>
            <TableHead>QR orqali</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={`sk-${i}`}>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-4 w-6" /></TableCell>
            </TableRow>
          ))}
          {!loading && records.map(r => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-sm">{r.lessonDate?.toString().slice(0,10)}</TableCell>
              <TableCell className="font-medium">
                {(r as any).enrollment?.student?.firstName} {(r as any).enrollment?.student?.lastName}
              </TableCell>
              <TableCell>
                <Badge variant={variantMap[r.status as AttStatus] ?? 'outline'}>{r.status}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {(r as any).markedAt ? new Date((r as any).markedAt).toLocaleTimeString() : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {(r as any).qrToken ? '✓' : '—'}
              </TableCell>
            </TableRow>
          ))}
          {!loading && records.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Davomat yozuvlari yo'q{filterDate ? ` (${filterDate})` : ''}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
