/**
 * Integration test helpers.
 * Requires a real PostgreSQL + Redis.
 * Set TEST_DATABASE_URL env to override the default.
 *
 * Usage in tests:
 *   const { app, prisma } = await startApp()
 *   afterAll(() => app.close())
 */
import { buildApp } from '../../app'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'

export const DB_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!

export async function startApp() {
  const app = await buildApp()
  await app.ready()
  return app
}

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } })
export { prisma }

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const TS = Date.now()

export async function seedAdmin() {
  return prisma.user.upsert({
    where:  { email: `admin_${TS}@test.com` },
    update: {},
    create: {
      email:        `admin_${TS}@test.com`,
      passwordHash: await bcrypt.hash('Admin@1234', 12),
      firstName:    'Test',
      lastName:     'Admin',
      role:         'ADMIN',
      twoFactorEnabled: false,
    },
  })
}

export async function seedTeacher() {
  return prisma.user.upsert({
    where:  { email: `teacher_${TS}@test.com` },
    update: {},
    create: {
      email:        `teacher_${TS}@test.com`,
      passwordHash: await bcrypt.hash('Teacher@1234', 12),
      firstName:    'Test',
      lastName:     'Teacher',
      role:         'TEACHER',
      twoFactorEnabled: false,
    },
  })
}

export async function seedStudent() {
  return prisma.user.upsert({
    where:  { email: `student_${TS}@test.com` },
    update: {},
    create: {
      email:        `student_${TS}@test.com`,
      passwordHash: await bcrypt.hash('Student@1234', 12),
      firstName:    'Test',
      lastName:     'Student',
      role:         'STUDENT',
      twoFactorEnabled: false,
    },
  })
}

export function makeToken(userId: string, role: string): string {
  return jwt.sign(
    { sub: userId, role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m' }
  )
}

export async function cleanup(...ids: string[]) {
  // Delete created test records in dependency order
  await prisma.auditLog.deleteMany({
    where: { userId: { in: ids } },
  })
  await prisma.refreshToken.deleteMany({
    where: { userId: { in: ids } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: ids } },
  })
}
