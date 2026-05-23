'use client'

import { useEffect, useState, useRef } from 'react'
import { attendanceApi, coursesApi, enrollmentsApi, type Attendance, type Course, type Enrollment } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { Plus, QrCode, RefreshCw } from 'lucide-react'

export default function AttendancePage() {
  const { user } = useAuth()
  const [records, setRecords]         = useState<Attendance[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [courses, setCourses]         = useState<Course[]>([])
  const [open, setOpen]               = useState(false)
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

  // Countdown timer for QR expiry
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
      toast.success('Attendance marked')
      setOpen(false)
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

  // For the manual mark dialog: unique courses from enrollments
  const teacherCourses = courses.length > 0
    ? courses
    : Array.from(new Map(enrollments.map(e => [e.course.id, e.course])).values())

  const statusColor = (s: string) =>
    s === 'PRESENT' ? 'default' : s === 'LATE' ? 'secondary' : 'outline'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <div className="flex gap-2">
          {isTeacher && (
            <>
              {/* ── Mark manually ── */}
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger render={<Button variant="outline" />}>
                  <Plus className="size-4" /> Mark
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Mark Attendance</DialogTitle></DialogHeader>
                  <form onSubmit={mark} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Enrollment</Label>
                      <Select value={form.enrollmentId} onValueChange={v => setForm(f => ({...f, enrollmentId: v ?? ''}))}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select student enrollment" /></SelectTrigger>
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
                      <Label>Lesson date</Label>
                      <Input type="date" value={form.lessonDate} onChange={e => setForm(f => ({...f, lessonDate: e.target.value}))} required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={v => setForm(f => ({...f, status: v ?? ''}))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRESENT">Present</SelectItem>
                          <SelectItem value="ABSENT">Absent</SelectItem>
                          <SelectItem value="LATE">Late</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter showCloseButton>
                      <Button type="submit">Mark</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              {/* ── QR Attendance ── */}
              <Dialog open={qrOpen} onOpenChange={v => { setQrOpen(v); if (!v) setQrData(null) }}>
                <DialogTrigger render={<Button />}>
                  <QrCode className="size-4" /> QR Attendance
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
                      <Input
                        type="date"
                        value={qrForm.lessonDate}
                        onChange={e => setQrForm(f => ({...f, lessonDate: e.target.value}))}
                        required
                      />
                    </div>
                    <Button type="submit" disabled={!qrForm.courseId || !qrForm.lessonDate || qrLoading}>
                      {qrLoading ? 'Yaratilmoqda...' : 'QR Yaratish'}
                    </Button>
                  </form>

                  {/* ── QR image ── */}
                  {qrData && (
                    <div className="flex flex-col items-center gap-3 pt-2 border-t">
                      <div className="relative">
                        <img
                          src={qrData.qrCodeUrl}
                          alt="QR Code"
                          className="rounded border p-2 size-56"
                        />
                        {countdown <= 30 && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`text-4xl font-bold font-mono ${countdown <= 10 ? 'text-red-600' : 'text-orange-500'}`}>
                              {countdown}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className={countdown <= 10 ? 'text-red-600 font-semibold' : ''}>
                          {countdown}s qoldi
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => generateQr({ preventDefault: () => {} } as any)}
                          disabled={qrLoading}
                        >
                          <RefreshCw className="size-3.5" /> Yangilash
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground text-center">
                        Talabalar bu QR kodni skanerlashsin yoki tokenni &ldquo;QR Mark&rdquo; maydoniga kiritishsin.
                      </p>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Talaba</TableHead>
            <TableHead>Kurs</TableHead>
            <TableHead>Sana</TableHead>
            <TableHead>Holat</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map(r => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                {r.enrollment.student.firstName} {r.enrollment.student.lastName}
              </TableCell>
              <TableCell>{r.enrollment.course.title}</TableCell>
              <TableCell>{new Date(r.lessonDate).toLocaleDateString()}</TableCell>
              <TableCell>
                <Badge variant={statusColor(r.status)}>{r.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
          {records.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Yozuvlar yo&apos;q
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
