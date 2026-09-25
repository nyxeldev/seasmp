/**
 * Integration testlar muhiti — bular HAQIQIY baza va Redis bilan ishlaydi.
 *
 * Sirlar bu yerda takrorlanmaydi: loyihaning `.env` i yuklanadi. Ilgari
 * ma'lumotlar qattiq yozilgan edi va `.env` yangilanganda eskirib qolardi —
 * testlar esa tushunarsiz autentifikatsiya xatolari bilan yiqilardi.
 *
 * Alohida baza ishlatmoqchi bo'lsangiz `TEST_DATABASE_URL` ni bering.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'

/** `.env` monorepo ildizida — joriy papkadan yuqoriga qarab qidiriladi */
function findEnvFile(): string | null {
  let dir = __dirname
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(dir, '.env')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const envFile = findEnvFile()
if (envFile) {
  dotenv.config({ path: envFile })
} else {
  console.warn('[test] .env topilmadi — integration testlar mavjud muhit o\'zgaruvchilari bilan ishlaydi')
}

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
}

process.env.NODE_ENV             = 'test'
process.env.DISABLE_2FA_REQUIRED = 'false'

// Integration testlar haqiqiy Redis'ni tekshiradi — in-memory nusxa emas
delete process.env.REDIS_IN_MEMORY
