import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import * as path from 'node:path'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { detectImageType } from '../lib/imageSignature'

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024 // 2MB — avatar-upload.tsx dagi UI bilan mos

// UPLOAD_DIR konteyner/host ildiziga nisbatan. Docker'da bu papka alohida
// volume'ga ulanadi (api_uploads) — aks holda konteyner qayta tiklanganda
// (yoki bir nechta nusxada ishlaganda) yuklangan avatarlar yo'qolardi.
const AVATAR_DIR = path.join(path.resolve(env.UPLOAD_DIR), 'avatars')

export class InvalidAvatarError extends Error {
  statusCode = 400
}

/**
 * Buferni (allaqachon hajmi tekshirilgan) tekshiradi, haqiqiy bayt imzosidan
 * turini aniqlaydi va xavfsiz, serverda generatsiya qilingan nom bilan
 * diskka yozadi. Mijoz yuborgan fayl nomi yoki Content-Type HECH QACHON
 * ishlatilmaydi — shuning uchun path traversal yoki kengaytma soxtalashtirish
 * mumkin emas.
 */
export async function saveAvatar(buffer: Buffer): Promise<{ relativeUrl: string; mime: string }> {
  if (buffer.length === 0) {
    throw new InvalidAvatarError("Fayl bo'sh")
  }
  if (buffer.length > AVATAR_MAX_BYTES) {
    throw new InvalidAvatarError('Fayl 2MB dan katta')
  }

  const detected = detectImageType(buffer)
  if (!detected) {
    throw new InvalidAvatarError('Faqat PNG, JPEG yoki WEBP rasm fayllari qabul qilinadi')
  }

  await mkdir(AVATAR_DIR, { recursive: true })

  const filename = `${randomUUID()}.${detected.ext}`
  await writeFile(path.join(AVATAR_DIR, filename), buffer, { mode: 0o644 })

  return { relativeUrl: `/v1/uploads/avatars/${filename}`, mime: detected.mime }
}

export function avatarStaticRoot(): string {
  return AVATAR_DIR
}

/**
 * Faqat `saveAvatar()` o'zi generatsiya qilgan shaklga ANIQ mos keladigan
 * nisbiy URL — `/v1/uploads/avatars/<uuid>.<png|jpg|webp>`. Boshqa har
 * qanday qiymat (tashqi URL, eski/noma'lum format, bo'sh) rad etiladi.
 */
const OWN_AVATAR_URL_RE = /^\/v1\/uploads\/avatars\/([0-9a-f-]+\.(?:png|jpg|webp))$/

/**
 * Eski avatar faylini xavfsiz o'chiradi — FAQAT u haqiqatan
 * `saveAvatar()` yozgan, bizning o'z papkamizdagi fayl bo'lsa (yuqoridagi
 * regex bilan tasdiqlanadi; mijoz boshqargan yo'lga HECH QACHON
 * `unlink` chaqirilmaydi — path traversal imkonsiz, chunki fayl nomi
 * regex bilan qattiq cheklangan).
 *
 * Chaqiruvchi buni YANGI fayl muvaffaqiyatli yozilgan va DB yangilangandan
 * KEYIN chaqirishi kerak (M2/L2: avval yangi, keyin eski — aks holda yangi
 * yozish yoki DB yangilash muvaffaqiyatsiz bo'lsa, foydalanuvchi avatarsiz
 * qolib ketardi).
 *
 * Fayl allaqachon yo'q bo'lsa (ENOENT) — jim o'tkazib yuboriladi, bu xato
 * emas. Boshqa kutilmagan xatolar faqat qayd etiladi — eski faylni
 * o'chirishning muvaffaqiyatsizligi avatar almashtirish amalini
 * buzmasligi kerak (foydalanuvchining YANGI avatari baribir to'g'ri
 * saqlangan va DB'da).
 */
export async function deleteAvatarIfLocal(relativeUrl: string | null | undefined): Promise<void> {
  if (!relativeUrl) return
  const match = OWN_AVATAR_URL_RE.exec(relativeUrl)
  if (!match) return

  const filename = match[1]
  try {
    await unlink(path.join(AVATAR_DIR, filename))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    logger.warn({ msg: 'Eski avatar faylini o\'chirishda xato', filename, err: (err as Error).message })
  }
}

// @fastify/static ro'yxatdan o'tish paytida root papka MAVJUD bo'lishini
// talab qiladi — shuning uchun buildApp() uni registratsiyadan oldin
// chaqiradi (toza checkout'da uploads/avatars hali yo'q bo'lishi mumkin).
export async function ensureAvatarDir(): Promise<void> {
  await mkdir(AVATAR_DIR, { recursive: true })
}
