import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV:             z.enum(['development', 'production', 'test']).default('development'),
  API_PORT:             z.coerce.number().default(4000),
  API_HOST:             z.string().default('0.0.0.0'),

  DATABASE_URL:         z.string().url(),

  REDIS_URL:            z.string(),

  JWT_ACCESS_SECRET:    z.string().min(32),
  JWT_REFRESH_SECRET:   z.string().min(32),
  JWT_ACCESS_EXPIRES_IN:  z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  AES_ENCRYPTION_KEY:   z.string().length(64), // 32 bytes hex

  CORS_ORIGIN:          z.string().default('http://localhost:3000'),
  ANALYTICS_API_URL:    z.string().url().default('http://localhost:5000'),
  ANALYTICS_INTERNAL_KEY: z.string().default('internal-dev-key-change-in-prod'),

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
