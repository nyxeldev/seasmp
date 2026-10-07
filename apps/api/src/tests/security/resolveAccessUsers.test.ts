/**
 * resolveAccess('users') — SELF/FOREIGN/PRIVILEGED klassifikatsiyasi.
 *
 * R4/R6 FIX'ning haqiqiy foydasi shu yerda isbotlanadi: `targetFromPath`
 * endi `teacherId`/`studentId`/`userId` parametrlarini `'users'` resurs
 * turiga map qiladi (ilgari — UNOWNABLE_RESOURCE, hech qachon FOREIGN
 * bo'lolmaydigan o'lik yo'l). Bu test sof unit: Prisma mock qilingan,
 * faqat `ownership_rules`dagi haqiqiy qatorni (prisma/seed-ownership.ts —
 * `{ resourceType: 'users', ownerPath: 'id', role: 'OWNER' }`) qaytaradi.
 */
import { jest } from '@jest/globals'

const mockFindMany = jest.fn<() => Promise<any[]>>()

jest.mock('../../config/prisma', () => ({
  prisma: { ownershipRule: { findMany: mockFindMany } },
}))
jest.mock('../../config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}))

import { resolveAccess } from '../../services/ownershipResolver'

beforeEach(() => {
  jest.clearAllMocks()
  // prisma/seed-ownership.ts'dagi haqiqiy qator — boshqa hech narsa o'ylab topilmagan.
  mockFindMany.mockResolvedValue([
    { resourceType: 'users', ownerPath: 'id', role: 'OWNER', active: true },
  ])
})

describe("resolveAccess('users') — teacherId/studentId/userId endi bu turga map qilinadi (R4/R6)", () => {
  it('aktor o\'zini ko\'rsa — SELF', async () => {
    const v = await resolveAccess('users', 'u1', 'u1', 'TEACHER')
    expect(v.relation).toBe('SELF')
  })

  it('oddiy aktor boshqa foydalanuvchini ko\'rsa — FOREIGN (UNKNOWN EMAS — asosiy tuzatish shu)', async () => {
    const v = await resolveAccess('users', 'u2', 'u1', 'TEACHER')
    expect(v.relation).toBe('FOREIGN')
    expect(v.hasOwnerRule).toBe(true)
    expect(v.ownerId).toBe('u2')
  })

  it('STUDENT boshqa foydalanuvchini (masalan studentId orqali) ko\'rsa — FOREIGN', async () => {
    const v = await resolveAccess('users', 'u2', 'u1', 'STUDENT')
    expect(v.relation).toBe('FOREIGN')
  })

  it('ADMIN boshqa foydalanuvchini ko\'rsa — PRIVILEGED, ownerId audit uchun saqlanadi', async () => {
    const v = await resolveAccess('users', 'u2', 'admin1', 'ADMIN')
    expect(v.relation).toBe('PRIVILEGED')
    expect(v.ownerId).toBe('u2')
  })

  it('resourceId berilmagan bo\'lsa — UNKNOWN (bu "resurs turi xato" emas, "ID yo\'q")', async () => {
    const v = await resolveAccess('users', undefined, 'u1', 'TEACHER')
    expect(v.relation).toBe('UNKNOWN')
  })
})
