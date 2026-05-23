import { PrismaClient, Prisma } from '@prisma/client'
import { logger } from './logger'

type LogClient = PrismaClient<Prisma.PrismaClientOptions, 'error' | 'warn'>
const globalForPrisma = globalThis as unknown as { prisma: LogClient }

export const prisma: LogClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  })

if (process.env.NODE_ENV === 'development') {
  globalForPrisma.prisma = prisma
}

prisma.$on('error', (e) => logger.error({ msg: 'Prisma error', message: e.message }))
prisma.$on('warn',  (e) => logger.warn({ msg: 'Prisma warn',  message: e.message }))
