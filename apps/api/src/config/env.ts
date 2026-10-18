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

/**
 * Dev/test uchun qulay standart — lekin production'da bu qiymat qolib
 * ketishi /v1/internal/* ni ochiq siri qiladi (quyidagi superRefine buni
 * rad etadi).
 */
const DEFAULT_ANALYTICS_INTERNAL_KEY = 'internal-dev-key-change-in-prod'

const envSchema = z.object({
  NODE_ENV:             z.enum(['development', 'production', 'test']).default('development'),
  API_PORT:             z.coerce.number().default(4000),
  API_HOST:             z.string().default('0.0.0.0'),

  DATABASE_URL:         z.string().url(),

  /**
   * Prisma ulanish puli — ilgari hech qayerda sozlanmagan edi, Prisma
   * o'zining ichki standartiga (taxminan CPU soni * 2 + 1) tayanardi.
   * Standart qiymatlar Prisma'ning o'z standartlariga teng — birortasi
   * o'zgarmaydi, faqat endi aniq va muhit o'zgaruvchisi bilan sozlanadigan.
   * Joriy arxitektura — bitta API nusxasi — uchun 10 ulanish etarli va
   * Postgres'ning max_connections=100'idan ancha past (analytics puli
   * bilan bir vaqtda ham joy qoladi).
   */
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
  DATABASE_POOL_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10),
  /**
   * Bitta so'rov Postgres'da necha sekund davom etishiga ruxsat — osilib
   * qolgan/sekin so'rov ulanishni abadiy band qilib qolmasligi uchun.
   * postgresql.conf'ning o'zi o'zgartirilmaydi: bu qiymat har bir Prisma
   * ulanishiga ulanish satrining `options=-c statement_timeout=...` orqali
   * uzatiladi (config/prisma.ts), ya'ni faqat shu ilova ulanishlariga
   * tegishli, butun baza konfiguratsiyasiga emas.
   */
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

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

  /**
   * Yuklangan fayllar (masalan, avatarlar) qayerga yoziladi. Nisbiy yo'l
   * process.cwd() ga nisbatan hal qilinadi — dev'da ham, Docker'da ham
   * (Dockerfile WORKDIR /app/apps/api) bir xil joyga tushadi. Docker'da bu
   * papka alohida volume'ga ulanadi, aks holda konteyner qayta tiklanganda
   * fayllar yo'qoladi.
   */
  UPLOAD_DIR:           z.string().default('uploads'),

  CORS_ORIGIN:          z.string().default('http://localhost:3000'),
  ANALYTICS_API_URL:    z.string().url().default('http://localhost:5000'),
  ANALYTICS_INTERNAL_KEY: z.string().default(DEFAULT_ANALYTICS_INTERNAL_KEY),

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
}).superRefine((data, ctx) => {
  // Production'da ANALYTICS_INTERNAL_KEY hali ham ma'lum dev-standart
  // qiymatda qolishi mumkin emas — bu /v1/internal/* ni istalgan kishi
  // ochiq manbadan o'qib, bir xil sarlavha bilan chaqira olishiga olib
  // keladi (H1). Qiymatning o'zi xato xabariga chiqarilmaydi.
  if (data.NODE_ENV === 'production' && data.ANALYTICS_INTERNAL_KEY === DEFAULT_ANALYTICS_INTERNAL_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ANALYTICS_INTERNAL_KEY'],
      message: 'Production muhitida ANALYTICS_INTERNAL_KEY standart (dev) qiymatda qolishi mumkin emas — .env da haqiqiy, maxfiy qiymat o\'rnating.',
    })
  }
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ .env xatoligi:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
