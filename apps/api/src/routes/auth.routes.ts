import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authService } from '../services/auth.service'

// ─── Schemas ──────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email:    z.string().email("Email format noto'g'ri"),
  password: z.string().min(8, "Parol kamida 8 ta belgidan iborat bo'lishi kerak"),
})

const twoFactorSchema = z.object({
  twoFactorToken: z.string().min(1),
  code:           z.string().length(6, "2FA kodi 6 ta raqamdan iborat"),
})

const backupCodeSchema = z.object({
  twoFactorToken: z.string().min(1),
  backupCode:     z.string().min(1, "Backup kod kerak"),
})

const confirm2FASchema = z.object({
  code: z.string().length(6, "2FA kodi 6 ta raqamdan iborat"),
})

const disable2FASchema = z.object({
  userId:   z.string().uuid().optional(),  // Super Admin boshqa user uchun
  password: z.string().optional(),         // O'zi uchun parol talab
})

// ─── COOKIE OPTIONS ───────────────────────────────────────────────────────────
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path:     '/v1/auth/refresh',
  maxAge:   7 * 24 * 60 * 60,
}

// ─── Routes ───────────────────────────────────────────────────────────────────
export default async function authRoutes(app: FastifyInstance) {

  // POST /v1/auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: body.error.errors[0].message },
      })
    }

    let result
    try {
      result = await authService.login(
        body.data.email,
        body.data.password,
        request.ip,
        request.headers['user-agent'] ?? ''
      )
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({
        success: false,
        error: { code: err.code ?? 'UNAUTHORIZED', message: err.message },
      })
    }

    // 2FA setup required (Admin/Teacher who haven't set up 2FA yet)
    if (result.requiresTwoFactorSetup) {
      return reply.status(200).send({
        success: true,
        data: { requiresTwoFactorSetup: true, setupToken: result.twoFactorToken },
      })
    }

    // 2FA verification required
    if (result.requiresTwoFactor) {
      return reply.status(200).send({
        success: true,
        data: { requiresTwoFactor: true, twoFactorToken: result.twoFactorToken },
      })
    }

    // Full login
    reply.setCookie('refreshToken', result.tokens!.refreshToken, REFRESH_COOKIE_OPTS)
    return reply.status(200).send({
      success: true,
      data: { accessToken: result.tokens!.accessToken, user: result.user },
    })
  })

  // POST /v1/auth/2fa/verify  — TOTP code after login
  app.post('/2fa/verify', async (request, reply) => {
    const body = twoFactorSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: body.error.errors[0].message },
      })
    }

    const result = await authService.verifyTwoFactor(
      body.data.twoFactorToken,
      body.data.code,
      request.ip,
      request.headers['user-agent'] ?? ''
    )

    reply.setCookie('refreshToken', result.tokens!.refreshToken, REFRESH_COOKIE_OPTS)
    return reply.status(200).send({
      success: true,
      data: { accessToken: result.tokens!.accessToken, user: result.user },
    })
  })

  // POST /v1/auth/2fa/backup  — backup code login
  app.post('/2fa/backup', async (request, reply) => {
    const body = backupCodeSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: body.error.errors[0].message },
      })
    }

    const result = await authService.verifyBackupCode(
      body.data.twoFactorToken,
      body.data.backupCode,
      request.ip,
      request.headers['user-agent'] ?? ''
    )

    reply.setCookie('refreshToken', result.tokens!.refreshToken, REFRESH_COOKIE_OPTS)
    return reply.status(200).send({
      success: true,
      data: { accessToken: result.tokens!.accessToken, user: result.user },
    })
  })

  // POST /v1/auth/refresh
  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.refreshToken
    if (!refreshToken) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Refresh token topilmadi' },
      })
    }

    const tokens = await authService.refresh(
      refreshToken,
      request.ip,
      request.headers['user-agent'] ?? ''
    )

    reply.setCookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTS)
    return reply.status(200).send({ success: true, data: { accessToken: tokens.accessToken } })
  })

  // POST /v1/auth/logout
  app.post('/logout', { onRequest: [app.authenticate] }, async (request, reply) => {
    const refreshToken = request.cookies?.refreshToken
    if (refreshToken) {
      await authService.logout(refreshToken, (request.user as any).sub, request.ip)
    }
    reply.clearCookie('refreshToken', { path: '/v1/auth/refresh' })
    return reply.status(200).send({ success: true, data: { message: "Chiqildi" } })
  })

  // GET /v1/auth/2fa/setup  — get QR code
  app.get('/2fa/setup', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as any).sub
    const result = await authService.setup2FA(userId)
    return reply.status(200).send({ success: true, data: result })
  })

  // POST /v1/auth/2fa/confirm  — verify first code and enable 2FA
  app.post('/2fa/confirm', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = confirm2FASchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: body.error.errors[0].message },
      })
    }

    const userId = (request.user as any).sub
    const result = await authService.confirm2FA(userId, body.data.code)

    return reply.status(200).send({
      success: true,
      data: { message: "2FA muvaffaqiyatli yoqildi", backupCodes: result.backupCodes },
    })
  })

  // POST /v1/auth/2fa/verify-setup  — alias for confirm (spec requires this name too)
  app.post('/2fa/verify-setup', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = confirm2FASchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: body.error.errors[0].message },
      })
    }

    const userId = (request.user as any).sub
    const result = await authService.confirm2FA(userId, body.data.code)

    return reply.status(200).send({
      success: true,
      data: { message: "2FA muvaffaqiyatli yoqildi", backupCodes: result.backupCodes },
    })
  })

  // POST /v1/auth/2fa/setup-start  — public, uses setupToken from login
  // Called when ADMIN/TEACHER hasn't set up 2FA and just logged in
  app.post('/2fa/setup-start', async (request, reply) => {
    const body = z.object({ setupToken: z.string().min(1) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.errors[0].message } })

    const userId = await import('../config/redis').then(m => m.redis.get(`2fa_setup_required:${body.data.setupToken}`))
    if (!userId) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token muddati tugagan' } })

    const result = await authService.setup2FA(userId)
    return reply.status(200).send({ success: true, data: result })
  })

  // POST /v1/auth/2fa/setup-finish  — public, uses setupToken + TOTP code
  app.post('/2fa/setup-finish', async (request, reply) => {
    const body = z.object({
      setupToken: z.string().min(1),
      code:       z.string().length(6),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.errors[0].message } })

    const redisM  = await import('../config/redis')
    const userId  = await redisM.redis.get(`2fa_setup_required:${body.data.setupToken}`)
    if (!userId) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token muddati tugagan' } })

    const result = await authService.confirm2FA(userId, body.data.code)
    await redisM.redis.del(`2fa_setup_required:${body.data.setupToken}`)

    // Issue full tokens after successful 2FA setup
    const user = await import('../config/prisma').then(m => m.prisma.user.findUniqueOrThrow({ where: { id: userId } }))
    const tokens = await authService._createTokenPair(user.id, user.role, request.ip, request.headers['user-agent'] ?? '')

    await import('../config/prisma').then(m => m.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }))

    reply.setCookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTS)
    return reply.status(200).send({
      success: true,
      data: {
        message: '2FA yoqildi va kirish amalga oshirildi',
        backupCodes: result.backupCodes,
        accessToken: tokens.accessToken,
        user: authService._safeUser(user),
      },
    })
  })

  // POST /v1/auth/2fa/disable
  app.post('/2fa/disable', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = disable2FASchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: body.error.errors[0].message },
      })
    }

    const actorId   = (request.user as any).sub
    const actorRole = (request.user as any).role
    const targetId  = body.data.userId ?? actorId

    await authService.disable2FA(targetId, actorId, actorRole, body.data.password)

    return reply.status(200).send({ success: true, data: { message: "2FA o'chirildi" } })
  })
}
