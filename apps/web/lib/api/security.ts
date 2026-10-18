import { api, type PaginationMeta } from './client'

export interface AuditLog {
  id: string
  action: string
  resource: string
  resourceId?: string
  oldData?: Record<string, unknown> | null
  newData?: Record<string, unknown> | null
  ipAddress?: string
  userAgent?: string
  statusCode?: number | null
  createdAt: string
  user?: { id: string; firstName: string; lastName: string; email: string; role: string }

  // Aniqlash qatlami maydonlari
  accessRelation?: 'SELF' | 'OWNER' | 'CUSTODIAN' | 'PRIVILEGED' | 'FOREIGN' | 'UNKNOWN' | null
  resourceOwnerId?: string | null
  httpMethod?: string | null
  path?: string | null
  durationMs?: number | null
}

export interface Session {
  id: string
  createdAt: string
  expiresAt: string
  ipAddress?: string
  userAgent?: string
  isRevoked: boolean
}

export interface ActiveSession {
  id: string
  createdAt: string
  expiresAt: string
  ipAddress?: string
  userAgent?: string
  user: { id: string; firstName: string; lastName: string; email: string; role: string }
}

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type AlertType     = 'BRUTE_FORCE' | 'MULTI_DEVICE' | 'UNUSUAL_HOUR' | 'BULK_DELETE' | 'RATE_LIMIT'
  | 'UNAUTHORIZED_OBJECT_ACCESS' | 'PRIVILEGE_ESCALATION' | 'BEHAVIOR_ANOMALY' | 'MASS_DATA_ACCESS'

export interface SecurityAlert {
  id: string
  type: AlertType
  severity: AlertSeverity
  userId?: string | null
  ipAddress?: string | null
  details: Record<string, unknown>
  resolved: boolean
  resolvedBy?: string | null
  resolvedAt?: string | null
  createdAt: string
  user?: { id: string; firstName: string; lastName: string; email: string } | null

  // Qaysi qatlam aniqladi va qanday ishonch bilan
  layer?: 'AUTHORIZATION' | 'BEHAVIOR' | 'CORRELATED' | null
  score?: number | string | null
  detectorVersion?: string | null
}

export interface AlertStats {
  todayTotal: number
  unresolved: number
  blockedIps: number
}

export const securityApi = {
  // Audit logs
  auditLogs:  (q?: string) => api.get<{ success: boolean; data: AuditLog[]; meta: PaginationMeta }>(`/v1/security/audit-logs${q ? `?${q}` : ''}`),
  auditLog:   (id: string) => api.get<{ success: boolean; data: AuditLog }>(`/v1/security/audit-logs/${id}`),
  // Alerts
  alerts:       (q?: string) => api.get<{ success: boolean; data: SecurityAlert[]; meta: PaginationMeta }>(`/v1/security/alerts${q ? `?${q}` : ''}`),
  alertStats:   () => api.get<{ success: boolean; data: AlertStats }>('/v1/security/alerts/stats'),
  resolveAlert: (id: string) => api.patch<{ success: boolean; data: SecurityAlert }>(`/v1/security/alerts/${id}/resolve`),
  // Sessions
  sessions:        () => api.get<{ success: boolean; data: Session[] }>('/v1/security/sessions'),
  revokeSession:   (id: string) => api.delete(`/v1/security/sessions/${id}`),
  activeSessions:  (q?: string) => api.get<{ success: boolean; data: ActiveSession[]; meta: PaginationMeta }>(`/v1/security/active-sessions${q ? `?${q}` : ''}`),
  forceRevoke:     (id: string) => api.delete(`/v1/security/active-sessions/${id}`),
  cleanup:         () => api.post('/v1/security/cleanup'),
  // Auth 2FA
  setup2fa:        () => api.get<{ success: boolean; data: { qrCodeUrl: string; secret: string; backupCodes: string[] } }>('/v1/auth/2fa/setup'),
  confirm2fa:      (code: string) => api.post<{ success: boolean; data: { message: string; backupCodes: string[] } }>('/v1/auth/2fa/confirm', { code }),
  disable2fa:      (body: { userId?: string; password?: string }) => api.post('/v1/auth/2fa/disable', body),
}
