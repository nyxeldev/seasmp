'use client'

import { useEffect, useState } from 'react'
import { enrollmentsApi, usersApi, coursesApi, type Enrollment, type User, type Course } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

export default function EnrollmentsPage() {
  const { user } = useAuth()
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [students, setStudents]       = useState<User[]>([])
  const [courses, setCourses]         = useState<Course[]>([])
  const [open, setOpen]               = useState(false)
  const [form, setForm]               = useState({ studentId: '', courseId: '' })

  const load = () =>
    enrollmentsApi.list().then(r => setEnrollments(r.data)).catch(e => toast.error(e.message))

  useEffect(() => {
    load()
    if (user?.role === 'ADMIN') {
      usersApi.list('role=STUDENT').then(r => setStudents(r.data)).catch(() => {})
      coursesApi.list('status=ACTIVE&limit=100').then(r => setCourses(r.data)).catch(() => {})
    }
  }, [user]) // eslint-disable-line

  const enroll = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await enrollmentsApi.enroll(form.studentId, form.courseId)
      toast.success('Enrolled successfully')
      setOpen(false)
      setForm({ studentId: '', courseId: '' })
      load()
    } catch (err: any) { toast.error(err.message) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Enrollments</h1>
        {user?.role === 'ADMIN' && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-4" /> New Enrollment
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enroll Student</DialogTitle></DialogHeader>
              <form onSubmit={enroll} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Student</Label>
                  <Select value={form.studentId} onValueChange={v => setForm(f => ({...f, studentId: v ?? ''}))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select student" /></SelectTrigger>
                    <SelectContent>
                      {students.map(s => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Course</Label>
                  <Select value={form.courseId} onValueChange={v => setForm(f => ({...f, courseId: v ?? ''}))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select course" /></SelectTrigger>
                    <SelectContent>
                      {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter showCloseButton>
                  <Button type="submit" disabled={!form.studentId || !form.courseId}>Enroll</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Enrolled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {enrollments.map(e => (
            <TableRow key={e.id}>
              <TableCell className="font-medium">{e.student.firstName} {e.student.lastName}</TableCell>
              <TableCell>{e.course.title}</TableCell>
              <TableCell><Badge variant="secondary">{e.course.category}</Badge></TableCell>
              <TableCell><Badge variant={e.status === 'ACTIVE' ? 'default' : 'outline'}>{e.status}</Badge></TableCell>
              <TableCell className="text-muted-foreground">{new Date(e.enrolledAt).toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
          {enrollments.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No enrollments</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
