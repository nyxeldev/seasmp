import bcrypt from 'bcryptjs'
import { authenticator } from 'otplib'
import * as QRCode from 'qrcode'
import * as crypto from 'crypto'
import { prisma } from '../config/prisma'
import { redis } from '../config/redis'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { auditService } from './audit.service'
import { emailService } from './emailService'
import {
  checkIpBlocked,
  recordFailedLogin,
  resetLoginAttempts,
  checkUnusualHour,
  checkMultiDevice,
  removeSessionIp,
  flagRefreshTokenReuse,
} from './securityMonitor'
import { securityService } from './security.service'
import type { User } from '@prisma/client'
import * as jwt from 'jsonwebtoken'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface LoginResult {
  requiresTwoFactor:    boolean
  requiresTwoFactorSetup?: boolean  // ADMIN/TEACHER must set up 2FA
  twoFactorToken?:      string
  tokens?:              TokenPair
  user?:                SafeUser
}

export type SafeUser = Omit<User, 'passwordHash' | 'twoFactorSecret'>

// ─── Encryption helpers ───────────────────────────────────────────────────────
const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(env.AES_ENCRYPTION_KEY, 'hex')

function encrypt(text: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(encoded: string): string {
  const [ivHex, authTagHex, encryptedHex] = encoded.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────
function generateAccessToken(userId: string, role: string): string {
  return jwt.sign(
    { sub: userId, role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any }
  )
}

function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex')
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ─── Backup code helpers ──────────────────────────────────────────────────────
function formatBackupCode(raw: string): string {
  // Format as XXXX-XXXX
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`.toUpperCase()
}

async function generateBackupCodes(userId: string): Promise<string[]> {
  // Delete any existing codes
  await prisma.backupCode.deleteMany({ where: { userId } })

  const codes: string[] = []
  const dbEntries = []

  for (let i = 0; i < 10; i++) {
    const raw = crypto.randomBytes(4).toString('hex') // 8 hex chars
    const code = formatBackupCode(raw)
    const hash = await bcrypt.hash(code, 10)
    codes.push(code)
    dbEntries.push({ userId, codeHash: hash })
  }

  await prisma.backupCode.createMany({ data: dbEntries })
  return codes
}

// ─── M3: timing-based user-enumeration himoyasi ────────────────────────────────
//
// Ilgari: foydalanuvchi topilmasa, bcrypt.compare UMUMAN chaqirilmasdi —
// darhol 401. Topilgan bo'lsa, haqiqiy hesh bilan compare ishga tushardi
// (bcryptjs'da ~o'nlab millisekund, cost=12). Bu ikki yo'l orasidagi javob
// vaqti farqi email ro'yxatdan o'tganini sezilarli darajada aniq aytib
// berardi (klassik timing-based enumeration).
//
// Yechim: hisob topilmasa ham, xuddi shu xarajat omili (12) bilan
// oldindan tayyorlangan "qo'g'irchoq" hesh bilan bitta bcrypt.compare
// baribir bajariladi — natija hech qachon ishlatilmaydi (har doim false),
// faqat vaqt bo'yicha mavjud-foydalanuvchi yo'liga o'xshash bo'lishi uchun.
// Qiymatning o'zi tasodifiy va ma'nosiz — bu parol emas, faqat vaqt
// profilini tenglashtirish uchun.
let dummyPasswordHashPromise: Promise<string> | null = null
function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)
  }
  return dummyPasswordHashPromise
}

// ─── Auth Service ─────────────────────────────────────────────────────────────
export const authService = {

  async login(
    email: string,
    password: string,
    ipAddress: string,
    userAgent: string
  ): Promise<LoginResult> {
    // 1. IP block check (centralized)
    await checkIpBlocked(ipAddress)

    // 2. Foydalanuvchi qidirish
    const user = await prisma.user.findUnique({ where: { email } })

    // 3. Parol tekshirish — foydalanuvchi topilmagan bo'lsa ham, bitta
    // bcrypt.compare (xuddi shu xarajat omili bilan) baribir bajariladi.
    // Natija darhol tashlab yuborilmaydi: quyidagi shartda ishlatiladi,
    // lekin hisob topilmagan/faol bo'lmagan holatda uning qiymati
    // ahamiyatsiz (har doim false bo'ladi).
    const isPasswordValid = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, await getDummyPasswordHash())

    if (!user || !user.isActive || !isPasswordValid) {
      await recordFailedLogin(ipAddress, user?.id ?? null)
      await auditService.log({
        userId: user?.id ?? null,
        action: 'LOGIN_FAILED',
        resource: 'users',
        ipAddress,
        userAgent,
      })
      throw Object.assign(new Error("Email yoki parol noto'g'ri"), { statusCode: 401 })
    }

    // 4. Muvaffaqiyatli — attempt counter reset
    await resetLoginAttempts(ipAddress)

    // 5. ADMIN/TEACHER — 2FA majburiy (production only)
    const must2FA = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'TEACHER'
    const twoFAEnforced = env.DISABLE_2FA_REQUIRED !== 'true'
    if (must2FA && !user.twoFactorEnabled && twoFAEnforced) {
      // Return flag that frontend should redirect to 2FA setup
      const setupToken = crypto.randomBytes(32).toString('hex')
      await redis.setex(`2fa_setup_required:${setupToken}`, 600, user.id)
      return { requiresTwoFactor: false, requiresTwoFactorSetup: true, twoFactorToken: setupToken }
    }

    // 6. 2FA tekshirish (skip in dev mode)
    if (user.twoFactorEnabled && twoFAEnforced) {
      const twoFactorToken = crypto.randomBytes(32).toString('hex')
      await redis.setex(`2fa_pending:${twoFactorToken}`, 300, user.id)
      return { requiresTwoFactor: true, twoFactorToken }
    }

    // 7. To'g'ridan-to'g'ri token (Student, 2FA yo'q)
    const tokens = await this._createTokenPair(user.id, user.role, ipAddress, userAgent)

    await auditService.log({ userId: user.id, action: 'LOGIN', resource: 'users', ipAddress, userAgent })
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await checkMultiDevice(user.id, ipAddress)
    await checkUnusualHour(user.id, user.role, ipAddress)

    return { requiresTwoFactor: false, tokens, user: this._safeUser(user) }
  },

  async verifyTwoFactor(
    twoFactorToken: string,
    code: string,
    ipAddress: string,
    userAgent: string
  ): Promise<LoginResult> {
    const userId = await redis.get(`2fa_pending:${twoFactorToken}`)
    if (!userId) {
      throw Object.assign(new Error("2FA token muddati tugagan yoki noto'g'ri"), { statusCode: 401 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.twoFactorSecret) {
      throw Object.assign(new Error('2FA sozlanmagan'), { statusCode: 400 })
    }

    const secret = decrypt(user.twoFactorSecret)
    const isValid = authenticator.verify({ token: code, secret })

    if (!isValid) {
      throw Object.assign(new Error("2FA kodi noto'g'ri"), { statusCode: 401 })
    }

    await redis.del(`2fa_pending:${twoFactorToken}`)

    const tokens = await this._createTokenPair(user.id, user.role, ipAddress, userAgent)

    await auditService.log({ userId: user.id, action: 'LOGIN', resource: 'users', ipAddress, userAgent })
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await checkMultiDevice(user.id, ipAddress)
    await checkUnusualHour(user.id, user.role, ipAddress)

    return { requiresTwoFactor: false, tokens, user: this._safeUser(user) }
  },

  async verifyBackupCode(
    twoFactorToken: string,
    backupCode: string,
    ipAddress: string,
    userAgent: string
  ): Promise<LoginResult> {
    const userId = await redis.get(`2fa_pending:${twoFactorToken}`)
    if (!userId) {
      throw Object.assign(new Error("Token muddati tugagan yoki noto'g'ri"), { statusCode: 401 })
    }

    const codes = await prisma.backupCode.findMany({
      where: { userId, usedAt: null },
    })

    let matchedCode: typeof codes[0] | null = null
    for (const c of codes) {
      if (await bcrypt.compare(backupCode.toUpperCase(), c.codeHash)) {
        matchedCode = c
        break
      }
    }

    if (!matchedCode) {
      throw Object.assign(new Error("Backup kod noto'g'ri yoki ishlatilgan"), { statusCode: 401 })
    }

    // Mark as used (one-time)
    await prisma.backupCode.update({
      where: { id: matchedCode.id },
      data: { usedAt: new Date() },
    })

    await redis.del(`2fa_pending:${twoFactorToken}`)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    const tokens = await this._createTokenPair(user.id, user.role, ipAddress, userAgent)

    await auditService.log({ userId: user.id, action: 'BACKUP_CODE_USED', resource: 'users', ipAddress, userAgent })
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    return { requiresTwoFactor: false, tokens, user: this._safeUser(user) }
  },

  async refresh(refreshToken: string, ipAddress: string, userAgent: string): Promise<TokenPair> {
    const tokenHash = hashToken(refreshToken)

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })

    if (!storedToken || storedToken.expiresAt < new Date()) {
      // M4: rotatsiya qattiq o'chirish bilan ishlaydi (pastda) — qator
      // o'chirilgandan keyin bazada hech qanday iz qolmaydi, shuning uchun
      // "allaqachon ishlatilgan (o'g'irlangan) token qayta taqdim etildi"
      // holatini bazadan farqlab bo'lmaydi. Shu farq uchun Redis'da
      // qisqa muddatli "shu hash yaqinda rotatsiya qilindi" belgisi
      // qoldiriladi (pastda, muvaffaqiyatli rotatsiya chog'ida) — agar
      // o'sha belgi topilsa, bu haqiqiy qayta ishlatish: tokenning o'zi
      // haqiqiy edi, lekin allaqachon ISHLATILGAN. Oddiy muddati tugagan/
      // soxta token uchun bu belgi hech qachon qo'yilmagan bo'ladi.
      const reusedUserId = await redis.get(`refresh_used:${tokenHash}`)
      if (reusedUserId) {
        await flagRefreshTokenReuse(reusedUserId, ipAddress)
        await securityService.revokeAllSessions(reusedUserId)
        await auditService.log({
          userId: reusedUserId, action: 'ACCESS_DENIED', resource: 'refresh_tokens', ipAddress, userAgent,
        })
      }
      throw Object.assign(new Error('Refresh token yaroqsiz yoki muddati tugagan'), { statusCode: 401 })
    }

    if (!storedToken.user.isActive) {
      throw Object.assign(new Error("Akkaunt faol emas"), { statusCode: 401 })
    }

    // Shu hashni "yaqinda rotatsiya qilindi" deb belgilaymiz — qolgan
    // umr muddati bilan (undan keyin bu tokenning o'zi allaqachon
    // haqiqiy TTL'dan o'tgan bo'lardi, demak qayta ishlatish ham ortiq
    // signal emas). Bu DB'dan o'chirishdan OLDIN qo'yiladi: shu tartibda
    // qisqa oraliqda ikkinchi so'rov kelsa, u baribir yo haqiqiy qatorni
    // (hali o'chirilmagan) topadi, yo belgini — hech qachon ikkisini ham
    // yo'qotib qo'ymaydi.
    const ttlSeconds = Math.max(1, Math.ceil((storedToken.expiresAt.getTime() - Date.now()) / 1000))
    await redis.setex(`refresh_used:${tokenHash}`, ttlSeconds, storedToken.userId)

    await prisma.refreshToken.delete({ where: { tokenHash } })
    return this._createTokenPair(storedToken.user.id, storedToken.user.role, ipAddress, userAgent)
  },

  async logout(refreshToken: string, userId: string, ipAddress: string): Promise<void> {
    const tokenHash = hashToken(refreshToken)
    await prisma.refreshToken.deleteMany({ where: { tokenHash } })
    await removeSessionIp(userId, ipAddress)
    await auditService.log({ userId, action: 'LOGOUT', resource: 'users', ipAddress })
  },

  async setup2FA(userId: string): Promise<{ qrCodeUrl: string; secret: string; backupCodes: string[] }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

    const secret = authenticator.generateSecret()
    const otpauthUrl = authenticator.keyuri(user.email, 'SEASMP', secret)
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl)

    // Temp store until confirmed
    await redis.setex(`2fa_setup:${userId}`, 600, encrypt(secret))

    // Pre-generate backup codes but DON'T save yet (save on confirm)
    const tempCodes: string[] = []
    for (let i = 0; i < 10; i++) {
      const raw = crypto.randomBytes(4).toString('hex')
      tempCodes.push(formatBackupCode(raw))
    }
    await redis.setex(`2fa_backup_preview:${userId}`, 600, JSON.stringify(tempCodes))

    return { qrCodeUrl, secret, backupCodes: tempCodes }
  },

  async confirm2FA(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const encryptedSecret = await redis.get(`2fa_setup:${userId}`)
    if (!encryptedSecret) {
      throw Object.assign(new Error('2FA setup muddati tugagan'), { statusCode: 400 })
    }

    const secret = decrypt(encryptedSecret)
    const isValid = authenticator.verify({ token: code, secret })

    if (!isValid) {
      throw Object.assign(new Error("Kod noto'g'ri"), { statusCode: 400 })
    }

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorSecret: encrypt(secret) },
    })

    const backupCodes = await generateBackupCodes(userId)
    await redis.del(`2fa_setup:${userId}`)
    await redis.del(`2fa_backup_preview:${userId}`)

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, lastName: true } })
    if (user) emailService.send2FAEnabled(user.email, `${user.firstName} ${user.lastName}`).catch(() => {})

    await auditService.log({ userId, action: 'TWO_FA_SETUP', resource: 'users', ipAddress: 'system' })

    return { backupCodes }
  },

  async disable2FA(
    userId: string,
    actorId: string,
    actorRole: string,
    password?: string
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

    if (actorId === userId) {
      // Self — must confirm password
      if (!password) throw Object.assign(new Error('Parol talab qilinadi'), { statusCode: 400 })
      const ok = await bcrypt.compare(password, user.passwordHash)
      if (!ok) throw Object.assign(new Error("Parol noto'g'ri"), { statusCode: 401 })
    } else if (actorRole !== 'SUPER_ADMIN') {
      throw Object.assign(new Error("Faqat Super Admin boshqa foydalanuvchining 2FA sini o'chira oladi"), { statusCode: 403 })
    }

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    })
    await prisma.backupCode.deleteMany({ where: { userId } })

    await auditService.log({ userId: actorId, action: 'TWO_FA_DISABLE', resource: 'users', resourceId: userId, ipAddress: 'system' })
  },

  // ─── Private helpers ────────────────────────────────────────────────────────
  async _createTokenPair(
    userId: string,
    role: string,
    ipAddress: string,
    userAgent: string
  ): Promise<TokenPair> {
    const accessToken = generateAccessToken(userId, role)
    const refreshToken = generateRefreshToken()
    const tokenHash = hashToken(refreshToken)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.refreshToken.create({
      data: { userId, tokenHash, ipAddress, userAgent, expiresAt },
    })

    return { accessToken, refreshToken }
  },

  _safeUser(user: User): SafeUser {
    const { passwordHash, twoFactorSecret, ...safe } = user
    return safe
  },
}
