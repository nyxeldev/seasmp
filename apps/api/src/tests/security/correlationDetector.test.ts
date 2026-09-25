/**
 * Korrelyatsiya detektorining qaror mantiqi — ogohlantirish turi va darajasi,
 * hamda gipotezaning o'zi: tasdiqlangan zaif signal o'tadi, yolg'iz zaif signal
 * bostiriladi. Bazasiz ishlaydi.
 */
import { alertTypeFor, severityFor } from '../../services/correlationDetector'
import {
  correlate, SINGLE_THRESHOLD, CORRELATED_THRESHOLD, type LayerSignals,
} from '../../services/correlation'

const base: LayerSignals = {
  authzDenied: 0, authzAllowed: 0, behaviorScore: 0, massAccess: false,
}

describe('alertTypeFor — tur eng kuchli dalilga qarab tanlanadi', () => {
  it('muvaffaqiyatli begona murojaat eng kuchli dalil', () => {
    expect(alertTypeFor({ ...base, authzAllowed: 1, massAccess: true }))
      .toBe('UNAUTHORIZED_OBJECT_ACCESS')
  })

  it('ommaviy chiqarish rad etishlardan ustun', () => {
    expect(alertTypeFor({ ...base, authzDenied: 3, massAccess: true })).toBe('MASS_DATA_ACCESS')
  })

  it('faqat rad etishlar', () => {
    expect(alertTypeFor({ ...base, authzDenied: 5 })).toBe('UNAUTHORIZED_OBJECT_ACCESS')
  })

  it('faqat xatti-harakat', () => {
    expect(alertTypeFor({ ...base, behaviorScore: 0.9 })).toBe('BEHAVIOR_ANOMALY')
  })
})

describe('severityFor — daraja riskdan kelib chiqadi', () => {
  it.each([
    [1.0,  'CRITICAL'],
    [0.90, 'CRITICAL'],
    [0.80, 'HIGH'],
    [0.75, 'HIGH'],
    [0.60, 'MEDIUM'],
    [0.50, 'MEDIUM'],
    [0.30, 'LOW'],
  ])('risk %s -> %s', (risk, expected) => {
    expect(severityFor(risk as number)).toBe(expected)
  })

  it('chegaralar correlation.ts bilan mos', () => {
    expect(severityFor(SINGLE_THRESHOLD)).toBe('HIGH')
    expect(severityFor(CORRELATED_THRESHOLD)).toBe('MEDIUM')
  })
})

describe('gipoteza — tasdiqlash zaif signalni o\'tkazadi, yolg\'izlik bostiradi', () => {
  it('yolg\'iz o\'rtacha xatti-harakat anomaliyasi ogohlantirmaydi', () => {
    // Ilgari behaviorDetector 0.6 dan oshsa darhol ogohlantirardi
    const v = correlate({ ...base, behaviorScore: 0.65 })
    expect(v.layer).toBe('BEHAVIOR')
    expect(v.alert).toBe(false)
  })

  it('yolg\'iz bir nechta rad etish ham yetarli emas', () => {
    const v = correlate({ ...base, authzDenied: 2 })
    expect(v.layer).toBe('AUTHORIZATION')
    expect(v.alert).toBe(false)
  })

  it('AYNAN O\'SHA ikkita zaif signal birga kelsa — ogohlantiradi', () => {
    const v = correlate({ ...base, authzDenied: 2, behaviorScore: 0.65 })
    expect(v.layer).toBe('CORRELATED')
    expect(v.alert).toBe(true)
    expect(severityFor(v.risk)).not.toBe('LOW')
  })

  it('muvaffaqiyatli begona murojaat yolg\'iz ham kifoya — bu zaiflikning o\'zi', () => {
    const v = correlate({ ...base, authzAllowed: 1 })
    expect(v.layer).toBe('AUTHORIZATION')
    expect(v.alert).toBe(true)
    expect(severityFor(v.risk)).toBe('CRITICAL')
  })

  it('signal umuman yo\'q — qatlam ham, ogohlantirish ham yo\'q', () => {
    const v = correlate(base)
    expect(v.layer).toBeNull()
    expect(v.alert).toBe(false)
  })
})
