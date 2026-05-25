'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  securityApi,
  type SecurityAlert, type AlertStats, type ActiveSession,
  type AlertSeverity,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { Shield, AlertTriangle, Users, Ban, RefreshCw, CheckCircle, ExternalLink } from 'lucide-react'
import { useLocale } from '@/store/locale'

// ─── Severity helpers ─────────────────────────────────────────────────────────
const SEV_COLORS: Record<AlertSeverity, string> = {
  LOW:      'bg-blue-100 text-blue-800',
  MEDIUM:   'bg-yellow-100 text-yellow-800',
  HIGH:     'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
}

const TYPE_LABELS: Record<string, string> = {
  BRUTE_FORCE:  'Brute Force',
  MULTI_DEVICE: 'Ko\'p qurilma',
  UNUSUAL_HOUR: 'G\'ayrioddiy vaqt',
  BULK_DELETE:  'Ommaviy o\'chirish',
  RATE_LIMIT:   'Rate Limit',
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

  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return <p className="text-muted-foreground">Kirish taqiqlangan.</p>
  }

  return <SecurityDashboard isSuperAdmin={user.role === 'SUPER_ADMIN'} />
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

  const loadStats = useCallback(async () => {
    try {
      const r = await securityApi.alertStats()
      setStats(r.data)
    } catch { /* offline */ }
  }, [])

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ limit: '50' })
      if (typeFilter !== 'ALL')  q.set('type', typeFilter)
      if (sevFilter !== 'ALL')   q.set('severity', sevFilter)
      if (showResolved)          q.set('resolved', 'true')
      else                       q.set('resolved', 'false')
      const r = await securityApi.alerts(q.toString())
      setAlerts(r.data)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [typeFilter, sevFilter, showResolved])

  const loadSessions = useCallback(async () => {
    setSessLoading(true)
    try {
      const r = await securityApi.activeSessions('limit=20')
      setSessions(r.data)
    } catch { setSessions([]) }
    finally { setSessLoading(false) }
  }, [])

  useEffect(() => {
    loadStats()
    loadAlerts()
    loadSessions()
  }, [loadStats, loadAlerts, loadSessions])

  const resolveAlert = async (id: string) => {
    try {
      await securityApi.resolveAlert(id)
      toast.success('Alert hal qilindi')
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a))
      loadStats()
    } catch (e: any) { toast.error(e.message) }
  }

  const forceRevoke = async (sessionId: string) => {
    if (!isSuperAdmin) return
    try {
      await securityApi.forceRevoke(sessionId)
      toast.success('Sessiya o\'chirildi')
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
            <RefreshCw className={`size-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {t('attendance.refresh')}
          </Button>
          <Link href="/security/audit">
            <Button variant="outline" size="sm">
              <ExternalLink className="size-4 mr-1.5" />
              Audit Log
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
                  <Icon className={`size-4 ${color}`} />
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
            <SelectItem value="ALL">Barcha turlar</SelectItem>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sevFilter} onValueChange={v => setSevFilter(v ?? 'ALL')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Barcha darajalar</SelectItem>
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
          {showResolved ? 'Hal qilinganlar' : 'Hal qilinmaganlar'}
        </Button>
      </div>

      {/* Security Alerts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            Xavfsizlik Alertlari ({alerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vaqt</TableHead>
                <TableHead>Tur</TableHead>
                <TableHead>Daraja</TableHead>
                <TableHead>Foydalanuvchi</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map(alert => (
                <TableRow key={alert.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(alert.createdAt).toLocaleString('uz-UZ')}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{TYPE_LABELS[alert.type] ?? alert.type}</TableCell>
                  <TableCell><SeverityBadge severity={alert.severity} /></TableCell>
                  <TableCell className="text-sm">
                    {alert.user ? `${alert.user.firstName} ${alert.user.lastName}` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{alert.ipAddress ?? '—'}</TableCell>
                  <TableCell>
                    {alert.resolved
                      ? <Badge variant="secondary" className="text-green-700">Hal qilindi</Badge>
                      : <Badge variant="destructive">Faol</Badge>
                    }
                  </TableCell>
                  <TableCell>
                    {!alert.resolved && (
                      <Button variant="ghost" size="sm" onClick={() => resolveAlert(alert.id)}>
                        <CheckCircle className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {alerts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {loading ? 'Yuklanmoqda...' : 'Alert topilmadi'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4" />
              Aktiv Sessionlar ({sessions.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={loadSessions} disabled={sessLoading}>
              <RefreshCw className={`size-4 ${sessLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Foydalanuvchi</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Qurilma</TableHead>
                <TableHead>Yaratildi</TableHead>
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
                        <Ban className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 6 : 5} className="text-center text-muted-foreground py-6">
                    Aktiv session yo'q
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
