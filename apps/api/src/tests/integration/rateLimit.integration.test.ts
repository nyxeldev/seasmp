/**
 * Chegara autentifikatsiyadan OLDIN tekshirilishi kerak.
 *
 * Nega test kerak: `@fastify/rate-limit` global rejimda o'z hookini har bir
 * route'ning mavjud `onRequest` ro'yxati OXIRIGA qo'shadi. Bizning himoyalangan
 * yo'llarimizda u `[app.authenticate]` dan keyin turib qolardi — auth 401
 * qaytarib so'rovni to'xtatardi va chegara umuman tekshirilmasdi. Ya'ni
 * tokensiz trafikni xohlagancha yuborish mumkin edi.
 *
 * Tuzatish: plagin `global: false` bilan ro'yxatdan o'tadi va chegara
 * instance darajasidagi hook sifatida qo'shiladi — u route hooklaridan oldin
 * ishlaydi. Bu testlar aynan shu tartibni qulflaydi.
 */
import { startApp } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

beforeAll(async () => { app = await startApp() })
afterAll(async () => { await app.close() })

describe('Chegara autentifikatsiyadan oldin ishlaydi', () => {
  it('tokensiz so\'rov ham hisobga olinadi — 401 bo\'lsa ham chegara sarlavhalari bor', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/courses' })

    // Auth baribir rad etadi — bu to'g'ri
    expect(res.statusCode).toBe(401)

    // Lekin chegara undan OLDIN ishlagan bo'lishi kerak. Sarlavhaning mavjudligi
    // shuning yagona to'g'ridan-to'g'ri dalili: ular limiter hookida qo'yiladi.
    expect(res.headers).toHaveProperty('x-ratelimit-limit')
    expect(res.headers).toHaveProperty('x-ratelimit-remaining')
  })

  it('tokensiz so\'rovlar hisoblagichni kamaytiradi', async () => {
    const first  = await app.inject({ method: 'GET', url: '/v1/courses' })
    const second = await app.inject({ method: 'GET', url: '/v1/courses' })

    const a = Number(first.headers['x-ratelimit-remaining'])
    const b = Number(second.headers['x-ratelimit-remaining'])

    expect(Number.isFinite(a)).toBe(true)
    expect(b).toBeLessThan(a)
  })

  it('autentifikatsiya talab qilmaydigan yo\'l ham cheklanadi', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.headers).toHaveProperty('x-ratelimit-limit')
  })
})
