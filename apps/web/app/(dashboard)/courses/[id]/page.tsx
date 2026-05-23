'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  coursesApi, enrollmentsApi, assessmentsApi, attendanceApi, usersApi,
  type Course, type Enrollment, type Assessment, type User,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowLeft, Plus, QrCode, Users, ClipboardList, Star } from 'lucide-react'

type Tab = 'students' | 'attendance' | 'grades'

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [course, setCourse]           = useState<Course | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [students, setStudents]       = useState<User[]>([])
  const [tab, setTab]                 = useState<Tab>('students')
  const [assOpen, setAssOpen]         = useState(false)
  const [assForm, setAssForm]         = useState({ title: '', type: 'QUIZ', maxScore: 100, weight: 0.2 })
  const [enrollOpen, setEnrollOpen]   = useState(false)
  const [enrollStudentId, setEnrollStudentId] = useState('')
  const [qrOpen, setQrOpen]           = useState(false)
  const [qrDate, setQrDate]           = useState(new Date().toISOString().slice(0, 10))
  const [qrToken, setQrToken]         = useState<string | null>(null)
  const [qrCountdown, setQrCountdown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadCourse     = () => coursesApi.getById(id).then(r => setCourse(r.data)).catch(e => toast.error(e.message))
  const loadEnrollments= () => enrollmentsApi.list(`courseId=${id}&limit=200`).then(r => setEnrollments(r.data)).catch(() => {})
  const loadAssessments= () => assessmentsApi.byCourse(id).then(r => setAssessments(r.data)).catch(() => {})

  useEffect(() => {
    loadCourse(); loadEnrollments(); loadAssessments()
  }, [id]) // eslint-disable-line

  useEffect(() => {
    if ((user?.role === 'ADMIN') && enrollOpen) {
      usersApi.list('role=STUDENT&limit=200').then(r => setStudents(r.data)).catch(() => {})
    }
  }, [enrollOpen, user])

  // QR countdown timer
  useEffect(() => {
    if (qrCountdown <= 0) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      if (qrToken) { setQrToken(null); toast.info('QR token expired') }
      return
    }
    timerRef.current = setInterval(() => setQrCountdown(c => c - 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [qrCountdown]) // eslint-disable-line

  const generateQr = async () => {
    try {
      const res = await attendanceApi.generateQr(id, qrDate)
      setQrToken(res.data.token)
      setQrCountdown(res.data.expiresIn)
      toast.success('QR token generated — 5 minutes')
    } catch (err: any) { toast.error(err.message) }
  }

  const createAssessment = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await assessmentsApi.create({ ...assForm, courseId: id, maxScore: Number(assForm.maxScore), weight: Number(assForm.weight) })
      toast.success('Assessment created')
      setAssOpen(false)
      loadAssessments()
    } catch (err: any) { toast.error(err.message) }
  }

  const deleteAssessment = async (aid: string) => {
    if (!confirm('Delete this assessment?')) return
    try {
      await assessmentsApi.delete(aid)
      toast.success('Deleted')
      setAssessments(prev => prev.filter(a => a.id !== aid))
    } catch (err: any) { toast.error(err.message) }
  }

  const enrollStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await enrollmentsApi.enrollToCourse(id, enrollStudentId)
      toast.success('Student enrolled')
      setEnrollOpen(false)
      setEnrollStudentId('')
      loadEnrollments()
    } catch (err: any) { toast.error(err.message) }
  }

  if (!course) return <div className="animate-pulse h-8 w-48 bg-muted rounded" />

  const isTeacher = user?.role === 'TEACHER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const isAdmin   = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const qrFmt     = `${Math.floor(qrCountdown / 60)}:${String(qrCountdown % 60).padStart(2, '0')}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/courses" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold">{course.title}</h1>
        <Badge variant={course.status === 'ACTIVE' ? 'default' : 'outline'}>{course.status}</Badge>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Category',  value: course.category },
          { label: 'Teacher',   value: `${course.teacher.firstName} ${course.teacher.lastName}` },
          { label: 'Duration',  value: `${course.durationWeeks} weeks` },
          { label: 'Students',  value: `${course._count?.enrollments ?? 0} / ${course.maxStudents}` },
        ].map(({ label, value }) => (
          <Card key={label} size="sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle></CardHeader>
            <CardContent><p className="font-medium text-sm">{value}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {isTeacher && (
          <Dialog open={qrOpen} onOpenChange={v => { setQrOpen(v); if (!v) { setQrToken(null); setQrCountdown(0) } }}>
            <DialogTrigger render={<Button variant="outline" />}>
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
                  <Button onClick={generateQr}>Generate QR</Button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Expires in</span>
                      <Badge variant={qrCountdown < 60 ? 'destructive' : 'default'} className="text-lg px-3 py-1 font-mono">
                        {qrFmt}
                      </Badge>
                    </div>
                    <Card size="sm">
                      <CardContent className="pt-3">
                        <p className="font-mono text-xs break-all bg-muted p-3 rounded select-all">{qrToken}</p>
                      </CardContent>
                    </Card>
                    <p className="text-xs text-muted-foreground">Share this token with students. It auto-marks attendance when scanned.</p>
                    <Button variant="outline" onClick={generateQr} className="w-full">Regenerate</Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
        <Button variant="outline" render={<Link href={`/courses/${id}/attendance`} />}>
          <ClipboardList className="size-4" /> Attendance
        </Button>
        <Button variant="outline" render={<Link href={`/courses/${id}/grades`} />}>
          <Star className="size-4" /> Grades
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(['students', 'attendance', 'grades'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'students' && <><Users className="inline size-3.5 mr-1" />Students ({enrollments.length})</>}
            {t === 'attendance' && <><ClipboardList className="inline size-3.5 mr-1" />Attendance</>}
            {t === 'grades' && <><Star className="inline size-3.5 mr-1" />Grades ({assessments.length})</>}
          </button>
        ))}
      </div>

      {/* Tab: Students */}
      {tab === 'students' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Enrolled Students</CardTitle>
            {isAdmin && (
              <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
                <DialogTrigger render={<Button size="sm" />}>
                  <Plus className="size-4" /> Enroll
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Enroll Student</DialogTitle></DialogHeader>
                  <form onSubmit={enrollStudent} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Student</Label>
                      <Select value={enrollStudentId} onValueChange={v => setEnrollStudentId(v ?? '')}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select student" /></SelectTrigger>
                        <SelectContent>
                          {students.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter showCloseButton>
                      <Button type="submit" disabled={!enrollStudentId}>Enroll</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enrolled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <Link href={`/students/${e.student.id}`} className="hover:underline">
                        {e.student.firstName} {e.student.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.student.email}</TableCell>
                    <TableCell><Badge variant={e.status === 'ACTIVE' ? 'default' : 'outline'}>{e.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{new Date(e.enrolledAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {enrollments.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No students enrolled</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tab: Attendance summary */}
      {tab === 'attendance' && (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">View and manage full attendance records on the dedicated page.</p>
          <Button render={<Link href={`/courses/${id}/attendance`} />}>
            <ClipboardList className="size-4" /> Open Attendance Page
          </Button>
        </div>
      )}

      {/* Tab: Assessments */}
      {tab === 'grades' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Assessments ({assessments.length})</CardTitle>
            <div className="flex gap-2">
              {isTeacher && (
                <Dialog open={assOpen} onOpenChange={setAssOpen}>
                  <DialogTrigger render={<Button size="sm" />}>
                    <Plus className="size-4" /> Add Assessment
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>New Assessment</DialogTitle></DialogHeader>
                    <form onSubmit={createAssessment} className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label>Title</Label>
                        <Input value={assForm.title} onChange={e => setAssForm(f => ({...f, title: e.target.value}))} required />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <Label>Type</Label>
                          <Select value={assForm.type} onValueChange={v => setAssForm(f => ({...f, type: v ?? 'QUIZ'}))}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="QUIZ">Quiz</SelectItem>
                              <SelectItem value="HOMEWORK">Homework</SelectItem>
                              <SelectItem value="MIDTERM">Midterm</SelectItem>
                              <SelectItem value="FINAL">Final</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label>Max score</Label>
                          <Input type="number" value={assForm.maxScore} onChange={e => setAssForm(f => ({...f, maxScore: +e.target.value}))} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label>Weight</Label>
                          <Input type="number" step="0.1" min="0" max="1" value={assForm.weight} onChange={e => setAssForm(f => ({...f, weight: +e.target.value}))} />
                        </div>
                      </div>
                      <DialogFooter showCloseButton>
                        <Button type="submit">Create</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
              <Button size="sm" variant="outline" render={<Link href={`/courses/${id}/grades`} />}>
                Full Grades Grid
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Max Score</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Submissions</TableHead>
                  {isTeacher && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell><Badge variant="secondary">{a.type}</Badge></TableCell>
                    <TableCell>{a.maxScore}</TableCell>
                    <TableCell>{(Number(a.weight) * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-muted-foreground">{(a as any)._count?.grades ?? '—'}</TableCell>
                    {isTeacher && (
                      <TableCell>
                        <Button size="xs" variant="destructive" onClick={() => deleteAssessment(a.id)}>Delete</Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {assessments.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No assessments yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
