'use client'

import { useEffect, useState, useMemo } from 'react'
import { attendanceApi, coursesApi, enrollmentsApi, type Attendance, type Course, type Enrollment } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useLocale } from '@/store/locale'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { AttendanceHeatmap, useHeatmapDays } from './_components/heatmap'
import { MarkAttendanceDialog } from './_components/mark-attendance-dialog'
import { QrDialog } from './_components/qr-dialog'
import { TodayAttendanceList } from './_components/today-attendance-list'

export default function AttendancePage() {
  const { user } = useAuth()
  const { t } = useLocale()

  const [records, setRecords]         = useState<Attendance[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [courses, setCourses]         = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState('ALL')
  const [markOpen, setMarkOpen]       = useState(false)

  const load = () =>
    attendanceApi.list().then(r => setRecords(r.data)).catch(e => toast.error(e.message))

  useEffect(() => {
    load()
    enrollmentsApi.list().then(r => setEnrollments(r.data)).catch(() => {})
    coursesApi.list().then(r => setCourses(r.data)).catch(() => {})
  }, []) // eslint-disable-line

  const isTeacher = user?.role === 'TEACHER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const teacherCourses = courses.length > 0
    ? courses
    : Array.from(new Map(enrollments.map(e => [e.course.id, e.course])).values())

  // Base UI Select tugmada tanlangan QIYMATNI chizadi — qiymat kurs IDsi bo'lgani
  // uchun u yerda xom UUID ko'rinardi. `items` qiymatdan yorliqqa moslikni beradi.
  const courseItems = useMemo(
    () => Object.fromEntries(teacherCourses.map(c => [c.id, c.title])),
    [teacherCourses],
  )

  // ── Filtered records ────────────────────────────────────────────────────────
  // Kurs IDsi bo'yicha. Ilgari bu yerda kurs NOMI solishtirilardi: bir xil nomli
  // ikki kurs aralashib ketardi, kurs topilmasa esa filtr jimgina bekor bo'lib
  // hamma yozuv ko'rsatilardi — ya'ni tanlov ishlamayotgandek tuyulardi.
  const filtered = selectedCourse === 'ALL'
    ? records
    : records.filter(r => r.enrollment.course.id === selectedCourse)

  const heatmapDays = useHeatmapDays(filtered)

  return (
    <div className="space-y-5" style={{ paddingBottom: '80px' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--s-text)' }}>{t('attendance.title')}</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--s-muted)' }}>{records.length} ta yozuv</p>
        </div>

        {isTeacher && (
          <MarkAttendanceDialog
            open={markOpen} onOpenChange={setMarkOpen}
            courses={teacherCourses} enrollments={enrollments} records={records}
            onSaved={load}
          />
        )}
      </div>

      {/* Course selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedCourse} onValueChange={v => setSelectedCourse(v ?? 'ALL')} items={{ ALL: t('attendance.allCourses'), ...courseItems }}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('attendance.allCourses')}</SelectItem>
            {teacherCourses.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs" style={{ color: 'var(--s-muted)' }}>
          {heatmapDays.filter(d => d.total > 0).length} ta faol kun (so'nggi 30 kun)
        </span>
      </div>

      <AttendanceHeatmap days={heatmapDays} />

      <TodayAttendanceList records={filtered} />

      {isTeacher && <QrDialog courses={teacherCourses} />}
    </div>
  )
}
