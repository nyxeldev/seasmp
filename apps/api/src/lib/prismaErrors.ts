import { Prisma } from '@prisma/client'

/**
 * FK (xorijiy kalit) cheklovi buzilishiga mos Postgres SQLSTATE kodlari.
 *
 * - 23503 = foreign_key_violation — Prisma odatda buni o'zining P2003
 *   kodiga tarjima qiladi (`PrismaClientKnownRequestError`).
 * - 23001 = restrict_violation — aniq `ON DELETE RESTRICT` kalit so'zi
 *   bilan yaratilgan cheklov shu alohida SQLSTATE klassini qaytaradi.
 *   Prisma'ning P2003 xaritasi faqat 23503'ni qamraydi, shuning uchun bu
 *   holat P2003 EMAS, balki `PrismaClientUnknownRequestError` sifatida
 *   ko'tariladi (runtime'da real baza bilan tekshirilgan — dalil:
 *   PROJECT_CONTEXT audit hisobotidagi "Known Integration Failure" bo'limi).
 */
const FK_VIOLATION_SQLSTATES = new Set(['23503', '23001'])

/**
 * `PrismaClientUnknownRequestError.message` ichidagi haydovchi xato
 * matnida joylashgan `PostgresError { code: "XXXXX", ... }` qismidan
 * SQLSTATE kodini ajratib oladi.
 *
 * Bu — Prisma ushbu xato turi uchun beradigan YAGONA strukturaviy signal:
 * `.code`, `.meta` kabi maydonlar bu sinfda umuman mavjud emas (faqat
 * `stack`, `message`, `clientVersion`, `batchRequestIdx`, `name` — runtime
 * tekshiruvida tasdiqlangan). Shuning uchun matndan SQLSTATE'ni, matnning
 * o'zini erkin qidirish (masalan "RESTRICT" so'zini) emas, aynan shu
 * strukturaviy qismni olish ishonchliroq.
 */
function extractPostgresSqlState(message: string): string | null {
  const match = message.match(/PostgresError\s*\{[^}]*\bcode:\s*"(\d{5})"/)
  return match ? match[1] : null
}

/**
 * Berilgan xato — FK RESTRICT/NO ACTION cheklovi buzilishi natijasidan
 * kelganmi, ikkala shaklni ham qamrab tekshiradi:
 *
 *  1. `PrismaClientKnownRequestError` + `code === 'P2003'` — Prisma o'zi
 *     to'g'ri tarjima qilgan odatiy holat.
 *  2. `PrismaClientUnknownRequestError`, ichidagi matnda SQLSTATE 23001
 *     yoki 23503 bo'lgan holat — Prisma tarjima qilmagan, lekin baribir
 *     xuddi shu turdagi DB nosozligi.
 *
 * Boshqa har qanday xato (bog'liq bo'lmagan DB nosozligi, boshqa SQLSTATE,
 * boshqa Prisma xato turi) uchun `false` qaytaradi — ular umumiy xato
 * sifatida qoladi va noto'g'ri 409'ga aylanmaydi.
 */
export function isForeignKeyRestrictError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P2003'
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    const sqlState = extractPostgresSqlState(err.message)
    return sqlState !== null && FK_VIOLATION_SQLSTATES.has(sqlState)
  }
  return false
}
