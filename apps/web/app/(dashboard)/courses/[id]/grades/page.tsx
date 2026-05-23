'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { assessmentsApi, enrollmentsApi, type Assessment, type Enrollment, type Grade } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { toast } from 'sonner'
import { ArrowLeft, Save } from 'lucide-react'

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

  const load = useCallback(async () => {
    const [assRes, enrollRes] = await Promise.all([
      assessmentsApi.byCourse(id).catch(() => ({ data: [] as Assessment[] })),
      enrollmentsApi.list(`courseId=${id}&limit=200`).catch(() => ({ data: [] as Enrollment[] })),
    ])
    setAssessments(assRes.data)
    setEnrollments(enrollRes.data)

    // Load grades for each assessment
    const map: GradeMap = {}
    await Promise.all(assRes.data.map(async a => {
      const gRes = await assessmentsApi.grades(a.id).catch(() => ({ data: [] as Grade[] }))
      gRes.data.forEach(g => {
        if (!map[g.enrollmentId]) map[g.enrollmentId] = {}
        map[g.enrollmentId][g.assessmentId] = g
      })
    }))
    setGradeMap(map)
  }, [id])

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
      toast.error(`Score must be 0–${assessment.maxScore}`)
      return
    }

    setSaving(prev => ({ ...prev, [k]: true }))
    try {
      await assessmentsApi.submitGrade(assessment.id, { enrollmentId, score })
      toast.success('Grade saved')
      setEdits(prev => { const n = { ...prev }; delete n[k]; return n })
      await load()
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
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold">Grades</h1>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>• Click a cell to edit (teacher/admin only)</span>
        <span>• Press Enter or click <Save className="inline size-3" /> to save</span>
        <span>• Last column = weighted average</span>
      </div>

      {assessments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No assessments yet. Create assessments on the <Link href={`/courses/${id}`} className="underline">course page</Link>.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background min-w-[160px]">Student</TableHead>
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
                <TableHead className="min-w-[100px] text-center font-semibold">Avg</TableHead>
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
                                <Save className="size-3" />
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
                    No students enrolled in this course
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
