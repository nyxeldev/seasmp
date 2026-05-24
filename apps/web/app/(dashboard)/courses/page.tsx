'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { coursesApi, usersApi, type Course, type User } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Search, BookOpen, Users, ExternalLink } from 'lucide-react'

const CATEGORIES = ['IT', 'Mathematics', 'Languages', 'Science', 'Art', 'Business']

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE:   { label: 'Faol',        color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  DRAFT:    { label: 'Qoralama',    color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' },
  ARCHIVED: { label: 'Yakunlangan', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)'  },
}

const AVATAR_COLORS = ['#7C3AED', '#DB2777', '#059669', '#D97706', '#2563EB', '#DC2626']

// ── Sub-components ────────────────────────────────────────────────────────────
function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const R = 16; const cx = 20; const cy = 20
  const circ = 2 * Math.PI * R
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
      <circle
        cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="8" fontWeight="700">{pct}%</text>
    </svg>
  )
}

function TeacherAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase()
  const color = AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
  return (
    <div className="size-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
      style={{ background: color }}>
      {initials}
    </div>
  )
}

function CourseCard({ course, canManage, isAdmin, onStatusChange }: {
  course: Course
  canManage: boolean
  isAdmin: boolean
  onStatusChange: (id: string, s: string) => void
}) {
  const enrolled = course._count?.enrollments ?? 0
  const fillPct  = Math.min(100, Math.round((enrolled / course.maxStudents) * 100))
  const ringColor = fillPct >= 80 ? '#22C55E' : fillPct >= 50 ? '#3B82F6' : '#F59E0B'
  const status = STATUS_META[course.status] ?? STATUS_META.DRAFT
  const teacherName = `${course.teacher.firstName} ${course.teacher.lastName}`

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-4 hover:border-blue-500/30 transition-colors"
      style={{ background: '#1E293B', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md mb-2"
            style={{ background: 'rgba(59,130,246,0.1)', color: '#60A5FA' }}>
            {course.category}
          </span>
          <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">{course.title}</h3>
        </div>
        <ProgressRing pct={fillPct} color={ringColor} />
      </div>

      <div className="flex items-center gap-2">
        <TeacherAvatar name={teacherName} />
        <span className="text-xs text-slate-400 truncate">{teacherName}</span>
      </div>

      <div className="flex items-center justify-between pt-3 border-t"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5 text-slate-500" />
          <span className="text-xs text-slate-400">{enrolled} / {course.maxStudents}</span>
        </div>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={{ color: status.color, background: status.bg }}>
          {status.label}
        </span>
      </div>

      {canManage && (
        <div className="flex items-center gap-2 pt-1">
          <Link href={`/courses/${course.id}`}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <ExternalLink className="size-3" /> Ko'rish
          </Link>
          {isAdmin && course.status !== 'ACTIVE' && (
            <button onClick={() => onStatusChange(course.id, 'ACTIVE')}
              className="ml-auto text-xs px-2 py-0.5 rounded text-green-400 hover:bg-green-400/10 transition-colors">
              Faollashtirish
            </button>
          )}
          {isAdmin && course.status !== 'ARCHIVED' && (
            <button onClick={() => onStatusChange(course.id, 'ARCHIVED')}
              className="text-xs px-2 py-0.5 rounded text-slate-400 hover:bg-slate-700/50 transition-colors">
              Arxivlash
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CoursesPage() {
  const { user } = useAuth()
  const [courses, setCourses]   = useState<Course[]>([])
  const [teachers, setTeachers] = useState<User[]>([])
  const [status, setStatus]     = useState('ALL')
  const [search, setSearch]     = useState('')
  const [open, setOpen]         = useState(false)
  const [form, setForm] = useState({
    title: '', category: 'IT', durationWeeks: 8, price: 0, maxStudents: 20,
    teacherId: '', scheduleDay: 'Monday', scheduleTime: '09:00', room: 'A-1',
  })

  const load = async () => {
    const q   = status !== 'ALL' ? `status=${status}&limit=100` : 'limit=100'
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
        title: form.title, category: form.category,
        durationWeeks: Number(form.durationWeeks),
        price: Number(form.price), maxStudents: Number(form.maxStudents), teacherId,
        schedule: { days: [form.scheduleDay], time: form.scheduleTime, room: form.room },
      })
      toast.success("Kurs yaratildi")
      setOpen(false)
      load()
    } catch (err: any) { toast.error(err.message) }
  }

  const changeStatus = async (id: string, s: string) => {
    try { await coursesApi.changeStatus(id, s); toast.success("Status yangilandi"); load() }
    catch (err: any) { toast.error(err.message) }
  }

  const canManage = user?.role === 'ADMIN' || user?.role === 'TEACHER'
  const isAdmin   = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const filtered = courses.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    `${c.teacher.firstName} ${c.teacher.lastName}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Kurslar</h1>
          <p className="text-xs text-slate-400 mt-0.5">{courses.length} ta kurs</p>
        </div>

        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={
              <button
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white seasmp-btn shrink-0"
                style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}
              />
            }>
              <Plus className="size-4" /> Yangi kurs
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Yangi kurs yaratish</DialogTitle></DialogHeader>
              <form onSubmit={create} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Nomi</Label>
                  <Input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Kategoriya</Label>
                    <Select value={form.category} onValueChange={v => setForm(f => ({...f, category: v ?? ''}))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Haftalar</Label>
                    <Input type="number" min={1} value={form.durationWeeks}
                      onChange={e => setForm(f => ({...f, durationWeeks: +e.target.value}))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Narx (so'm)</Label>
                    <Input type="number" min={0} value={form.price}
                      onChange={e => setForm(f => ({...f, price: +e.target.value}))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Max talaba</Label>
                    <Input type="number" min={1} value={form.maxStudents}
                      onChange={e => setForm(f => ({...f, maxStudents: +e.target.value}))} />
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-1.5">
                    <Label>O'qituvchi</Label>
                    <Select value={form.teacherId} onValueChange={v => setForm(f => ({...f, teacherId: v ?? ''}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="O'qituvchi tanlang" /></SelectTrigger>
                      <SelectContent>
                        {teachers.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Kun</Label>
                    <Select value={form.scheduleDay} onValueChange={v => setForm(f => ({...f, scheduleDay: v ?? ''}))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => (
                          <SelectItem key={d} value={d}>{d.slice(0, 3)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Vaqt</Label>
                    <Input value={form.scheduleTime}
                      onChange={e => setForm(f => ({...f, scheduleTime: e.target.value}))} placeholder="09:00" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Xona</Label>
                    <Input value={form.room}
                      onChange={e => setForm(f => ({...f, room: e.target.value}))} />
                  </div>
                </div>
                <DialogFooter showCloseButton>
                  <Button type="submit">Yaratish</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Kurs yoki o'qituvchi..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm text-white placeholder:text-slate-500 outline-none transition-all"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />
        </div>
        <Select value={status} onValueChange={v => setStatus(v ?? 'ALL')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Barchasi</SelectItem>
            <SelectItem value="DRAFT">Qoralama</SelectItem>
            <SelectItem value="ACTIVE">Faol</SelectItem>
            <SelectItem value="ARCHIVED">Yakunlangan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        >
          {filtered.map(course => (
            <motion.div
              key={course.id}
              variants={{
                hidden: { opacity: 0, y: 16 },
                show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
              }}
            >
              <CourseCard
                course={course}
                canManage={canManage}
                isAdmin={isAdmin}
                onStatusChange={changeStatus}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="rounded-xl border py-20 flex flex-col items-center gap-3"
          style={{ background: '#1E293B', borderColor: 'rgba(255,255,255,0.06)' }}>
          <BookOpen className="size-10 text-slate-600" />
          <p className="text-sm text-slate-400">
            {search ? 'Qidiruvga mos kurs topilmadi' : 'Kurslar mavjud emas'}
          </p>
        </div>
      )}
    </div>
  )
}
