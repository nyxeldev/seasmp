'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { securityApi, type AuditLog, type PaginationMeta } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { RoleGuard } from '@/components/RoleGuard'
import { useDebounced } from '@/lib/use-debounced'
import { Download, ChevronDown, ChevronRight, ArrowLeft, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useLocale, type TKey } from '@/store/locale'

/** `t()` to'liq kalit ro'yxatida bo'lmagan dinamik qiymatlar (munosabat turi
 *  va h.k.) uchun — kalit topilmasa xom qiymatni qaytaradi. */
function dynLabel(t: (key: TKey) => string, prefix: string, value: string): string {
  const key = `${prefix}${value}` as TKey
  const label = t(key)
  return label === key ? value : label
}

const ACTIONS = ['ALL','ACCESS','ACCESS_DENIED','LOGIN','LOGOUT','LOGIN_FAILED','CREATE','UPDATE','DELETE',
  'TWO_FA_SETUP','TWO_FA_DISABLE','BACKUP_CODE_USED','IP_BLOCKED',
  'PASSWORD_CHANGE','ROLE_CHANGE','ENROLL','UNENROLL','GRADE_SUBMIT','ATTENDANCE_MARK']

const RESOURCES = ['ALL','users','courses','enrollments','attendance','assessments','security','security_alerts']

/**
 * Munosabat — aktor va murojaat qilingan obyekt orasidagi bog'liqlik.
 *
 * Qatorlarning aksariyati normal bo'ladi. Agar har biriga rangli belgi qo'yilsa,
 * xavflilari ko'zga tashlanmay qoladi. Shuning uchun normal munosabatlar oddiy
 * kulrang matn, faqat ikkitasi ajralib turadi:
 *   Begona   — ruxsatsiz obyektga murojaat, asosiy tahdid signali
 *   Qoida yo'q — bu resurs turi egalik modelidan tashqarida qolgan
 */
const RELATION_CLS: Record<string, string> = {
  SELF:       'text-muted-foreground',
  OWNER:      'text-muted-foreground',
  CUSTODIAN:  'text-muted-foreground',
  PRIVILEGED: 'text-muted-foreground',
  FOREIGN:    'rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-red-400 font-medium',
  UNKNOWN:    'rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-400',
}

function RelationCell({ relation }: { relation?: string | null }) {
  const { t } = useLocale()
  if (!relation) return <span className="text-muted-foreground text-xs">—</span>
  const cls = RELATION_CLS[relation]
  if (!cls) return <span className="text-muted-foreground text-xs">{relation}</span>
  return <span className={`inline-flex items-center text-xs whitespace-nowrap ${cls}`}>{dynLabel(t, 'audit.relation.', relation)}</span>
}

/** Begona obyektga murojaat MUVAFFAQIYATLI bo'lgan qator — eng jiddiy holat */
function isUnprotected(log: AuditLog) {
  return log.accessRelation === 'FOREIGN' && (log.statusCode ?? 0) < 400
}

function actionVariant(action: string) {
  if (['LOGIN_FAILED','IP_BLOCKED'].includes(action)) return 'destructive'
  if (['LOGIN','TWO_FA_SETUP'].includes(action)) return 'default'
  if (['DELETE','TWO_FA_DISABLE'].includes(action)) return 'destructive'
  return 'secondary'
}

function JsonDiff({ label, data }: { label: string; data: Record<string, unknown> | null | undefined }) {
  if (!data) return null
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-40">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

export default function AuditPage() {
  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <AuditPageInner />
    </RoleGuard>
  )
}

function AuditPageInner() {
  const { user } = useAuth()
  const { t } = useLocale()

  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return <p className="text-muted-foreground">{t('audit.accessDenied')}</p>
  }

  return <AuditLogView />
}

function AuditLogView() {
  const { t } = useLocale()
  const [logs, setLogs]         = useState<AuditLog[]>([])
  const [meta, setMeta]         = useState<PaginationMeta | null>(null)
  const [loading, setLoading]   = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Filters
  const [action,   setAction]   = useState('ALL')
  const [resource, setResource] = useState('ALL')
  const [from,     setFrom]     = useState('')
  const [to,       setTo]       = useState('')
  const [searchInput, setSearchInput] = useState('')  // userId or name search
  const search = useDebounced(searchInput, 350)
  const [page,     setPage]     = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: String(page), limit: '50' })
      if (action !== 'ALL')    q.set('action', action)
      if (resource !== 'ALL')  q.set('resource', resource)
      if (from)                q.set('from', from)
      if (to)                  q.set('to', to)
      if (search)              q.set('userId', search)
      const r = await securityApi.auditLogs(q.toString())
      setLogs(r.data)
      setMeta(r.meta)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [action, resource, from, to, search, page])

  useEffect(() => { setPage(1) }, [search])
  useEffect(() => { load() }, [load])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const [exporting, setExporting] = useState(false)

  /**
   * Ilgari bu funksiya faqat `logs` (joriy sahifaning 50 qatori) dan CSV
   * yasardi — filtrlangan natija 50 dan ko'p bo'lsa, eksport JIM ravishda
   * to'liqsiz chiqardi. Xavfsizlik jurnali uchun bu ishonchni yo'qotadi:
   * admin "shu oraliqni eksport qildim" deb o'ylaydi, aslida faqat bitta
   * sahifani olgan bo'ladi. Endi joriy filtrlar bo'yicha BARCHA sahifalar
   * (100 tadan, backend chegarasi) ketma-ket o'qiladi.
   */
  const exportCsv = async () => {
    setExporting(true)
    try {
      const all: AuditLog[] = []
      let p = 1
      const MAX_PAGES = 100 // 100 * 100 = 10,000 qatorgacha xavfsiz chegara
      while (p <= MAX_PAGES) {
        const q = new URLSearchParams({ page: String(p), limit: '100' })
        if (action !== 'ALL')    q.set('action', action)
        if (resource !== 'ALL')  q.set('resource', resource)
        if (from)                q.set('from', from)
        if (to)                  q.set('to', to)
        if (search)              q.set('userId', search)
        const r = await securityApi.auditLogs(q.toString())
        all.push(...r.data)
        if (p >= r.meta.totalPages) break
        p++
      }

      const header = ['id','createdAt','action','resource','resourceId','user','ip','userAgent','status']
      const rows = all.map(l => [
        l.id,
        l.createdAt,
        l.action,
        l.resource,
        l.resourceId ?? '',
        l.user ? `${l.user.firstName} ${l.user.lastName}` : '',
        l.ipAddress ?? '',
        (l.userAgent ?? '').replace(/,/g, ';'),
        l.statusCode ?? '',
      ])
      const csv = [header, ...rows].map(r => r.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `audit_${new Date().toISOString().slice(0,10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${all.length} ${t('audit.exportedSuffix')}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/security">
            <Button variant="ghost" size="sm"><ArrowLeft className="size-[18px] mr-1" />{t('audit.back')}</Button>
          </Link>
          <h1 className="text-2xl font-semibold">{t('security.auditLog')}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`size-[18px] mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>
            <Download className={`size-[18px] mr-1.5 ${exporting ? 'animate-pulse' : ''}`} />
            {exporting ? t('audit.exporting') : 'CSV'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={action} onValueChange={v => { setAction(v ?? 'ALL'); setPage(1) }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTIONS.map(a => <SelectItem key={a} value={a}>{a === 'ALL' ? t('audit.allActions') : a}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={resource} onValueChange={v => { setResource(v ?? 'ALL'); setPage(1) }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RESOURCES.map(r => <SelectItem key={r} value={r}>{r === 'ALL' ? t('audit.allResources') : r}</SelectItem>)}
          </SelectContent>
        </Select>

        <input
          type="date"
          className="border rounded px-2 py-1 text-sm h-9"
          value={from}
          onChange={e => { setFrom(e.target.value); setPage(1) }}
          placeholder={t('audit.from')}
        />
        <input
          type="date"
          className="border rounded px-2 py-1 text-sm h-9"
          value={to}
          onChange={e => { setTo(e.target.value); setPage(1) }}
          placeholder={t('audit.to')}
        />
        <input
          className="border rounded px-2 py-1 text-sm h-9 w-48"
          placeholder={t('audit.searchUserId')}
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6"></TableHead>
                <TableHead>{t('table.time')}</TableHead>
                <TableHead>{t('table.user')}</TableHead>
                <TableHead>{t('audit.action')}</TableHead>
                <TableHead>{t('audit.resource')}</TableHead>
                <TableHead>{t('audit.relationLabel')}</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>{t('table.ip')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(log => {
                const isExpanded = expanded.has(log.id)
                const hasDetail  = log.oldData || log.newData
                return (
                  // Kalit fragmentda turishi kerak — ro'yxat elementi aynan u.
                  // Ichki TableRow'dagi key React'ga ko'rinmasdi.
                  <Fragment key={log.id}>
                    <TableRow
                      className={[
                        hasDetail ? 'cursor-pointer hover:bg-muted/40' : '',
                        isUnprotected(log) ? 'border-l-2 border-l-red-500 bg-red-500/[0.04]' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => hasDetail && toggleExpand(log.id)}
                    >
                      <TableCell>
                        {hasDetail && (
                          isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('uz-UZ')}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.user
                          ? <div>
                              <div className="font-medium">{log.user.firstName} {log.user.lastName}</div>
                              <div className="text-xs text-muted-foreground">{log.user.role}</div>
                            </div>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(log.action)}>{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {log.resource}
                        {log.httpMethod && log.path && (
                          <div className="text-[11px] font-mono text-muted-foreground/60 truncate max-w-[220px]">
                            {log.httpMethod} {log.path}
                          </div>
                        )}
                      </TableCell>
                      <TableCell><RelationCell relation={log.accessRelation} /></TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground max-w-[80px] truncate">
                        {log.resourceId ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{log.ipAddress ?? '—'}</TableCell>
                      <TableCell>
                        {log.statusCode
                          ? <Badge variant={log.statusCode >= 400 ? 'destructive' : 'secondary'}>{log.statusCode}</Badge>
                          : null
                        }
                      </TableCell>
                    </TableRow>
                    {isExpanded && hasDetail && (
                      <TableRow>
                        <TableCell colSpan={10} className="bg-muted/30 px-6 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <JsonDiff label={t('audit.prevState')} data={log.oldData} />
                            <JsonDiff label={t('audit.newState')}  data={log.newData} />
                          </div>
                          {log.userAgent && (
                            <p className="text-xs text-muted-foreground mt-2">
                              <span className="font-medium">User-Agent: </span>{log.userAgent}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    {loading ? t('common.loading') : t('audit.noLogs')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t('audit.totalLabel')} {meta.total} {t('audit.recordsLabel')} · {t('audit.pageLabel')} {meta.page}/{meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('audit.prev')}</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>{t('audit.next')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
