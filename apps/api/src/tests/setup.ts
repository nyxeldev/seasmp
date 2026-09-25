/**
 * Unit testlar muhiti. Modullar import qilinishidan OLDIN ishlaydi.
 *
 * Qoida: unit testlar hech qanday tashqi xizmatga ulanmaydi. Baza va Redis
 * mock qilinadi, shuning uchun bu yerdagi qiymatlar faqat zod validatsiyasini
 * qanoatlantirish uchun kerak.
 *
 * Ilgari bu yerda haqiqiy dev parollari qattiq yozilgan edi. Ular eskirdi va
 * ikkita zarar keltirdi: har test yugurishida Redis WRONGPASS xatolari
 * `logs/audit.log` ga to'kilardi, hamda mock unutilgan test jimgina HAQIQIY
 * bazaga yozib yuborishi mumkin edi. Endi manzillar ataylab ishlamaydigan
 * qilingan — bunday xato darhol ko'rinadi.
 */
process.env.NODE_ENV             = 'test'
process.env.REDIS_IN_MEMORY      = '1'

// Port 1 — hech qachon ochilmaydi. Mock unutilsa, test tarmoqqa chiqmasdan yiqiladi.
process.env.DATABASE_URL         = 'postgresql://unit-test:unused@127.0.0.1:1/unused'
process.env.REDIS_URL            = 'redis://127.0.0.1:1'

process.env.JWT_ACCESS_SECRET    = 'test-access-secret-that-is-long-enough-for-zod'
process.env.JWT_REFRESH_SECRET   = 'test-refresh-secret-that-is-long-enough-for-zod'
process.env.AES_ENCRYPTION_KEY   = 'b7dcb02c6342b24134b3a09db4d897c16df22aa9034a757d4d0028118159a756'
process.env.DISABLE_2FA_REQUIRED = 'false'
