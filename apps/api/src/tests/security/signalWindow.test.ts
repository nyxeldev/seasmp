/**
 * Signal oynasi — qatlamlarning dalili shu yerda to'planadi.
 *
 * Diqqat markazida: IMTIYOZLI QAMROV to'plami va uning MUDDATI. Oyna
 * yopilmasa, adminning kun bo'yidagi odatdagi ishi ham to'plana-to'plana
 * to'yinish chegarasidan oshib ketadi va yolg'on CORRELATED beradi.
 *
 * Unit testlar jarayon ichidagi MemRedis bilan ishlaydi (REDIS_IN_MEMORY=1) —
 * aynan shu nusxada to'plam muddati ilgari e'tiborsiz qoldirilardi.
 */
import {
  recordPrivilegedScope, recordAuthz, recordBehavior,
  readSignals, clearSignals, WINDOW_SECONDS,
} from '../../services/signalWindow'

const USER = '11111111-1111-1111-1111-111111111111'

/** Soatni oldinga suradi — MemRedis Date.now() ga qaraydi */
function advance(seconds: number): jest.SpyInstance {
  const target = Date.now() + seconds * 1000
  return jest.spyOn(Date, 'now').mockReturnValue(target)
}

describe('imtiyozli qamrov oynasi', () => {
  beforeEach(async () => {
    jest.restoreAllMocks()
    await clearSignals(USER)
  })
  afterEach(() => jest.restoreAllMocks())

  it('har xil egalar sanaladi', async () => {
    expect(await recordPrivilegedScope(USER, 'owner-a')).toBe(1)
    expect(await recordPrivilegedScope(USER, 'owner-b')).toBe(2)
    expect(await recordPrivilegedScope(USER, 'owner-c')).toBe(3)
  })

  it('bitta egaga qayta-qayta tegish sonni oshirmaydi', async () => {
    await recordPrivilegedScope(USER, 'owner-a')
    for (let i = 0; i < 20; i++) await recordPrivilegedScope(USER, 'owner-a')
    expect(await recordPrivilegedScope(USER, 'owner-a')).toBe(1)
  })

  it('signal manzarasiga tushadi', async () => {
    await recordPrivilegedScope(USER, 'owner-a')
    await recordPrivilegedScope(USER, 'owner-b')
    const s = await readSignals(USER)
    expect(s.privilegedOwners).toBe(2)
  })

  // REGRESSIYA: MemRedis.expire to'plamlarni jimgina e'tiborsiz qoldirardi
  it('oyna tugagach qamrov nolga qaytadi', async () => {
    await recordPrivilegedScope(USER, 'owner-a')
    await recordPrivilegedScope(USER, 'owner-b')
    expect((await readSignals(USER)).privilegedOwners).toBe(2)

    advance(WINDOW_SECONDS + 5)
    expect((await readSignals(USER)).privilegedOwners).toBe(0)
  })

  it('oyna ichida qamrov saqlanadi', async () => {
    await recordPrivilegedScope(USER, 'owner-a')
    advance(WINDOW_SECONDS - 30)
    expect((await readSignals(USER)).privilegedOwners).toBe(1)
  })

  // Oyna admin ishlagani sayin cho'zilib ketmasligi kerak: muddat faqat
  // to'plam yaratilganda o'rnatiladi, har qo'shilganda emas.
  it('yangi ega qo\'shilishi oynani cho\'zmaydi', async () => {
    await recordPrivilegedScope(USER, 'owner-a')
    advance(WINDOW_SECONDS - 10)
    await recordPrivilegedScope(USER, 'owner-b')
    expect((await readSignals(USER)).privilegedOwners).toBe(2)

    advance(WINDOW_SECONDS + 5)
    expect((await readSignals(USER)).privilegedOwners).toBe(0)
  })

  it('tozalash qamrovni ham o\'chiradi', async () => {
    await recordPrivilegedScope(USER, 'owner-a')
    await clearSignals(USER)
    expect((await readSignals(USER)).privilegedOwners).toBe(0)
  })
})

describe('boshqa signallar oyna bilan birga yashaydi', () => {
  beforeEach(async () => {
    jest.restoreAllMocks()
    await clearSignals(USER)
  })
  afterEach(() => jest.restoreAllMocks())

  it('rad etishlar sanaladi va oyna tugagach yo\'qoladi', async () => {
    await recordAuthz(USER, 'DENIED')
    await recordAuthz(USER, 'DENIED')
    expect((await readSignals(USER)).authzDenied).toBe(2)

    advance(WINDOW_SECONDS + 5)
    expect((await readSignals(USER)).authzDenied).toBe(0)
  })

  it('xatti-harakat bali eng yuqorisini saqlaydi', async () => {
    await recordBehavior(USER, 0.4)
    await recordBehavior(USER, 0.8)
    await recordBehavior(USER, 0.2)
    expect((await readSignals(USER)).behaviorScore).toBeCloseTo(0.8, 6)
  })
})
