import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { env } from '../config/env'
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

// @fastify/static ro'yxatdan o'tish paytida root papka MAVJUD bo'lishini
// talab qiladi — shuning uchun buildApp() uni registratsiyadan oldin
// chaqiradi (toza checkout'da uploads/avatars hali yo'q bo'lishi mumkin).
export async function ensureAvatarDir(): Promise<void> {
  await mkdir(AVATAR_DIR, { recursive: true })
}
