import winston from 'winston'
import * as fs from 'fs'

const { combine, timestamp, json, colorize, printf, errors } = winston.format
const isProd = process.env.NODE_ENV === 'production'

// Ensure logs directory exists
if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true })

/**
 * Kodda log chaqiruvlari `logger.warn({ msg: '...', userId, count })` ko'rinishida
 * yoziladi — ya'ni `message` maydoniga OBYEKT tushadi.
 *
 * Winston bunday obyektni satrga aylantirmaydi: konsolda `[object Object]`
 * chiqardi va diagnostika ko'r bo'lib qolardi. Faylda esa maydonlar
 * `{"message":{"msg":"...","userId":"..."}}` ko'rinishida ichkarida qolib,
 * `jq` yoki grep bilan qidirishni qiyinlashtirardi.
 *
 * Bu format `msg` ni yuqoriga — standart `message` maydoniga ko'taradi,
 * qolgan maydonlarni esa yozuvning o'ziga yoyadi. Natijada ikkala chiqish ham
 * bir xil, oddiy tuzilishga ega bo'ladi.
 */
const hoistMessage = winston.format((info) => {
  const raw = info.message as unknown
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const { msg, message, ...rest } = raw as Record<string, unknown>
    const headline = msg ?? message
    // Sarlavha yo'q bo'lsa uni to'qib chiqarmaymiz: maydonlarning o'zi
    // yozuvni ifodalaydi, JSON nusxasi esa ularni takrorlagan bo'lardi.
    info.message = typeof headline === 'string' ? headline : ''
    Object.assign(info, rest)
  }
  return info
})

/** Winston o'zi qo'shadigan maydonlar — ular alohida chiqariladi */
const RESERVED = new Set(['level', 'message', 'timestamp', 'stack', 'splat'])

function renderValue(v: unknown): string {
  if (typeof v === 'string') return /[\s"]/.test(v) ? JSON.stringify(v) : v
  if (v === null || v === undefined || typeof v !== 'object') return String(v)
  return JSON.stringify(v)
}

/** Odam o'qiydigan bir qatorli format: `12:34:56.789 warn: sarlavha  kalit=qiymat` */
const humanReadable = printf((info) => {
  const ts = typeof info.timestamp === 'string' ? info.timestamp.slice(11, 23) : ''

  const fields = Object.entries(info)
    .filter(([k, v]) => !RESERVED.has(k) && v !== undefined)
    .map(([k, v]) => `${k}=${renderValue(v)}`)

  const body = [info.message, fields.join(' ')].filter(Boolean).join('  ')
  // Stek faqat xatolarda bo'ladi — uni alohida qatorda ko'rsatamiz
  const stack = typeof info.stack === 'string' ? `\n${info.stack}` : ''

  return `${ts} ${info.level}: ${body}${stack}`
})

export const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  // errors({ stack: true }) — `logger.error(err)` chaqirilganda stek yo'qolmasin
  // (server.ts dagi bootstrap xatosi aynan shunday yoziladi).
  format: combine(errors({ stack: true }), hoistMessage(), timestamp(), json()),
  transports: [
    // Console
    new winston.transports.Console({
      format: isProd ? json() : combine(colorize(), humanReadable),
    }),
    // Audit log file (always on — JSON lines, human-readable)
    new winston.transports.File({
      filename: 'logs/audit.log',
      maxsize:  10 * 1024 * 1024, // 10 MB
      maxFiles: 7,
      tailable: true,
    }),
    // Error log
    new winston.transports.File({
      filename: 'logs/error.log',
      level:    'error',
      maxsize:  5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
})
