#!/usr/bin/env node
/**
 * Prisma CLI uchun .env yuklovchi o'rovchi.
 *
 * Muammo: .env monorepo ildizida, Prisma CLI esa uni faqat joriy papkadan va
 * schema.prisma yonidan qidiradi. `npm run db:migrate --workspace=apps/api`
 * apps/api/ da ishlaydi, shuning uchun DATABASE_URL topilmaydi.
 *
 * Bu skript .env ni yuqoriga qarab qidirib yuklaydi va buyruqni shu muhitda
 * ishga tushiradi. Sirlar ikkinchi nusxaga ko'chirilmaydi.
 *
 * Ishlatish:  node scripts/with-env.js prisma migrate dev
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

function findEnvFile() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = start
    for (let depth = 0; depth < 6; depth++) {
      const candidate = path.join(dir, '.env')
      if (fs.existsSync(candidate)) return candidate
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

const envFile = findEnvFile()
if (envFile) {
  require('dotenv').config({ path: envFile })
  console.log(`[with-env] ${path.relative(process.cwd(), envFile)}`)
} else {
  console.warn('[with-env] .env topilmadi — mavjud muhit o\'zgaruvchilari bilan davom etiladi')
}

const [cmd, ...args] = process.argv.slice(2)
if (!cmd) {
  console.error('[with-env] buyruq berilmadi')
  process.exit(1)
}

spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env })
  .on('exit', (code) => process.exit(code ?? 0))
