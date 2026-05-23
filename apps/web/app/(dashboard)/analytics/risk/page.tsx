'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { analyticsApi, coursesApi, type PyRiskStudent, type Course } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { toast } from 'sonner'
import { ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react'

function RiskBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 65 ? 'bg-destructive' : pct >= 40 ? 'bg-amber-400' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-9 text-right">{pct}%</span>
    </div>
  )
}

export default function RiskPage() {
  const { user } = useAuth()
  const [data, setData]         = useState<PyRiskStudent[]>([])
  const [total, setTotal]       = useState(0)
  const [courses, setCourses]   = useState<Course[]>([])
  const [courseId, setCourseId] = useState('')
  const [threshold, setThreshold] = useState('0.65')
  const [loading, setLoading]   = useState(false)
  const [pyOffline, setPyOffline] = useState(false)
  const [page, setPage]         = useState(0)
  const limit = 50

  const canView = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'TEACHER'

  const load = useCallback(() => {
    setLoading(true)
    setPyOffline(false)
    const qs = new URLSearchParams({
      threshold,
      limit: String(limit),
      offset: String(page * limit),
    })
    if (courseId) qs.set('course_id', courseId)
    analyticsApi.dropoutRisk(qs.toString())
      .then(r => { setData(r.data.data); setTotal(r.data.total) })
      .catch(() => { setPyOffline(true); setData([]) })
      .finally(() => setLoading(false))
  }, [threshold, courseId, page])

  useEffect(() => {
    if (!canView) return
    load()
    coursesApi.list('limit=100').then(r => setCourses(r.data)).catch(() => {})
  }, [load, canView])

  if (!canView) return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <ArrowLeft className="size-4" />
      <span>Access denied.</span>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/analytics" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <AlertTriangle className="size-6 text-destructive" />
          Dropout Risk
        </h1>
        {total > 0 && <Badge variant="destructive">{total}</Badge>}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Threshold:</span>
          <Input
            type="number" min="0" max="1" step="0.05"
            value={threshold}
            onChange={e => { setThreshold(e.target.value); setPage(0) }}
            className="w-20 h-8"
          />
        </div>
        <Select value={courseId} onValueChange={v => { setCourseId(v === 'all' ? '' : (v ?? '')); setPage(0) }}>
          <SelectTrigger className="w-48 h-8"><SelectValue placeholder="All courses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`size-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {pyOffline ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Analytics service offline — run <code className="font-mono">.\apps\analytics\start.ps1</code>
          </CardContent>
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(r => (
                <TableRow key={r.enrollmentId}>
                  <TableCell className="font-medium">
                    {r.student.firstName} {r.student.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.student.email}</TableCell>
                  <TableCell className="text-sm">{r.courseTitle}</TableCell>
                  <TableCell>
                    <span className={r.attendanceRate < 60 ? 'text-destructive font-medium' : ''}>
                      {r.attendanceRate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.student.lastLoginAt
                      ? new Date(r.student.lastLoginAt).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  <TableCell><RiskBar score={r.riskScore} /></TableCell>
                  <TableCell>
                    <Link href={`/students/${r.studentId}`}>
                      <Button variant="ghost" size="xs">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No students found above threshold {(Number(threshold) * 100).toFixed(0)}%
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
