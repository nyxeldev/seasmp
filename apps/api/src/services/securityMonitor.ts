/**
 * Centralized security rules engine.
 * All checks return void — they throw or log side-effects, never crash the caller.
 */
import { redis } from '../config/redis'
import { prisma } from '../config/prisma'
import { logger } from '../config/logger'
import { auditService } from './audit.service'
import { emailService } from './emailService'

// ─── Rule 1: Brute Force ─────────────────────────────────────────────────────

const BRUTE_LIMIT  = 10   // attempts
const BRUTE_WINDOW = 300  // 5 min (seconds)
const BLOCK_TTL    = 1800 // 30 min

export async function checkIpBlocked(ip: string): Promise<void> {
  const blocked = await redis.get(`ip_blocked:${ip}`)
  if (blocked) {
    const ttl = await redis.ttl(`ip_blocked:${ip}`)
    const mins = Math.ceil(ttl / 60)
    throw Object.assign(
      new Error(`Too many attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`),
      { statusCode: 429 }
    )
  }
}

export async function recordFailedLogin(ip: string, userId: string | null): Promise<void> {
  const key = `brute:${ip}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, BRUTE_WINDOW)

  if (count >= BRUTE_LIMIT) {
    await redis.setex(`ip_blocked:${ip}`, BLOCK_TTL, '1')
    await redis.del(key)

    await _createAlert('BRUTE_FORCE', 'CRITICAL', { ip, attempts: count })
    await auditService.log({
      userId,
      action: 'IP_BLOCKED',
      resource: 'security',
      ipAddress: ip,
    })
    logger.warn({ msg: 'IP blocked — brute force', ip, attempts: count })
  }
}

export async function resetLoginAttempts(ip: string): Promise<void> {
  await redis.del(`brute:${ip}`)
}

// ─── Rule 2: Multi-Device Session ────────────────────────────────────────────

const SESSION_IP_LIMIT = 3

export async function checkMultiDevice(userId: string, ip: string): Promise<void> {
  const key = `sessions_ips:${userId}`
  await redis.sadd(key, ip)
  await redis.expire(key, 7 * 24 * 3600)

  const size = await redis.scard(key)
  if (size > SESSION_IP_LIMIT) {
    await _createAlert('MULTI_DEVICE', 'MEDIUM', { userId, ip, deviceCount: size })
    logger.warn({ msg: 'Multi-device session detected', userId, ip, count: size })
    // Non-blocking — just log and alert, do not revoke
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    }).catch(() => null)
    if (user) {
      emailService.sendMultiDeviceAlert(user.email, `${user.firstName} ${user.lastName}`, size).catch(() => {})
    }
  }
}

export async function removeSessionIp(userId: string, ip: string): Promise<void> {
  await redis.srem(`sessions_ips:${userId}`, ip).catch(() => {})
}

// ─── Rule 3: Unusual Hour Access ─────────────────────────────────────────────

const RESTRICTED_ROLES = ['ADMIN', 'SUPER_ADMIN']

export async function checkUnusualHour(userId: string, role: string, ip: string): Promise<void> {
  if (!RESTRICTED_ROLES.includes(role)) return

  // Asia/Tashkent = UTC+5
  const now = new Date()
  const tashHour = (now.getUTCHours() + 5) % 24

  if (tashHour >= 0 && tashHour < 5) {
    await _createAlert('UNUSUAL_HOUR', 'HIGH', { userId, role, ip, hour: tashHour })
    logger.warn({ msg: 'Unusual hour access', userId, role, hour: tashHour, ip })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    }).catch(() => null)
    if (user) {
      emailService.sendUnusualHourAlert(user.email, `${user.firstName} ${user.lastName}`, ip, now).catch(() => {})
    }
  }
}

// ─── Rule 4: Bulk Delete ──────────────────────────────────────────────────────

const BULK_DELETE_LIMIT  = 10
const BULK_DELETE_WINDOW = 60 // seconds

export async function checkBulkDelete(userId: string, ip: string): Promise<void> {
  const key = `bulk_delete:${userId}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, BULK_DELETE_WINDOW)

  if (count > BULK_DELETE_LIMIT) {
    await _createAlert('BULK_DELETE', 'HIGH', { userId, ip, count })
    logger.warn({ msg: 'Bulk delete blocked', userId, count })
    throw Object.assign(
      new Error('Bulk delete limit exceeded. Contact administrator.'),
      { statusCode: 403 }
    )
  }
}

// ─── Rule 5: App-level Rate Limit (sliding window) ───────────────────────────

const RL_LIMIT  = 100
const RL_WINDOW = 60 // seconds

export async function checkRateLimit(ip: string): Promise<void> {
  const now = Date.now()
  const key  = `rl:${ip}`
  const pipe = redis.pipeline()
  pipe.zremrangebyscore(key, 0, now - RL_WINDOW * 1000)
  pipe.zadd(key, now, `${now}`)
  pipe.zcard(key)
  pipe.expire(key, RL_WINDOW)
  const results = await pipe.exec()
  const count = results?.[2]?.[1] as number ?? 0

  if (count > RL_LIMIT) {
    throw Object.assign(
      new Error("So'rovlar soni chegarasidan oshdi."),
      { statusCode: 429 }
    )
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _createAlert(
  type: 'BRUTE_FORCE' | 'MULTI_DEVICE' | 'UNUSUAL_HOUR' | 'BULK_DELETE' | 'RATE_LIMIT',
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  details: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.securityAlert.create({
      data: {
        type,
        severity,
        userId:    typeof details.userId === 'string' ? details.userId : null,
        ipAddress: typeof details.ip === 'string' ? details.ip : null,
        details:   details as any,
      },
    })
  } catch (err) {
    logger.error({ msg: 'Failed to create security alert', err })
  }
}
