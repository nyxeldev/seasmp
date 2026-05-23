'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { coursesApi, usersApi, type Course, type User } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, ExternalLink } from 'lucide-react'

const CATEGORIES = ['IT', 'Mathematics', 'Languages', 'Science', 'Art', 'Business']

export default function CoursesPage() {
  const { user } = useAuth()
  const [courses, setCourses]   = useState<Course[]>([])
  const [teachers, setTeachers] = useState<User[]>([])
  const [status, setStatus]     = useState('ALL')
  const [open, setOpen]         = useState(false)
  const [form, setForm]         = useState({
    title: '', category: 'IT', durationWeeks: 8, price: 0, maxStudents: 20,
    teacherId: '', scheduleDay: 'Monday', scheduleTime: '09:00', room: 'A-1',
  })

  const load = async () => {
    const q = status !== 'ALL' ? `status=${status}&limit=100` : 'limit=100'
    const res = await coursesApi.list(q).catch(e => { toast.error(e.message); return null })
    if (res) setCourses(res.data)
  }

  useEffect(() => { load() }, [status]) // eslint-disable-line
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      usersApi.list('role=TEACHER').then(r => setTeachers(r.data)).catch(() => {})
    }
  }, [user])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const teacherId = user?.role === 'TEACHER' ? user.id : form.teacherId
      await coursesApi.create({
        title: form.title,
        category: form.category,
        durationWeeks: Number(form.durationWeeks),
        price: Number(form.price),
        maxStudents: Number(form.maxStudents),
        teacherId,
        schedule: { days: [form.scheduleDay], time: form.scheduleTime, room: form.room },
      })
      toast.success('Course created')
      setOpen(false)
      load()
    } catch (err: any) { toast.error(err.message) }
  }

  const changeStatus = async (id: string, s: string) => {
    try {
      await coursesApi.changeStatus(id, s)
      toast.success('Status updated')
      load()
    } catch (err: any) { toast.error(err.message) }
  }

  const del = async (id: string) => {
    if (!confirm('Delete this course?')) return
    try {
      await coursesApi.delete(id)
      toast.success('Deleted')
      load()
    } catch (err: any) { toast.error(err.message) }
  }

  const canManage = user?.role === 'ADMIN' || user?.role === 'TEACHER'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Courses</h1>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-4" /> New Course
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Create Course</DialogTitle></DialogHeader>
              <form onSubmit={create} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Title</Label>
                  <Input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={v => setForm(f => ({...f, category: v ?? ''}))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Weeks</Label>
                    <Input type="number" min={1} value={form.durationWeeks} onChange={e => setForm(f => ({...f, durationWeeks: +e.target.value}))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Price</Label>
                    <Input type="number" min={0} value={form.price} onChange={e => setForm(f => ({...f, price: +e.target.value}))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Max students</Label>
                    <Input type="number" min={1} value={form.maxStudents} onChange={e => setForm(f => ({...f, maxStudents: +e.target.value}))} />
                  </div>
                </div>
                {user?.role === 'ADMIN' && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Teacher</Label>
                    <Select value={form.teacherId} onValueChange={v => setForm(f => ({...f, teacherId: v ?? ''}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select teacher" /></SelectTrigger>
                      <SelectContent>
                        {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Day</Label>
                    <Select value={form.scheduleDay} onValueChange={v => setForm(f => ({...f, scheduleDay: v ?? ''}))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => <SelectItem key={d} value={d}>{d.slice(0,3)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Time</Label>
                    <Input value={form.scheduleTime} onChange={e => setForm(f => ({...f, scheduleTime: e.target.value}))} placeholder="09:00" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Room</Label>
                    <Input value={form.room} onChange={e => setForm(f => ({...f, room: e.target.value}))} />
                  </div>
                </div>
                <DialogFooter showCloseButton>
                  <Button type="submit">Create</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Select value={status} onValueChange={v => setStatus(v ?? 'ALL')}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All statuses</SelectItem>
          <SelectItem value="DRAFT">Draft</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="ARCHIVED">Archived</SelectItem>
        </SelectContent>
      </Select>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Teacher</TableHead>
            <TableHead>Students</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {courses.map(c => (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/courses/${c.id}`} className="font-medium hover:underline flex items-center gap-1">
                  {c.title} <ExternalLink className="size-3 text-muted-foreground" />
                </Link>
              </TableCell>
              <TableCell><Badge variant="secondary">{c.category}</Badge></TableCell>
              <TableCell className="text-muted-foreground">{c.teacher.firstName} {c.teacher.lastName}</TableCell>
              <TableCell>{c._count?.enrollments ?? 0} / {c.maxStudents}</TableCell>
              <TableCell>
                <Badge variant={c.status === 'ACTIVE' ? 'default' : 'outline'}>{c.status}</Badge>
              </TableCell>
              {canManage && (
                <TableCell className="flex gap-1">
                  {user?.role === 'ADMIN' && c.status !== 'ACTIVE' && (
                    <Button size="xs" variant="outline" onClick={() => changeStatus(c.id, 'ACTIVE')}>Activate</Button>
                  )}
                  {user?.role === 'ADMIN' && c.status !== 'ARCHIVED' && (
                    <Button size="xs" variant="outline" onClick={() => changeStatus(c.id, 'ARCHIVED')}>Archive</Button>
                  )}
                  {user?.role === 'ADMIN' && (
                    <Button size="xs" variant="destructive" onClick={() => del(c.id)}>Delete</Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
          {courses.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No courses</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
