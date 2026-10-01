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
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Plus, ChevronLeft, ChevronRight, ClipboardList, LogOut } from 'lucide-react'

const PAGE_SIZE = 20

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Faol', COMPLETED: 'Tugallangan', DROPPED: "Chiqarilgan",
}

export default function EnrollmentsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading]         = useState(true)
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [students, setStudents]       = useState<User[]>([])
  const [courses, setCourses]         = useState<Course[]>([])
  const [open, setOpen]               = useState(false)
  const [enrolling, setEnrolling]     = useState(false)
  const [form, setForm]               = useState({ studentId: '', courseId: '' })
  const [droppingId, setDroppingId]   = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = async () => {
    setLoading(true)
    const res = await enrollmentsApi.list(`page=${page}&limit=${PAGE_SIZE}`).catch(e => { toast.error(e.message); return null })
    if (res) {
      setEnrollments(res.data)
      setTotal(res.meta?.total ?? res.data.length)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [page]) // eslint-disable-line

  useEffect(() => {
    if (!isAdmin) return
    usersApi.list('role=STUDENT&limit=100').then(r => setStudents(r.data)).catch(() => {})
    coursesApi.list('status=ACTIVE&limit=100').then(r => setCourses(r.data)).catch(() => {})
  }, [isAdmin])

  const enroll = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnrolling(true)
    try {
      await enrollmentsApi.enroll(form.studentId, form.courseId)
      toast.success("Talaba kursga yozildi")
      setOpen(false)
      setForm({ studentId: '', courseId: '' })
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setEnrolling(false)
    }
  }

  const dropEnrollment = async (id: string) => {
    setDroppingId(id)
    try {
      await enrollmentsApi.changeStatus(id, 'DROPPED')
      toast.success("Ro'yxatdan chiqarildi")
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDroppingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ro'yxatga olishlar</h1>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-[18px]" /> Yangi ro'yxatga olish
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Talabani kursga yozish</DialogTitle></DialogHeader>
              <form onSubmit={enroll} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Talaba</Label>
                  <Select value={form.studentId} onValueChange={v => setForm(f => ({...f, studentId: v ?? ''}))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Talabani tanlang" /></SelectTrigger>
                    <SelectContent>
                      {students.map(s => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Kurs</Label>
                  <Select value={form.courseId} onValueChange={v => setForm(f => ({...f, courseId: v ?? ''}))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Kursni tanlang" /></SelectTrigger>
                    <SelectContent>
                      {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter showCloseButton>
                  <Button type="submit" disabled={!form.studentId || !form.courseId || enrolling}>
                    {enrolling ? 'Yozilmoqda...' : 'Yozish'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Talaba</TableHead>
            <TableHead>Kurs</TableHead>
            <TableHead>Kategoriya</TableHead>
            <TableHead>Holat</TableHead>
            <TableHead>Yozilgan sana</TableHead>
            {isAdmin && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={`sk-${i}`}>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-4 w-40" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              {isAdmin && <TableCell><Skeleton className="h-7 w-7 rounded" /></TableCell>}
            </TableRow>
          ))}
          {!loading && enrollments.map(e => (
            <TableRow key={e.id}>
              <TableCell className="font-medium">{e.student.firstName} {e.student.lastName}</TableCell>
              <TableCell>{e.course.title}</TableCell>
              <TableCell><Badge variant="secondary">{e.course.category}</Badge></TableCell>
              <TableCell>
                <Badge variant={e.status === 'ACTIVE' ? 'default' : 'outline'}>
                  {STATUS_LABEL[e.status] ?? e.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{new Date(e.enrolledAt).toLocaleDateString()}</TableCell>
              {isAdmin && (
                <TableCell>
                  {e.status === 'ACTIVE' && (
                    <Button
                      variant="ghost" size="icon-sm"
                      title="Ro'yxatdan chiqarish"
                      disabled={droppingId === e.id}
                      onClick={() => dropEnrollment(e.id)}
                    >
                      <LogOut className="size-[18px]" />
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
          {!loading && enrollments.length === 0 && (
            <TableRow>
              <TableCell colSpan={isAdmin ? 6 : 5} className="py-10">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ClipboardList className="size-7 opacity-50" />
                  <p className="text-sm">Ro'yxatga olishlar topilmadi</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            {total} tadan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs px-2 tabular-nums">{page} / {totalPages}</span>
            <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
