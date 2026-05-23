'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { attendanceApi, enrollmentsApi, type Attendance, type Enrollment } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
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
  const [qrCountdown, setQrCountdown] = useState(0)
  const [form, setForm]               = useState({ enrollmentId: '', lessonDate: '', status: 'PRESENT' as AttStatus })
  const [qrDate, setQrDate]           = useState(new Date().toISOString().slice(0, 10))

  const load = useCallback(() => {
    const q = filterDate ? `lessonDate=${filterDate}&limit=500` : 'limit=500'
    attendanceApi.byCourse(id, q).then(r => setRecords(r.data)).catch(e => toast.error(e.message))
  }, [id, filterDate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    enrollmentsApi.list(`courseId=${id}&limit=200`).then(r => setEnrollments(r.data)).catch(() => {})
  }, [id])

  // QR countdown
  useEffect(() => {
    if (qrCountdown <= 0) return
    const t = setTimeout(() => {
      setQrCountdown(c => {
        if (c <= 1) { setQrToken(null); toast.info('QR token expired') }
        return c - 1
      })
    }, 1000)
    return () => clearTimeout(t)
  }, [qrCountdown])

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

  const generateQr = async () => {
    try {
      const res = await attendanceApi.generateQr(id, qrDate)
      setQrToken(res.data.token)
      setQrCountdown(res.data.expiresIn)
    } catch (err: any) { toast.error(err.message) }
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
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold">Attendance</h1>
      </div>

      {/* Summary cards */}
      {statsByDate.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total lessons', value: uniqueDates.length },
            { label: 'Present avg', value: statsByDate.length ? `${Math.round(statsByDate.reduce((s,d) => s + (d.present/Math.max(d.total,1)*100), 0)/statsByDate.length)}%` : '—' },
            { label: 'Total records', value: records.length },
            { label: 'Students', value: enrollments.length },
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
          placeholder="Filter by date"
        />
        {filterDate && (
          <Button variant="ghost" size="sm" onClick={() => setFilterDate('')}>Clear</Button>
        )}

        {isTeacher && (
          <>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button variant="outline" />}>
                <Plus className="size-4" /> Mark Manual
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Mark Attendance</DialogTitle></DialogHeader>
                <form onSubmit={mark} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Student</Label>
                    <Select value={form.enrollmentId} onValueChange={v => setForm(f => ({...f, enrollmentId: v ?? ''}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select student" /></SelectTrigger>
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
                    <Label>Lesson date</Label>
                    <Input type="date" value={form.lessonDate} onChange={e => setForm(f => ({...f, lessonDate: e.target.value}))} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={v => setForm(f => ({...f, status: (v ?? 'PRESENT') as AttStatus}))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTS.map(s => <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter showCloseButton>
                    <Button type="submit" disabled={!form.enrollmentId || !form.lessonDate}>Mark</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={qrOpen} onOpenChange={v => { setQrOpen(v); if (!v) { setQrToken(null); setQrCountdown(0) } }}>
              <DialogTrigger render={<Button />}>
                <QrCode className="size-4" /> QR Attendance
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>QR Attendance Token</DialogTitle></DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Lesson date</Label>
                    <Input type="date" value={qrDate} onChange={e => setQrDate(e.target.value)} />
                  </div>
                  {!qrToken ? (
                    <Button onClick={generateQr}>Generate Token</Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Expires in</span>
                        <Badge variant={qrCountdown < 60 ? 'destructive' : 'default'} className="text-lg px-3 py-1 font-mono">
                          {qrFmt}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs break-all bg-muted p-3 rounded select-all">{qrToken}</p>
                      <Button variant="outline" onClick={generateQr} className="w-full">Regenerate</Button>
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
            <TableHead>Date</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Marked at</TableHead>
            <TableHead>Via QR</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map(r => (
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
          {records.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No attendance records{filterDate ? ` for ${filterDate}` : ''}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
