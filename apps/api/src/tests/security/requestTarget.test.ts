/**
 * So'rov yo'lidan obyektni ajratish va FOREIGN ogohlantirish qarori —
 * 1-qatlamning sof mantiqi. Bazasiz ishlaydi.
 */
import { targetFromPath, shouldRaiseForeign } from '../../services/requestAudit'

const CID = 'c1111111-1111-1111-1111-111111111111'
const EID = 'e2222222-2222-2222-2222-222222222222'

describe('targetFromPath — resurs turi va ID bitta juftlikdan olinadi', () => {
  it('oddiy obyekt yo\'li', () => {
    expect(targetFromPath(`/v1/courses/${CID}`)).toEqual({ resource: 'courses', resourceId: CID })
  })

  it('ichma-ich yo\'lda oxirgi juftlik olinadi — tur ham, ID ham', () => {
    // Ilgari bu yerda resource="courses", id=EID chiqib, mos kelmaydigan
    // course.findUnique(EID) so'rovi jimgina UNKNOWN qaytarardi.
    expect(targetFromPath(`/v1/courses/${CID}/enrollments/${EID}`)).toEqual({
      resource: 'enrollments', resourceId: EID,
    })
  })

  it('ichki to\'plam ro\'yxati — ota obyekt maqsad bo\'lib qoladi', () => {
    expect(targetFromPath(`/v1/courses/${CID}/enrollments`)).toEqual({
      resource: 'courses', resourceId: CID,
    })
  })

  it('to\'plam yo\'lida ID bo\'lmaydi', () => {
    expect(targetFromPath('/v1/courses')).toEqual({ resource: 'courses' })
  })

  it('UUID bo\'lmagan segment ID sifatida olinmaydi', () => {
    expect(targetFromPath('/v1/users/me')).toEqual({ resource: 'users' })
  })

  it('noma\'lum yo\'l yiqilmaydi', () => {
    expect(targetFromPath('/')).toEqual({ resource: 'unknown' })
  })
})

describe('shouldRaiseForeign — qaysi FOREIGN haqiqiy zaiflik', () => {
  const owned   = { relation: 'FOREIGN' as const, hasOwnerRule: true }
  const shared  = { relation: 'FOREIGN' as const, hasOwnerRule: false }

  it('egasi bor obyektni begona o\'qishi — IDOR, ogohlantiriladi', () => {
    expect(shouldRaiseForeign(owned, 'GET', false)).toBe(true)
  })

  it('umumiy katalogni o\'qish — normal holat, ogohlantirilmaydi', () => {
    expect(shouldRaiseForeign(shared, 'GET', false)).toBe(false)
  })

  it('umumiy katalogni begona O\'ZGARTIRISHI — baribir zaiflik', () => {
    expect(shouldRaiseForeign(shared, 'PATCH', false)).toBe(true)
    expect(shouldRaiseForeign(shared, 'DELETE', false)).toBe(true)
  })

  it('rad etilgan so\'rov FOREIGN ogohlantirishi emas — himoya ishlagan', () => {
    expect(shouldRaiseForeign(owned, 'GET', true)).toBe(false)
  })

  it('FOREIGN bo\'lmagan munosabatlar ogohlantirilmaydi', () => {
    for (const relation of ['SELF', 'OWNER', 'CUSTODIAN', 'PRIVILEGED', 'UNKNOWN'] as const) {
      expect(shouldRaiseForeign({ relation, hasOwnerRule: true }, 'DELETE', false)).toBe(false)
    }
  })
})
