/**
 * MANUAL egalik qoidalari — Bosqich A.
 *
 * Bu qoidalar ilgari faqat ishchi (dev) bazada, qo'lda (Prisma Studio
 * yoki to'g'ridan-to'g'ri SQL orqali) kiritilgan edi — reponing HECH BIR
 * joyida (seed, migratsiya) yozilmagan. Natijada toza o'rnatishda
 * `ownership_rules` bo'sh qoladi va butun 1-qatlam (avtorizatsiya
 * aniqlash) jimgina ishlamay qoladi (`resolveAccess()` qoida topa
 * olmasa UNKNOWN qaytaradi).
 *
 * Bu fayl ishchi bazada 2026-09-30 holatiga ko'ra topilgan 9 ta qoidani
 * aynan takrorlaydi — hech narsa o'ylab topilmagan, faqat mavjud holat
 * kodga ko'chirilgan.
 *
 * Bosqich B (`inferOwnership.ts`) uchun bu — tekshirish ro'yxati: algoritm
 * trafikdan mustaqil ishlab, aynan shu 9 ta qoidani (yoki ularga teng
 * ishonchli muqobillarini) qayta kashf eta oladimi?
 *
 * Ishlatish: npm run db:seed:ownership --workspace=apps/api
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const RULES: { resourceType: string; ownerPath: string; role: 'OWNER' | 'CUSTODIAN' }[] = [
  { resourceType: 'users',       ownerPath: 'id',                         role: 'OWNER' },
  { resourceType: 'courses',     ownerPath: 'teacherId',                  role: 'CUSTODIAN' },
  { resourceType: 'enrollments', ownerPath: 'studentId',                  role: 'OWNER' },
  { resourceType: 'enrollments', ownerPath: 'course.teacherId',           role: 'CUSTODIAN' },
  { resourceType: 'attendance',  ownerPath: 'enrollment.studentId',       role: 'OWNER' },
  { resourceType: 'attendance',  ownerPath: 'enrollment.course.teacherId',role: 'CUSTODIAN' },
  { resourceType: 'assessments', ownerPath: 'course.teacherId',           role: 'CUSTODIAN' },
  { resourceType: 'grades',      ownerPath: 'enrollment.studentId',       role: 'OWNER' },
  { resourceType: 'grades',      ownerPath: 'enrollment.course.teacherId',role: 'CUSTODIAN' },
]

async function main() {
  for (const r of RULES) {
    await prisma.ownershipRule.upsert({
      where: { resourceType_ownerPath: { resourceType: r.resourceType, ownerPath: r.ownerPath } },
      update: {},
      create: { ...r, source: 'MANUAL', active: true },
    })
    console.log(`  ${r.resourceType.padEnd(14)} ${r.ownerPath.padEnd(28)} ${r.role}`)
  }
  console.log(`\n${RULES.length} ta MANUAL qoida tayyor.`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
