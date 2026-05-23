import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import * as jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { UserRole } from '@prisma/client'

interface JWTPayload {
  sub:  string
  role: UserRole
  iat:  number
  exp:  number
}

// Fastify type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    authenticate:       (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRoles:       (...roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    user: JWTPayload
  }
}

export async function registerAuthMiddleware(app: FastifyInstance) {

  // JWT tekshirish
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token topilmadi' },
      })
    }

    const token = authHeader.slice(7)

    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JWTPayload
      request.user = payload
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token yaroqsiz yoki muddati tugagan' },
      })
    }
  })

  // Rol tekshirish
  app.decorate('requireRoles', (...roles: UserRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!roles.includes(request.user?.role)) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: "Bu amalni bajarish uchun ruxsat yo'q" },
        })
      }
    }
  })
}
