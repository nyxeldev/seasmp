'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { assessmentsApi, enrollmentsApi, type Assessment, type Enrollment, type Grade } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useCourse } from '@/lib/use-course'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ArrowLeft, Save, ClipboardList } from 'lucide-react'

interface CellKey { enrollmentId: string; assessmentId: string }
type GradeMap = Record<string, Record<string, Grade>>

export default function CourseGradesPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [gradeMap, setGradeMap]       = useState<GradeMap>({})
  const [edits, setEdits]             = useState<Record<string, string>>({})
  const [saving, setSaving]           = useState<Record<string, boolean>>({})
  const [loading, setLoading]         = useState(true)

  // Manzildagi qism slug bo'lishi mumkin — quyidagi so'rovlar esa UUID kutadi
  const { courseId } = useCourse(id)

  const load = useCallback(async () => {
    if (!courseId) return
    setLoading(true)
    const [assRes, enrollRes, gradesRes] = await Promise.all([
      assessmentsApi.byCourse(courseId).catch(() => ({ data: [] as Assessment[] })),
      enrollmentsApi.list(`courseId=${courseId}&limit=200`).catch(() => ({ data: [] as Enrollment[] })),
      // Ilgari bu yerda HAR BIR baholash uchun alohida so'rov yuborilardi
      // (N+1) — endi bitta so'rov butun kurs uchun barcha baholarni oladi.
      assessmentsApi.gradesByCourse(courseId).catch(() => ({ data: [] as Grade[] })),
    ])
    setAssessments(assRes.data)
    setEnrollments(enrollRes.data)

    const map: GradeMap = {}
    for (const g of gradesRes.data) {
      if (!map[g.enrollmentId]) map[g.enrollmentId] = {}
      map[g.enrollmentId][g.assessmentId] = g
    }
    setGradeMap(map)
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const cellKey = ({ enrollmentId, assessmentId }: CellKey) => `${enrollmentId}:${assessmentId}`

  const editValue = (enrollmentId: string, assessmentId: string) => {
    const k = cellKey({ enrollmentId, assessmentId })
    if (edits[k] !== undefined) return edits[k]
    return gradeMap[enrollmentId]?.[assessmentId]?.score?.toString() ?? ''
  }

  const setEdit = (enrollmentId: string, assessmentId: string, val: string) => {
    setEdits(prev => ({ ...prev, [cellKey({ enrollmentId, assessmentId })]: val }))
  }

  const saveGrade = async (enrollmentId: string, assessment: Assessment) => {
    const k = cellKey({ enrollmentId, assessmentId: assessment.id })
    const scoreStr = edits[k]
    if (scoreStr === undefined || scoreStr === '') return

    const score = Number(scoreStr)
    if (isNaN(score) || score < 0 || score > Number(assessment.maxScore)) {
      toast.error(`Ball 0 dan ${assessment.maxScore} gacha bo'lishi kerak`)
      return
    }

    setSaving(prev => ({ ...prev, [k]: true }))
    try {
      const res = await assessmentsApi.submitGrade(assessment.id, { enrollmentId, score })
      toast.success('Baho saqlandi')
      setEdits(prev => { const n = { ...prev }; delete n[k]; return n })
      // Butun sahifani qayta yuklash o'rniga faqat shu katakni yangilaymiz —
      // ilgari bitta baho saqlansa ham butun jadval (va N+1 so'rovlar
      // to'plami) qayta ishga tushardi.
      setGradeMap(prev => ({
        ...prev,
        [enrollmentId]: { ...prev[enrollmentId], [assessment.id]: res.data },
      }))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(prev => ({ ...prev, [k]: false }))
    }
  }

  const isTeacher = user?.role === 'TEACHER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  // Compute weighted average for an enrollment
  const weightedAvg = (enrollmentId: string): string => {
    let totalWeight = 0, weightedSum = 0
    for (const a of assessments) {
      const g = gradeMap[enrollmentId]?.[a.id]
      if (g) {
        const w = Number(a.weight)
        weightedSum += (Number(g.score) / Number(a.maxScore)) * w * 100
        totalWeight += w
      }
    }
    return totalWeight > 0 ? `${(weightedSum / totalWeight).toFixed(1)}%` : '—'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href={`/courses/${id}`} />}>
          <ArrowLeft className="size-[18px]" />
        </Button>
        <h1 className="text-2xl font-semibold">Baholar</h1>
      </div>

      {/* Legend */}
      {isTeacher && (
        <div className="flex gap-4 text-sm text-muted-foreground flex-wrap">
          <span>• Katakni bosib tahrirlang (o'qituvchi/admin)</span>
          <span>• Saqlash uchun Enter yoki <Save className="inline size-3.5" /> bosing</span>
          <span>• Oxirgi ustun = vaznli o'rtacha</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : assessments.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-2 text-center text-muted-foreground">
            <ClipboardList className="size-7 opacity-50" />
            <p>Hali baholash yo'q.</p>
            <Link href={`/courses/${id}`} className="underline text-sm">Kurs sahifasida yarating</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background min-w-[160px]">Talaba</TableHead>
                {assessments.map(a => (
                  <TableHead key={a.id} className="min-w-[120px] text-center">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-xs truncate max-w-[110px]">{a.title}</span>
                      <div className="flex justify-center gap-1">
                        <Badge variant="secondary" className="text-[10px] px-1 h-4">{a.type}</Badge>
                        <span className="text-[10px] text-muted-foreground">/{a.maxScore}</span>
                      </div>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="min-w-[100px] text-center font-semibold">O'rtacha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="sticky left-0 bg-background font-medium">
                    <Link href={`/students/${e.student.id}`} className="hover:underline">
                      {e.student.firstName} {e.student.lastName}
                    </Link>
                  </TableCell>
                  {assessments.map(a => {
                    const k   = cellKey({ enrollmentId: e.id, assessmentId: a.id })
                    const val = editValue(e.id, a.id)
                    const existing = gradeMap[e.id]?.[a.id]
                    const dirty = edits[k] !== undefined

                    return (
                      <TableCell key={a.id} className="p-1 text-center">
                        {isTeacher ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={Number(a.maxScore)}
                              value={val}
                              onChange={ev => setEdit(e.id, a.id, ev.target.value)}
                              onKeyDown={ev => { if (ev.key === 'Enter') saveGrade(e.id, a) }}
                              className={`w-16 h-7 text-center text-sm p-1 ${dirty ? 'border-orange-400' : ''}`}
                              placeholder="—"
                            />
                            {dirty && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => saveGrade(e.id, a)}
                                disabled={saving[k]}
                              >
                                <Save className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className={existing ? 'font-medium' : 'text-muted-foreground'}>
                            {existing ? existing.score : '—'}
                          </span>
                        )}
                      </TableCell>
                    )
                  })}
                  <TableCell className="text-center font-semibold text-sm">{weightedAvg(e.id)}</TableCell>
                </TableRow>
              ))}
              {enrollments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={assessments.length + 2} className="text-center text-muted-foreground py-8">
                    Bu kursda talaba yo'q
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
