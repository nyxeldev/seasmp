import type { FastifyInstance } from 'fastify'
import { securityService } from '../services/security.service'
import { checkBulkDelete } from '../services/securityMonitor'
import type { AuditAction, AlertType, AlertSeverity } from '@prisma/client'

export default async function securityRoutes(app: FastifyInstance) {

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  app.get('/audit-logs', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')],
  }, async (request, reply) => {
    const q = request.query as any
    const result = await securityService.listAuditLogs({
      userId:    q.userId,
      action:    q.action as AuditAction | undefined,
      resource:  q.resource,
      ipAddress: q.ipAddress,
      from:      q.from,
      to:        q.to,
      page:      Math.max(1, parseInt(q.page  ?? '1')),
      limit:     Math.min(100, parseInt(q.limit ?? '50')),
    })
    return reply.send({ success: true, ...result })
  })

  app.get('/audit-logs/:id', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const log = await securityService.getAuditLog(BigInt(id))
    return reply.send({ success: true, data: { ...log, id: log.id.toString() } })
  })

  // ─── Security Alerts ──────────────────────────────────────────────────────
  app.get('/alerts', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')],
  }, async (request, reply) => {
    const q = request.query as any
    const result = await securityService.listAlerts({
      type:     q.type as AlertType | undefined,
      severity: q.severity as AlertSeverity | undefined,
      resolved: q.resolved !== undefined ? q.resolved === 'true' : undefined,
      page:     Math.max(1, parseInt(q.page  ?? '1')),
      limit:    Math.min(100, parseInt(q.limit ?? '50')),
    })
    return reply.send({ success: true, ...result })
  })

  app.patch('/alerts/:id/resolve', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const alert = await securityService.resolveAlert(BigInt(id), request.user.sub)
    return reply.send({ success: true, data: { ...alert, id: alert.id.toString() } })
  })

  app.get('/alerts/stats', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')],
  }, async (_request, reply) => {
    const stats = await securityService.getAlertStats()
    return reply.send({ success: true, data: stats })
  })

  // ─── Sessions (own) ───────────────────────────────────────────────────────
  app.get('/sessions', { onRequest: [app.authenticate] }, async (request, reply) => {
    const sessions = await securityService.listSessions(request.user.sub)
    return reply.send({ success: true, data: sessions })
  })

  app.delete('/sessions/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await securityService.revokeSession(id, request.user.sub)
    return reply.send({ success: true, data: { message: "Sessiya bekor qilindi" } })
  })

  app.delete('/sessions', { onRequest: [app.authenticate] }, async (request, reply) => {
    const result = await securityService.revokeAllSessions(request.user.sub)
    return reply.send({ success: true, data: result })
  })

  // ─── Admin: all active sessions ────────────────────────────────────────────
  app.get('/active-sessions', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')],
  }, async (request, reply) => {
    const q = request.query as any
    const result = await securityService.listAllActiveSessions(
      Math.max(1, parseInt(q.page  ?? '1')),
      Math.min(100, parseInt(q.limit ?? '50'))
    )
    return reply.send({ success: true, ...result })
  })

  app.delete('/active-sessions/:id', {
    onRequest: [app.authenticate, app.requireRoles('SUPER_ADMIN')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await checkBulkDelete(request.user.sub, request.ip)
    const result = await securityService.forceRevokeSession(id)
    return reply.send({ success: true, data: result })
  })

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  app.post('/cleanup', {
    onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')],
  }, async (_request, reply) => {
    const result = await securityService.cleanupExpiredTokens()
    return reply.send({ success: true, data: result })
  })
}
