import winston from 'winston'
import * as fs from 'fs'

const { combine, timestamp, json, colorize, simple } = winston.format
const isProd = process.env.NODE_ENV === 'production'

// Ensure logs directory exists
if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true })

export const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: combine(timestamp(), json()),
  transports: [
    // Console
    new winston.transports.Console({
      format: isProd ? combine(timestamp(), json()) : combine(colorize(), simple()),
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
