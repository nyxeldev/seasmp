import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { z } from 'zod'

/**
 * .env monorepo ildizida turadi — .env.example va docker-compose shunday kutadi.
 * Lekin `npm run dev --workspace=apps/api` jarayonni apps/api/ da boshlaydi va
 * `dotenv/config` faqat joriy papkaga qaraydi, shuning uchun hech narsa yuklanmasdi.
 *
 * Yechim: joriy papkadan va shu fayl joylashgan papkadan yuqoriga qarab birinchi
 * uchragan .env ni yuklash. Docker'da ham, ildizdan ham, workspace'dan ham ishlaydi.
 * Mavjud env o'zgaruvchilari ustiga yozilmaydi — konteyner qiymatlari ustun turadi.
 */
function loadDotenv(): void {
  const starts = [process.cwd()]
  if (typeof __dirname !== 'undefined') starts.push(__dirname)

  for (const start of starts) {
    let dir = start
    for (let depth = 0; depth < 6; depth++) {
      const candidate = path.join(dir, '.env')
      if (fs.existsSync(candidate)) {
        dotenv.config({ path: candidate })
        return
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  dotenv.config()
}

loadDotenv()

const envSchema = z.object({
  NODE_ENV:             z.enum(['development', 'production', 'test']).default('development'),
  API_PORT:             z.coerce.number().default(4000),
  API_HOST:             z.string().default('0.0.0.0'),

  DATABASE_URL:         z.string().url(),

  REDIS_URL:            z.string(),
  /**
   * '1' bo'lsa Redis'ga umuman ulanilmaydi, in-memory nusxa ishlatiladi.
   * Unit testlar uchun: ular tashqi xizmatga bog'liq bo'lmasligi kerak.
   */
  REDIS_IN_MEMORY:      z.string().optional(),

  /**
   * Aniqlash qatlamlarini o'chirish tugmasi ('false' bo'lsa o'chadi).
   *
   * Bu qatlamlar HAR BIR /v1/ so'rovida qo'shimcha ish bajaradi: egalikni
   * aniqlash uchun bitta so'rov, audit yozuvi va bir nechta Redis amali.
   * Ishlab chiqarishda kutilmagan yuk yoki yolg'on ishoralar chiqsa, butun
   * deployni orqaga qaytarmasdan, faqat shu o'zgaruvchi bilan o'chirish
   * mumkin bo'lsin. Audit yozuvi ham to'xtaydi, shuni yodda tuting.
   */
  DETECTION_ENABLED:    z.string().default('true'),

  /**
   * IP bo'yicha daqiqadagi so'rovlar chegarasi. Ilgari kodda 100 deb qotib
   * qolgan edi — yuk testini o'tkazish yoki prod trafikiga moslash uchun
   * har safar kodni o'zgartirish kerak bo'lardi. Standart qiymat o'zgarmadi.
   */
  RATE_LIMIT_MAX:       z.coerce.number().default(100),

  /**
   * API teskari proksi ortida turganda 'true' qilinadi.
   *
   * Nginx X-Forwarded-For yuboradi, lekin Fastify uni ISHONCHSIZ deb hisoblab
   * e'tiborsiz qoldiradi — natijada `request.ip` har doim proksi konteynerining
   * IP si bo'ladi. Bu butun tizimga ta'sir qiladi: chegara barcha foydalanuvchi
   * uchun bitta chelakka tushadi, audit jurnalida haqiqiy IP saqlanmaydi,
   * 2-qatlamning "notanish IP" signali hech qachon ishlamaydi, IP bloklash esa
   * Nginx'ni — ya'ni hammani — bloklaydi.
   *
   * Standart 'false': API to'g'ridan-to'g'ri ochiq bo'lsa, X-Forwarded-For ni
   * mijoz o'zi to'qib, chegarani va IP bo'yicha aniqlashni chetlab o'tardi.
   * Docker'da API faqat ichki tarmoqda, shuning uchun compose'da 'true'.
   */
  TRUST_PROXY:          z.string().default('false'),

  /**
   * ADMIN/TEACHER uchun 2FA majburiyligini o'chiradi ('true' bo'lsa o'chadi).
   *
   * Ilgari bu yagona o'zgaruvchi edi, qolganlari zoddan o'tsa-da, u
   * to'g'ridan-to'g'ri process.env dan o'qilardi. Ya'ni xato yozilgan nom
   * (masalan DISABLE_2FA) jimgina e'tiborsiz qolardi va 2FA kutilmaganda
   * yoqilib turardi. Endi sxemada.
   */
  DISABLE_2FA_REQUIRED: z.string().optional(),

  JWT_ACCESS_SECRET:    z.string().min(32),
  JWT_REFRESH_SECRET:   z.string().min(32),
  JWT_ACCESS_EXPIRES_IN:  z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  AES_ENCRYPTION_KEY:   z.string().length(64), // 32 bytes hex

  CORS_ORIGIN:          z.string().default('http://localhost:3000'),
  ANALYTICS_API_URL:    z.string().url().default('http://localhost:5000'),
  ANALYTICS_INTERNAL_KEY: z.string().default('internal-dev-key-change-in-prod'),

  /**
   * Xato monitoringi. Berilmasa Sentry umuman ishga tushmaydi va xatolar
   * faqat log faylga yoziladi — loyihani ishga tushirish uchun tashqi
   * hisob talab qilinmasligi kerak.
   */
  SENTRY_DSN:     z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),

  // Email (optional — dev can be empty)
  SMTP_HOST:  z.string().optional(),
  SMTP_PORT:  z.string().default('587'),
  SMTP_USER:  z.string().optional(),
  SMTP_PASS:  z.string().optional(),
  EMAIL_FROM: z.string().default('SEASMP <noreply@seasmp.uz>'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ .env xatoligi:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
