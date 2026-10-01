'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { attendanceApi, type Attendance, type Enrollment } from '@/lib/api'
import { useLocale } from '@/store/locale'
import { useStatusMeta } from './attendance-shared'

/**
 * Guruh davomati varaqasi: kurs + sana tanlanadi, so'ng har bir talabaga
 * holat qo'yiladi va bir martada saqlanadi.
 */
export function MarkAttendanceDialog({
  open, onOpenChange, courses, enrollments, records, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Faqat id/title kerak — talaba o'ziga yozilgan kursning to'liq shaklini
   *  bilmasligi mumkin (bunday holda enrollment'dan kelgan qisqa shakl ishlatiladi). */
  courses: { id: string; title: string }[]
  enrollments: Enrollment[]
  records: Attendance[]
  onSaved: () => void
}) {
  const { t } = useLocale()
  const STATUS_META = useStatusMeta()

  const [sheetCourse, setSheetCourse] = useState('')
  const [sheetDate, setSheetDate]     = useState(new Date().toISOString().slice(0, 10))
  const [sheet, setSheet]             = useState<Record<string, string>>({})
  const [sheetSaving, setSheetSaving] = useState(false)

  const courseItems = useMemo(
    () => Object.fromEntries(courses.map(c => [c.id, c.title])),
    [courses],
  )

  const sheetRoster = useMemo(
    () => enrollments.filter(e => e.course.id === sheetCourse && e.status === 'ACTIVE'),
    [enrollments, sheetCourse],
  )

  // O'sha kun uchun allaqachon belgilangan holatlar — varaqa ular bilan to'ladi,
  // shunda o'qituvchi xatosini ko'radi va tuzata oladi
  const savedForDate = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of records) {
      if (r.enrollment.course.id !== sheetCourse) continue
      if (new Date(r.lessonDate).toISOString().slice(0, 10) !== sheetDate) continue
      map[r.enrollment.id] = r.status
    }
    return map
  }, [records, sheetCourse, sheetDate])

  useEffect(() => { setSheet(savedForDate) }, [savedForDate])

  const setAll = (status: string) =>
    setSheet(Object.fromEntries(sheetRoster.map(e => [e.id, status])))

  const saveSheet = async () => {
    const entries = sheetRoster
      .map(e => ({ enrollmentId: e.id, status: sheet[e.id] }))
      .filter((r): r is { enrollmentId: string; status: string } => Boolean(r.status))

    if (entries.length === 0) { toast.error(t('attendance.nothingToSave')); return }

    setSheetSaving(true)
    try {
      const res = await attendanceApi.markBulk({
        courseId: sheetCourse, lessonDate: sheetDate, records: entries,
      })
      toast.success(`${res.data.saved} ta yozuv saqlandi`)
      onOpenChange(false)
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Xato')
    } finally {
      setSheetSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors shrink-0"
          style={{ borderColor: 'var(--s-border)', color: 'var(--s-muted)', background: 'transparent' }}
        />
      }>
        <Plus className="size-[18px]" /> {t('attendance.mark')}
      </DialogTrigger>
      {/* Guruh varaqasi: kurs → sana → butun ro'yxat bir ekranda.
          Ilgari bu yerda barcha kurslarning hamma talabasi bitta ochiluvchi
          ro'yxatda edi va har biri alohida saqlanardi. */}
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('attendance.markTitle')}</DialogTitle></DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t('attendance.course')}</Label>
              <Select value={sheetCourse} onValueChange={v => setSheetCourse(v ?? '')} items={courseItems}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t('attendance.selectCourse')} /></SelectTrigger>
                <SelectContent>
                  {courses.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('attendance.lessonDate')}</Label>
              <Input type="date" value={sheetDate} onChange={e => setSheetDate(e.target.value)} />
            </div>
          </div>

          {!sheetCourse ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--s-muted)' }}>
              {t('attendance.pickCourseFirst')}
            </p>
          ) : sheetRoster.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--s-muted)' }}>
              {t('attendance.noStudents')}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs" style={{ color: 'var(--s-muted)' }}>{t('attendance.markAll')}:</span>
                {(['PRESENT', 'ABSENT', 'LATE'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setAll(s)}
                    className="text-xs px-2 py-1 rounded-md border transition-colors"
                    style={{ borderColor: STATUS_META[s].color, color: STATUS_META[s].color }}>
                    {STATUS_META[s].label}
                  </button>
                ))}
                <span className="ml-auto text-xs" style={{ color: 'var(--s-muted)' }}>
                  {Object.keys(sheet).length} / {sheetRoster.length}
                </span>
              </div>

              <div className="max-h-[45vh] overflow-y-auto rounded-lg border divide-y"
                style={{ borderColor: 'var(--s-border)' }}>
                {sheetRoster.map(e => (
                  <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2"
                    style={{ borderColor: 'var(--s-border)' }}>
                    <span className="text-sm truncate" style={{ color: 'var(--s-text)' }}>
                      {e.student.firstName} {e.student.lastName}
                    </span>
                    <div className="flex gap-1 shrink-0">
                      {(['PRESENT', 'ABSENT', 'LATE'] as const).map(s => {
                        const active = sheet[e.id] === s
                        const meta = STATUS_META[s]
                        return (
                          <button key={s} type="button"
                            onClick={() => setSheet(prev => ({ ...prev, [e.id]: s }))}
                            aria-pressed={active}
                            title={meta.label}
                            className="size-7 rounded-md border flex items-center justify-center transition-all"
                            style={{
                              borderColor: active ? meta.color : 'var(--s-border)',
                              background:  active ? meta.bg : 'transparent',
                              color:       active ? meta.color : 'var(--s-muted)',
                            }}>
                            <meta.Icon className="size-4" />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <DialogFooter showCloseButton>
            <Button onClick={saveSheet} disabled={sheetSaving || !sheetCourse || sheetRoster.length === 0}>
              {sheetSaving ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
