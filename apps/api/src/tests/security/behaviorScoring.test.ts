/**
 * 2-qatlam: xatti-harakat anomaliyasi ballashi.
 * Asosiy g'oya: chegara hamma uchun bir xil emas, har bir foydalanuvchining
 * o'z profilidan kelib chiqadi.
 */
import {
  surprise, surpriseMap, rateScore, scoreEvent, updateProfile, emptyProfile,
  smoothCircular, combine, isMassAccess, HOUR_KERNEL,
  MIN_SAMPLES, ALERT_THRESHOLD,
  type BehaviorProfile, type ObservedEvent,
} from '../../services/behaviorScoring'
// Yolg'iz qatlam uchun haqiqiy chegara shu yerda — behaviorScoring dagi
// ALERT_THRESHOLD qaror yo'lida ishlatilmaydi.
import { SINGLE_THRESHOLD } from '../../services/correlation'

/** Kunduzgi talaba: 9:00–17:00, bitta IP, bitta qurilma */
function dayStudent(): BehaviorProfile {
  const p = emptyProfile()
  for (let h = 9; h <= 17; h++) p.hourHistogram[h] = 20
  p.knownIps = ['10.0.0.5']
  p.knownUserAgents = ['Mozilla/5.0 Chrome']
  p.resourceMix = { courses: 100, enrollments: 60, attendance: 20 }
  p.reqPerHourMean = 20
  p.reqPerHourStd = 5
  p.sampleCount = 180
  return p
}

/** Tungi admin: 22:00–04:00 */
function nightAdmin(): BehaviorProfile {
  const p = emptyProfile()
  for (const h of [22, 23, 0, 1, 2, 3, 4]) p.hourHistogram[h] = 25
  p.knownIps = ['10.0.0.9']
  p.knownUserAgents = ['Mozilla/5.0 Firefox']
  p.resourceMix = { users: 120, security: 80 }
  p.reqPerHourMean = 25
  p.reqPerHourStd = 6
  p.sampleCount = 175
  return p
}

const ev = (o: Partial<ObservedEvent> = {}): ObservedEvent => ({
  hour: 12, weekday: 2, ip: '10.0.0.5', userAgent: 'Mozilla/5.0 Chrome',
  resource: 'courses', reqLastHour: 20, ...o,
})

describe('surprise — kutilmaganlik bali', () => {
  it('eng tez-tez uchraydigan qiymat uchun 0', () => {
    expect(surprise([0, 0, 50, 0], 2)).toBe(0)
  })

  it('hech ko\'rilmagan qiymat uchun yuqori', () => {
    expect(surprise([0, 0, 50, 0], 0)).toBeGreaterThan(0.9)
  })

  it('bo\'sh gistogramma uchun 0 — ayblamaydi', () => {
    expect(surprise([], 3)).toBe(0)
  })

  it('natija har doim 0..1 oralig\'ida', () => {
    for (let i = 0; i < 4; i++) {
      const s = surprise([1, 99, 0, 5], i)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

describe('surpriseMap — resurs taqsimoti', () => {
  const mix = { courses: 100, users: 5 }
  it('odatiy resurs uchun past', () => { expect(surpriseMap(mix, 'courses')).toBe(0) })
  it('kamdan-kam resurs uchun yuqori', () => { expect(surpriseMap(mix, 'users')).toBeGreaterThan(0.8) })
  it('umuman yangi resurs uchun eng yuqori', () => { expect(surpriseMap(mix, 'security')).toBeGreaterThan(0.9) })
  it('bo\'sh taqsimot uchun 0', () => { expect(surpriseMap({}, 'x')).toBe(0) })
})

describe('rateScore — chastota sakrashi (logarifmik nisbat)', () => {
  it('o\'rtacha chastota uchun 0', () => { expect(rateScore(20, 20)).toBe(0) })
  it('past chastota jazolanmaydi', () => { expect(rateScore(2, 20)).toBe(0) })
  it('juda kuchli sakrash uchun 1', () => { expect(rateScore(20 * 25, 20)).toBe(1) })

  // Bu asosiy tuzatish: z-ball ikkalasini ham 1 deb baholardi
  it('5 barobar va 200 barobar oshish AJRATILADI', () => {
    const moderate = rateScore(5 * 2, 2)
    const extreme  = rateScore(200 * 2, 2)
    expect(moderate).toBeLessThan(extreme)
    expect(moderate).toBeLessThan(0.7)
    expect(extreme).toBe(1)
  })

  // Va bu: kichik o'rtachada normal xatti-harakat ogohlantirmasligi kerak
  it('kichik o\'rtachada normal chastota sakrash deb hisoblanmaydi', () => {
    expect(rateScore(2, 1.4)).toBeLessThan(0.3)
  })

  it('o\'rtacha nol bo\'lsa yiqilmaydi', () => {
    expect(rateScore(1, 0)).toBe(0)
    expect(rateScore(5, 0)).toBeGreaterThan(0)
  })
})

describe('smoothCircular — qo\'shni soatlar hisobga olinadi', () => {
  it('umumiy yig\'indini saqlaydi', () => {
    const h = new Array(24).fill(0); h[10] = 100
    const sum = smoothCircular(h).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(100, 6)
  })

  it('sutka chegarasidan aylanib o\'tadi', () => {
    const h = new Array(24).fill(0); h[0] = 100
    expect(smoothCircular(h)[23]).toBeGreaterThan(0)
  })

  it('qo\'shni soat uzoq soatdan kam shubhali', () => {
    const p = dayStudent()
    const adjacent = scoreEvent(p, ev({ hour: 18 }))   // 17:00 dan keyin
    const distant  = scoreEvent(p, ev({ hour: 3 }))    // tungi soat
    expect(adjacent.score).toBeLessThan(distant.score)
  })
})

describe('combine — signallarni birlashtirish', () => {
  it('signal yo\'q bo\'lsa 0', () => { expect(combine([0, 0, 0])).toBe(0) })
  it('bitta signal o\'z vaznidan oshmaydi', () => { expect(combine([0.45])).toBeCloseTo(0.45, 6) })
  it('bir nechta signal kuchayadi, o\'rtachalanmaydi', () => {
    expect(combine([0.45, 0.45])).toBeGreaterThan(0.45)
  })
  it('natija 1 dan oshmaydi', () => { expect(combine([0.9, 0.9, 0.9])).toBeLessThanOrEqual(1) })
})

describe('scoreEvent — yakuniy baho', () => {
  it('bitta yangi IP o\'zi ogohlantirish bermaydi', () => {
    const r = scoreEvent(dayStudent(), ev({ ip: '203.0.113.7' }))
    expect(r.reasons).toContain('NEW_IP')
    expect(r.score).toBeLessThan(ALERT_THRESHOLD)
  })

  it('yetarli ma\'lumot bo\'lmasa ayblamaydi', () => {
    const p = emptyProfile(); p.sampleCount = MIN_SAMPLES - 1
    const r = scoreEvent(p, ev({ hour: 3, ip: '1.2.3.4' }))
    expect(r.score).toBe(0)
    expect(r.reasons).toContain('INSUFFICIENT_DATA')
  })

  it('odatiy xatti-harakat past ball oladi', () => {
    expect(scoreEvent(dayStudent(), ev()).score).toBeLessThan(0.2)
  })

  it('tungi kirish + yangi IP + yangi qurilma — ogohlantirish chegarasidan yuqori', () => {
    const r = scoreEvent(dayStudent(), ev({ hour: 3, ip: '203.0.113.7', userAgent: 'curl/8.0' }))
    expect(r.score).toBeGreaterThan(ALERT_THRESHOLD)
    expect(r.reasons).toEqual(expect.arrayContaining(['UNUSUAL_HOUR', 'NEW_IP', 'NEW_DEVICE']))
  })

  it('ASOSIY FARQ: tungi admin uchun soat 03:00 normal', () => {
    const student = scoreEvent(dayStudent(), ev({ hour: 3 }))
    const admin   = scoreEvent(nightAdmin(), ev({
      hour: 3, ip: '10.0.0.9', userAgent: 'Mozilla/5.0 Firefox', resource: 'users', reqLastHour: 25,
    }))
    expect(student.reasons).toContain('UNUSUAL_HOUR')
    expect(admin.reasons).not.toContain('UNUSUAL_HOUR')
    expect(admin.score).toBeLessThan(student.score)
  })

  it('ommaviy ma\'lumot chiqarish — chastota sakrashi tutiladi', () => {
    const r = scoreEvent(dayStudent(), ev({ reqLastHour: 400 }))
    expect(r.reasons).toContain('RATE_SPIKE')
  })

  it('odatdagi chastota RATE_SPIKE bermaydi', () => {
    const r = scoreEvent(dayStudent(), ev({ reqLastHour: 22 }))
    expect(r.reasons).not.toContain('RATE_SPIKE')
  })

  it('ball har doim 0..1 oralig\'ida', () => {
    const r = scoreEvent(dayStudent(), ev({ hour: 4, ip: 'x', userAgent: 'y', resource: 'z', reqLastHour: 999 }))
    expect(r.score).toBeLessThanOrEqual(1)
    expect(r.score).toBeGreaterThanOrEqual(0)
  })
})

describe('isMassAccess — ommaviy ma\'lumot chiqarish (alohida qoida)', () => {
  it('odatdagi chastota emas', () => { expect(isMassAccess(25, 20)).toBe(false) })
  it('kichik o\'rtachada ham absolyut chegara ishlaydi', () => {
    expect(isMassAccess(50, 1.4)).toBe(false)   // 35 barobar, lekin 100 dan kam
    expect(isMassAccess(300, 1.4)).toBe(true)
  })
  it('katta o\'rtachada nisbiy chegara ishlaydi', () => {
    expect(isMassAccess(150, 50)).toBe(false)   // 3 barobar
    expect(isMassAccess(1200, 50)).toBe(true)   // 24 barobar
  })
  it('profilsiz foydalanuvchi uchun absolyut chegara', () => {
    expect(isMassAccess(99, 0)).toBe(false)
    expect(isMassAccess(100, 0)).toBe(true)
  })
})

describe('updateProfile — onlayn o\'rganish', () => {
  it('yangi IP va qurilma profilga qo\'shiladi', () => {
    const p = updateProfile(dayStudent(), ev({ ip: '10.0.0.8', userAgent: 'Safari' }))
    expect(p.knownIps).toContain('10.0.0.8')
    expect(p.knownUserAgents).toContain('Safari')
    expect(p.sampleCount).toBe(181)
  })

  it('o\'rgangandan keyin o\'sha IP endi anomaliya emas', () => {
    const before = scoreEvent(dayStudent(), ev({ ip: '10.0.0.8' }))
    const after  = scoreEvent(updateProfile(dayStudent(), ev({ ip: '10.0.0.8' })), ev({ ip: '10.0.0.8' }))
    expect(after.score).toBeLessThan(before.score)
    expect(after.reasons).not.toContain('NEW_IP')
  })

  it('asl profilni o\'zgartirmaydi', () => {
    const p = dayStudent()
    updateProfile(p, ev({ ip: '9.9.9.9' }))
    expect(p.knownIps).not.toContain('9.9.9.9')
  })
})

/**
 * REGRESSIYA: soat yadrosi haqiqatan masofani kodlashi kerak.
 *
 * Yadro [0.25, 0.5, 0.25] bo'lganda u faqat ±1 soatga yetardi: 9-17 profilida
 * 18:00 yumshoq baholanardi, lekin 19:00 dan boshlab hamma soat 03:00 bilan
 * BIR XIL ball olardi. Natijada "uydan kechqurun kirish" bilan "tungi
 * o'g'irlangan hisob" farqlanmasdi va yolg'on ishora chiqardi.
 */
describe('soat yadrosi — masofa bilan asta o\'sadi', () => {
  const evening = [18, 19, 20, 21, 22]

  it('kechki soatlar ketma-ket shubhaliroq bo\'lib boradi', () => {
    const sm = smoothCircular(dayStudent().hourHistogram)
    const scores = evening.map((h) => surprise(sm, h))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1])
    }
  })

  it('19:00-21:00 tungi 03:00 dan kam shubhali', () => {
    const sm = smoothCircular(dayStudent().hourHistogram)
    const night = surprise(sm, 3)
    for (const h of [19, 20, 21]) {
      expect(surprise(sm, h)).toBeLessThan(night)
    }
  })

  it('yadro massani saqlaydi (yig\'indisi 1)', () => {
    expect(HOUR_KERNEL.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })
})

/**
 * REGRESSIYA: yolg'iz xatti-harakat signali chegaradan o'tmasligi kerak.
 *
 * Bu ikki holat eksperiment stendidagi eng tortishuvli juftlik. Ular deyarli
 * bir xil ko'rinadi — ikkalasida ham notanish IP va notanish qurilma — va
 * ularni faqat SOAT ajratadi. Yadro tor bo'lganda soat ham ajratmasdi.
 */
describe('tortishuvli juftlik — kechqurun uydan / tunda o\'g\'irlangan hisob', () => {
  const foreign = { ip: '78.40.1.55', userAgent: 'Safari-Mobile' }

  it('zararsiz kechki kirish yolg\'iz ogohlantirmaydi', () => {
    const s = scoreEvent(dayStudent(), ev({ hour: 20, ...foreign }))
    expect(s.score).toBeLessThan(SINGLE_THRESHOLD)
  })

  it('tungi kirish esa chegaradan o\'tadi', () => {
    const s = scoreEvent(dayStudent(), ev({ hour: 3, ...foreign }))
    expect(s.score).toBeGreaterThanOrEqual(SINGLE_THRESHOLD)
  })

  it('tungi ball kechki balldan yuqori — farqni aynan soat beradi', () => {
    const night   = scoreEvent(dayStudent(), ev({ hour: 3,  ...foreign }))
    const evening = scoreEvent(dayStudent(), ev({ hour: 20, ...foreign }))
    expect(night.score).toBeGreaterThan(evening.score)
    expect(evening.reasons).toContain('NEW_IP')
    expect(night.reasons).toContain('UNUSUAL_HOUR')
  })
})

