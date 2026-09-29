/**
 * Slug yasash — URL'da UUID o'rniga o'qilishi mumkin bo'lgan manzil.
 * Sof funksiya, bazasiz ishlaydi.
 */
import { slugify, uniqueSlug } from '../../lib/slug'

describe('slugify', () => {
  it('oddiy sarlavha', () => {
    expect(slugify('Web dasturlash asoslari')).toBe('web-dasturlash-asoslari')
  })

  it('o\'zbek apostrofi olib tashlanadi, harf qoladi', () => {
    // Bu eng muhim holat: "o'quv" -> "o-quv" bo'lib qolsa manzil xunuk chiqadi
    expect(slugify("Ma'lumotlar bazasi")).toBe('malumotlar-bazasi')
    expect(slugify("O'quv qo'llanma")).toBe('oquv-qollanma')
  })

  it('apostrofning turli ko\'rinishlari bir xil natija beradi', () => {
    const variants = ["O'zbek", 'O‘zbek', 'O’zbek', 'Oʻzbek']
    for (const v of variants) expect(slugify(v)).toBe('ozbek')
  })

  it('qavslar va tinish belgilari chiziqchaga aylanadi', () => {
    expect(slugify('Ingliz tili (A2-B1)')).toBe('ingliz-tili-a2-b1')
  })

  it('kirill transliteratsiya qilinadi', () => {
    expect(slugify('Математика')).toBe('matematika')
    expect(slugify('Ўзбек тили')).toBe('ozbek-tili')
  })

  it('chetlarda va o\'rtada ortiqcha chiziqcha qolmaydi', () => {
    expect(slugify('  ---Kurs???nomi---  ')).toBe('kurs-nomi')
  })

  it('bo\'sh yoki faqat belgidan iborat sarlavha bo\'sh satr beradi', () => {
    expect(slugify('!!!')).toBe('')
    expect(slugify('')).toBe('')
  })

  it('juda uzun sarlavha kesiladi va chiziqcha bilan tugamaydi', () => {
    const s = slugify('a'.repeat(50) + ' ' + 'b'.repeat(50))
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s.endsWith('-')).toBe(false)
  })
})

describe('uniqueSlug', () => {
  it('band bo\'lmasa asosiy slug qaytadi', async () => {
    const taken = new Set<string>()
    const s = await uniqueSlug('Web dasturlash', async (x) => taken.has(x))
    expect(s).toBe('web-dasturlash')
  })

  it('band bo\'lsa raqam qo\'shiladi', async () => {
    const taken = new Set(['web-dasturlash', 'web-dasturlash-2'])
    const s = await uniqueSlug('Web dasturlash', async (x) => taken.has(x))
    expect(s).toBe('web-dasturlash-3')
  })

  it('sarlavhadan slug chiqmasa ham yaroqli qiymat qaytadi', async () => {
    const s = await uniqueSlug('???', async () => false)
    expect(s).toBe('kurs')
  })
})
