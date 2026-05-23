import * as crypto from 'crypto'
import { prisma } from '../config/prisma'
import type { AuditAction, AlertType, AlertSeverity } from '@prisma/client'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export const securityService = {

  // ─── Audit Logs ─────────────────────────────────────────────────────────────
  async listAuditLogs(params: {
    userId?: string
    action?: AuditAction
    resource?: string
    ipAddress?: string
    from?: string
    to?: string
    page: number
    limit: number
  }) {
    const { userId, action, resource, ipAddress, from, to, page, limit } = params
    const skip = (page - 1) * limit

    const where: any = {}
    if (userId)    where.userId    = userId
    if (action)    where.action    = action
    if (resource)  where.resource  = resource
    if (ipAddress) where.ipAddress = { contains: ipAddress }
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to)   where.createdAt.lte = new Date(to)
    }

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  },

  async getAuditLog(id: bigint) {
    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    })
    if (!log) throw Object.assign(new Error("Audit log topilmadi"), { statusCode: 404 })
    return log
  },

  // ─── Security Alerts ─────────────────────────────────────────────────────────
  async listAlerts(params: {
    type?: AlertType
    severity?: AlertSeverity
    resolved?: boolean
    page: number
    limit: number
  }) {
    const { type, severity, resolved, page, limit } = params
    const skip = (page - 1) * limit

    const where: any = {}
    if (type !== undefined)     where.type     = type
    if (severity !== undefined) where.severity = severity
    if (resolved !== undefined) where.resolved = resolved

    const [alerts, total] = await prisma.$transaction([
      prisma.securityAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.securityAlert.count({ where }),
    ])

    return {
      data: alerts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  },

  async resolveAlert(alertId: bigint, resolvedBy: string) {
    const alert = await prisma.securityAlert.findUnique({ where: { id: alertId } })
    if (!alert) throw Object.assign(new Error("Alert topilmadi"), { statusCode: 404 })

    return prisma.securityAlert.update({
      where: { id: alertId },
      data: { resolved: true, resolvedBy, resolvedAt: new Date() },
    })
  },

  async getAlertStats() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [todayTotal, unresolved, blockedIps] = await prisma.$transaction([
      prisma.securityAlert.count({ where: { createdAt: { gte: today } } }),
      prisma.securityAlert.count({ where: { resolved: false } }),
      prisma.ipBlock.count({ where: { expiresAt: { gt: new Date() } } }),
    ])

    return { todayTotal, unresolved, blockedIps }
  },

  // ─── Sessions (own) ──────────────────────────────────────────────────────────
  async listSessions(userId: string) {
    return prisma.refreshToken.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    })
  },

  async revokeSession(sessionId: string, requestingUserId: string) {
    const session = await prisma.refreshToken.findUnique({ where: { id: sessionId } })
    if (!session) throw Object.assign(new Error("Sessiya topilmadi"), { statusCode: 404 })
    if (session.userId !== requestingUserId) throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    await prisma.refreshToken.delete({ where: { id: sessionId } })
  },

  async revokeAllSessions(userId: string, exceptTokenHash?: string) {
    const where: any = { userId }
    if (exceptTokenHash) where.tokenHash = { not: exceptTokenHash }
    const { count } = await prisma.refreshToken.deleteMany({ where })
    return { revoked: count }
  },

  // ─── Admin: all active sessions ──────────────────────────────────────────────
  async listAllActiveSessions(page: number, limit: number) {
    const skip = (page - 1) * limit
    const where = { expiresAt: { gt: new Date() } }

    const [sessions, total] = await prisma.$transaction([
      prisma.refreshToken.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        },
      }),
      prisma.refreshToken.count({ where }),
    ])

    return { data: sessions, meta: { total, page, limit } }
  },

  async forceRevokeSession(sessionId: string) {
    const session = await prisma.refreshToken.findUnique({ where: { id: sessionId } })
    if (!session) throw Object.assign(new Error("Sessiya topilmadi"), { statusCode: 404 })
    await prisma.refreshToken.delete({ where: { id: sessionId } })
    return { revoked: 1 }
  },

  async cleanupExpiredTokens() {
    const { count } = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    return { deleted: count }
  },
}
