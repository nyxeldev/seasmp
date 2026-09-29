/**
 * Bildirishnoma servisi.
 *
 * Diqqat markazida EGALIK: qator aynan qabul qiluvchi uchun yoziladi va
 * boshqa birov uni o'qilgan deb belgilay olmaydi. Marshrutda `:userId` yo'q,
 * shuning uchun himoya to'liq shu servisdagi `where` shartiga tayanadi —
 * agar u yerdan `userId` tushib qolsa, har kim har kimnikini o'zgartira
 * olardi va buni hech narsa ushlamasdi.
 */
import { jest } from '@jest/globals'

const mockCreate      = jest.fn<() => Promise<any>>()
const mockCreateMany  = jest.fn<() => Promise<any>>()
const mockFindMany    = jest.fn<() => Promise<any>>()
const mockCount       = jest.fn<() => Promise<any>>()
const mockUpdateMany  = jest.fn<() => Promise<any>>()
const mockUserFind    = jest.fn<() => Promise<any>>()
const mockEmit        = jest.fn()

jest.mock('../../config/prisma', () => ({
  prisma: {
    notification: {
      create:     mockCreate,
      createMany: mockCreateMany,
      findMany:   mockFindMany,
      count:      mockCount,
      updateMany: mockUpdateMany,
    },
    user: { findMany: mockUserFind },
  },
}))

jest.mock('../../realtime/gateway', () => ({
  emitNotification: mockEmit,
}))

import { notificationService, notifyAdmins } from '../../services/notification.service'

const row = (over: Record<string, unknown> = {}) => ({
  id: BigInt(1), userId: 'u1', type: 'GRADE_POSTED', title: 'Baho', body: null,
  link: null, readAt: null, createdAt: new Date('2026-09-27T10:00:00Z'), ...over,
})

describe('bildirishnoma yaratish', () => {
  beforeEach(() => jest.clearAllMocks())

  it('yozadi va egasiga jonli yuboradi', async () => {
    mockCreate.mockResolvedValue(row())
    await notificationService.create({ userId: 'u1', type: 'GRADE_POSTED', title: 'Baho' })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', title: 'Baho' }) }),
    )
    expect(mockEmit).toHaveBeenCalledWith('u1', expect.objectContaining({ id: '1', title: 'Baho' }))
  })

  // Bildirishnoma qo'shimcha qulaylik: baho qo'yish uning tufayli yiqilmasin
  it('baza xatosida istisno tashlamaydi', async () => {
    mockCreate.mockRejectedValue(new Error('baza yiqildi'))
    await expect(
      notificationService.create({ userId: 'u1', type: 'GRADE_POSTED', title: 'Baho' }),
    ).resolves.toBeUndefined()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('bo\'sh ro\'yxat uchun bazaga umuman bormaydi', async () => {
    await notificationService.createMany([])
    expect(mockCreateMany).not.toHaveBeenCalled()
  })
})

describe('EGALIK — eng muhim qism', () => {
  beforeEach(() => jest.clearAllMocks())

  it('o\'qilgan deb belgilashda userId sharti QO\'SHILADI', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 })
    const ok = await notificationService.markRead(BigInt(7), 'u1')

    expect(ok).toBe(true)
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: BigInt(7), userId: 'u1' }),
      }),
    )
  })

  it('begona qator topilmasa false qaytaradi', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 })
    expect(await notificationService.markRead(BigInt(7), 'boshqa-odam')).toBe(false)
  })

  it('ro\'yxat faqat so\'ragan odamniki bo\'ladi', async () => {
    mockFindMany.mockResolvedValue([row()])
    await notificationService.list('u1')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
    )
  })

  it('o\'qilmaganlar soni ham userId bo\'yicha', async () => {
    mockCount.mockResolvedValue(3)
    expect(await notificationService.unreadCount('u1')).toBe(3)
    expect(mockCount).toHaveBeenCalledWith({ where: { userId: 'u1', readAt: null } })
  })

  it('hammasini o\'qilgan deb belgilash faqat o\'zinikiga tegadi', async () => {
    mockUpdateMany.mockResolvedValue({ count: 5 })
    expect(await notificationService.markAllRead('u1')).toBe(5)
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', readAt: null } }),
    )
  })
})

describe('notifyAdmins', () => {
  beforeEach(() => jest.clearAllMocks())

  it('faqat FAOL imtiyozli rollarga yozadi', async () => {
    mockUserFind.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }])
    mockCreateMany.mockResolvedValue({ count: 2 })
    mockFindMany.mockResolvedValue([])

    await notifyAdmins({ type: 'SECURITY_ALERT', title: 'Xavfsizlik' })

    expect(mockUserFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      }),
    )
    const written = (mockCreateMany.mock.calls[0] as any)[0].data
    expect(written.map((d: any) => d.userId).sort()).toEqual(['a1', 'a2'])
  })

  it('admin topilmasa jim o\'tadi', async () => {
    mockUserFind.mockResolvedValue([])
    await expect(notifyAdmins({ type: 'SECURITY_ALERT', title: 'X' })).resolves.toBeUndefined()
    expect(mockCreateMany).not.toHaveBeenCalled()
  })
})
