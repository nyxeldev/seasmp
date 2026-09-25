/**
 * Korrelyatsiya qatlami — ishning gipotezasi shu testlarda tekshiriladi.
 */
import {
  correlate, authzRisk, behaviorRisk, combineRisk, singleLayerVerdict,
  SINGLE_THRESHOLD, CORRELATED_THRESHOLD,
  type LayerSignals,
} from '../../services/correlation'

const sig = (o: Partial<LayerSignals> = {}): LayerSignals => ({
  authzDenied: 0, authzAllowed: 0, behaviorScore: 0, massAccess: false, ...o,
})

describe('qatlam risklari', () => {
  it('muvaffaqiyatli ruxsatsiz murojaat — to\'liq risk', () => {
    expect(authzRisk(sig({ authzAllowed: 1 }))).toBe(1)
  })
  it('rad etishlar to\'planib boradi', () => {
    expect(authzRisk(sig({ authzDenied: 1 }))).toBeLessThan(authzRisk(sig({ authzDenied: 4 })))
  })
  it('ommaviy murojaat — to\'liq risk', () => {
    expect(behaviorRisk(sig({ massAccess: true }))).toBe(1)
  })
  it('signal yo\'q — nol', () => {
    expect(authzRisk(sig())).toBe(0)
    expect(behaviorRisk(sig())).toBe(0)
  })
})

describe('combineRisk', () => {
  it('signalsiz nol', () => { expect(combineRisk([0, 0])).toBe(0) })
  it('birlashganda kuchayadi', () => { expect(combineRisk([0.5, 0.5])).toBeGreaterThan(0.5) })
  it('1 dan oshmaydi', () => { expect(combineRisk([1, 1])).toBe(1) })
})

describe('correlate — qatlamni aniqlash', () => {
  it('signal yo\'q — ogohlantirish yo\'q', () => {
    const v = correlate(sig())
    expect(v.alert).toBe(false)
    expect(v.layer).toBeNull()
  })
  it('faqat avtorizatsiya', () => {
    expect(correlate(sig({ authzAllowed: 1 })).layer).toBe('AUTHORIZATION')
  })
  it('faqat xatti-harakat', () => {
    expect(correlate(sig({ massAccess: true })).layer).toBe('BEHAVIOR')
  })
  it('ikkalasi — CORRELATED', () => {
    expect(correlate(sig({ authzDenied: 2, behaviorScore: 0.4 })).layer).toBe('CORRELATED')
  })
})

describe('GIPOTEZA: gibrid model yolg\'on ishoralarni kamaytiradi', () => {
  // Zaif signal yolg'iz turganda bostiriladi
  it('zaif avtorizatsiya signali yolg\'iz — ogohlantirmaydi', () => {
    const v = correlate(sig({ authzDenied: 2 }))
    expect(v.risk).toBeLessThan(SINGLE_THRESHOLD)
    expect(v.alert).toBe(false)
  })

  it('zaif xatti-harakat signali yolg\'iz — ogohlantirmaydi', () => {
    const v = correlate(sig({ behaviorScore: 0.5 }))
    expect(v.alert).toBe(false)
  })

  // Lekin o'sha ikkita zaif signal BIRGALIKDA tasdiqlanadi
  it('AYNAN O\'SHA ikki zaif signal birgalikda — ogohlantiradi', () => {
    const weakAuthz = sig({ authzDenied: 2 })
    const weakBehav = sig({ behaviorScore: 0.5 })
    const together  = sig({ authzDenied: 2, behaviorScore: 0.5 })

    expect(correlate(weakAuthz).alert).toBe(false)
    expect(correlate(weakBehav).alert).toBe(false)
    expect(correlate(together).alert).toBe(true)
    expect(correlate(together).layer).toBe('CORRELATED')
    expect(correlate(together).risk).toBeGreaterThan(CORRELATED_THRESHOLD)
  })

  // Kuchli signal yolg'iz ham o'tadi — tasdiq kutib turmaydi
  it('kuchli signal yolg\'iz ham ogohlantiradi', () => {
    expect(correlate(sig({ authzAllowed: 1 })).alert).toBe(true)
    expect(correlate(sig({ massAccess: true })).alert).toBe(true)
  })
})

describe('singleLayerVerdict — eksperiment uchun taqqoslash', () => {
  const both = sig({ authzDenied: 2, behaviorScore: 0.5 })

  it('alohida qatlamlar bu holatni o\'tkazib yuboradi', () => {
    expect(singleLayerVerdict(both, 'AUTHORIZATION')).toBe(false)
    expect(singleLayerVerdict(both, 'BEHAVIOR')).toBe(false)
  })

  it('gibrid esa tutadi — bu gipotezaning asosiy dalili', () => {
    expect(correlate(both).alert).toBe(true)
  })
})
