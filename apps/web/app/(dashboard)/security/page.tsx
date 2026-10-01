'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  securityApi,
  type SecurityAlert, type AlertStats, type ActiveSession,
  type AlertSeverity,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useRealtimeEvent, type SecurityAlertEvent } from '@/lib/realtime'
import { RoleGuard } from '@/components/RoleGuard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { Shield, AlertTriangle, Users, Ban, RefreshCw, CheckCircle, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, type TKey } from '@/store/locale'

/** `t()` to'liq kalit ro'yxatida bo'lmagan dinamik tur/qatlam nomlari uchun —
 *  kalit topilmasa xom qiymatni qaytaradi (t() o'zi shunday fallback qiladi). */
function dynLabel(t: (key: TKey) => string, prefix: 'security.type.' | 'security.layer.', value: string): string {
  const key = `${prefix}${value}` as TKey
  const label = t(key)
  return label === key ? value : label
}

// ─── Severity helpers ─────────────────────────────────────────────────────────
const SEV_COLORS: Record<AlertSeverity, string> = {
  LOW:      'bg-blue-100 text-blue-800',
  MEDIUM:   'bg-yellow-100 text-yellow-800',
  HIGH:     'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
}

const ALERT_TYPES = [
  'BRUTE_FORCE', 'MULTI_DEVICE', 'UNUSUAL_HOUR', 'BULK_DELETE', 'RATE_LIMIT',
  'UNAUTHORIZED_OBJECT_ACCESS', 'PRIVILEGE_ESCALATION', 'BEHAVIOR_ANOMALY', 'MASS_DATA_ACCESS',
] as const

const ALERT_LAYERS = ['AUTHORIZATION', 'BEHAVIOR', 'CORRELATED'] as const

/**
 * Ishonch bali. Raqam yolg'iz o'zi taqqoslash uchun sekin o'qiladi,
 * shuning uchun yoniga nisbatni ko'rsatadigan ingichka chiziq qo'yilgan.
 */
function ScoreCell({ score }: { score?: number | string | null }) {
  if (score === null || score === undefined) return <span className="text-muted-foreground text-xs">—</span>
  const n = Math.max(0, Math.min(1, Number(score)))
  if (Number.isNaN(n)) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <div className="flex items-center gap-2 min-w-[72px]">
      <span className="text-xs tabular-nums w-8">{n.toFixed(2)}</span>
      <span className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
        <span
          className={`block h-full rounded-full ${n >= 0.8 ? 'bg-red-500' : n >= 0.6 ? 'bg-amber-500' : 'bg-muted-foreground/40'}`}
          style={{ width: `${n * 100}%` }}
        />
      </span>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SEV_COLORS[severity]}`}>
      {severity}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SecurityPage() {
  const { user } = useAuth()
  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <SecurityDashboard isSuperAdmin={user?.role === 'SUPER_ADMIN'} />
    </RoleGuard>
  )
}

function SecurityDashboard({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { t } = useLocale()
  const [stats, setStats]       = useState<AlertStats | null>(null)
  const [alerts, setAlerts]     = useState<SecurityAlert[]>([])
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [sevFilter, setSevFilter]   = useState('ALL')
  const [showResolved, setShowResolved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessLoading, setSessLoading] = useState(false)
  const [page, setPage]   = useState(1)
  const [total, setTotal] = useState(0)
  const ALERTS_PAGE_SIZE = 50
  const totalPages = Math.max(1, Math.ceil(total / ALERTS_PAGE_SIZE))

  const loadStats = useCallback(async () => {
    try {
      const r = await securityApi.alertStats()
      setStats(r.data)
    } catch { /* offline */ }
  }, [])

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ limit: String(ALERTS_PAGE_SIZE), page: String(page) })
      if (typeFilter !== 'ALL')  q.set('type', typeFilter)
      if (sevFilter !== 'ALL')   q.set('severity', sevFilter)
      if (showResolved)          q.set('resolved', 'true')
      else                       q.set('resolved', 'false')
      const r = await securityApi.alerts(q.toString())
      setAlerts(r.data)
      setTotal(r.meta?.total ?? r.data.length)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [typeFilter, sevFilter, showResolved, page])

  const loadSessions = useCallback(async () => {
    setSessLoading(true)
    try {
      const r = await securityApi.activeSessions('limit=20')
      setSessions(r.data)
    } catch { setSessions([]) }
    finally { setSessLoading(false) }
  }, [])

  // Ilgari bitta useEffect loadStats/loadAlerts/loadSessions uchinchisini
  // ham ulardi — filtr almashsa (loadAlerts identitetiga ta'sir qiladi)
  // KPI va sessiyalar ham keraksiz qayta so'ralardi. Endi alohida.
  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadSessions() }, [loadSessions])
  useEffect(() => { loadAlerts() }, [loadAlerts])
  useEffect(() => { setPage(1) }, [typeFilter, sevFilter, showResolved])

  // Jonli ogohlantirish. Ro'yxatga qo'lda qo'shmaymiz, balki qayta yuklaymiz:
  // amaldagi filtr (tur, daraja, hal qilinganlari) serverda qo'llanadi, mijoz
  // tomonda takrorlansa ikkita manba bir-biridan ajrab ketardi.
  useRealtimeEvent<SecurityAlertEvent>('security:alert', (e) => {
    toast.warning(
      `${dynLabel(t, 'security.type.', e.type)} — ${e.severity}`,
      { description: e.layer ? `${t('security.layerLabel')}: ${dynLabel(t, 'security.layer.', e.layer)}` : undefined },
    )
    loadStats()
    loadAlerts()
  })

  const resolveAlert = async (id: string) => {
    try {
      await securityApi.resolveAlert(id)
      toast.success(t('security.alertResolved'))
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a))
      loadStats()
    } catch (e: any) { toast.error(e.message) }
  }

  const forceRevoke = async (sessionId: string) => {
    if (!isSuperAdmin) return
    try {
      await securityApi.forceRevoke(sessionId)
      toast.success(t('security.sessionRevoked'))
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      loadStats()
    } catch (e: any) { toast.error(e.message) }
  }

  // KPI cards
  const kpiItems = stats ? [
    { label: t('security.todayAlerts'),    value: stats.todayTotal, icon: Shield,        color: 'text-blue-600' },
    { label: t('security.unresolved'),     value: stats.unresolved, icon: AlertTriangle, color: 'text-red-600' },
    { label: t('security.blockedIPs'),     value: stats.blockedIps, icon: Ban,           color: 'text-orange-600' },
    { label: t('security.activeSessions'), value: sessions.length,  icon: Users,         color: 'text-green-600' },
  ] : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield className="size-6" /> {t('security.title')}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadStats(); loadAlerts(); loadSessions() }} disabled={loading}>
            <RefreshCw className={`size-[18px] mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {t('attendance.refresh')}
          </Button>
          <Link href="/security/audit">
            <Button variant="outline" size="sm">
              <ExternalLink className="size-[18px] mr-1.5" />
              {t('security.auditLog')}
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div data-testid="alert-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiItems.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-muted-foreground font-normal">{label}</CardTitle>
                  <Icon className={`size-[18px] ${color}`} />
                </div>
              </CardHeader>
              <CardContent><p className="text-3xl font-bold">{value}</p></CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Alert Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v ?? 'ALL')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('security.allTypes')}</SelectItem>
            {ALERT_TYPES.map(v => <SelectItem key={v} value={v}>{dynLabel(t, 'security.type.', v)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sevFilter} onValueChange={v => setSevFilter(v ?? 'ALL')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('security.allSeverities')}</SelectItem>
            {(['LOW','MEDIUM','HIGH','CRITICAL'] as AlertSeverity[]).map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showResolved ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowResolved(v => !v)}
        >
          {showResolved ? t('security.resolvedOnes') : t('security.unresolvedOnes')}
        </Button>
      </div>

      {/* Security Alerts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="size-[18px] text-destructive" />
            {t('security.alerts')} ({total})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.time')}</TableHead>
                <TableHead>{t('table.type')}</TableHead>
                <TableHead>{t('table.severity')}</TableHead>
                <TableHead>{t('table.layer')}</TableHead>
                <TableHead>{t('table.score')}</TableHead>
                <TableHead>{t('table.user')}</TableHead>
                <TableHead>{t('table.ip')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map(alert => (
                <TableRow key={alert.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(alert.createdAt).toLocaleString('uz-UZ')}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{dynLabel(t, 'security.type.', alert.type)}</TableCell>
                  <TableCell><SeverityBadge severity={alert.severity} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {alert.layer ? dynLabel(t, 'security.layer.', alert.layer) : '—'}
                  </TableCell>
                  <TableCell><ScoreCell score={alert.score} /></TableCell>
                  <TableCell className="text-sm">
                    {alert.user ? `${alert.user.firstName} ${alert.user.lastName}` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{alert.ipAddress ?? '—'}</TableCell>
                  <TableCell>
                    {alert.resolved
                      ? <Badge variant="secondary" className="text-green-700">{t('security.resolvedBadge')}</Badge>
                      : <Badge variant="destructive">{t('security.activeBadge')}</Badge>
                    }
                  </TableCell>
                  <TableCell>
                    {!alert.resolved && (
                      <Button variant="ghost" size="sm" onClick={() => resolveAlert(alert.id)}>
                        <CheckCircle className="size-[18px]" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {alerts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {loading ? t('common.loading') : t('security.noAlerts')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                {total} tadan {(page - 1) * ALERTS_PAGE_SIZE + 1}–{Math.min(page * ALERTS_PAGE_SIZE, total)}
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
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-[18px]" />
              {t('security.activeSessions')} ({sessions.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={loadSessions} disabled={sessLoading}>
              <RefreshCw className={`size-[18px] ${sessLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.user')}</TableHead>
                <TableHead>{t('table.role')}</TableHead>
                <TableHead>{t('table.ip')}</TableHead>
                <TableHead>{t('table.device')}</TableHead>
                <TableHead>{t('table.created')}</TableHead>
                {isSuperAdmin && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map(s => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{s.user.firstName} {s.user.lastName}</div>
                    <div className="text-xs text-muted-foreground">{s.user.email}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{s.user.role}</Badge></TableCell>
                  <TableCell className="text-xs font-mono">{s.ipAddress ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                    {s.userAgent?.split(' ')[0] ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString('uz-UZ')}
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => forceRevoke(s.id)}>
                        <Ban className="size-[18px]" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 6 : 5} className="text-center text-muted-foreground py-6">
                    {t('security.noActiveSessions')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
