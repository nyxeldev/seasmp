import nodemailer from 'nodemailer'
import { logger } from '../config/logger'

const {
  SMTP_HOST  = '',
  SMTP_PORT  = '587',
  SMTP_USER  = '',
  SMTP_PASS  = '',
  EMAIL_FROM = 'SEASMP <noreply@seasmp.uz>',
  NODE_ENV   = 'development',
} = process.env

function createTransport() {
  if (!SMTP_HOST || NODE_ENV === 'test') return null
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT),
    secure: SMTP_PORT === '465',
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  })
}

const transport = createTransport()

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!transport) {
    logger.debug({ msg: 'Email (dev — not sent)', to, subject })
    return
  }
  try {
    await transport.sendMail({ from: EMAIL_FROM, to, subject, html })
    logger.info({ msg: 'Email sent', to, subject })
  } catch (err) {
    logger.error({ msg: 'Email send failed', to, subject, err })
  }
}

export const emailService = {
  async sendUnusualHourAlert(to: string, name: string, ip: string, time: Date): Promise<void> {
    const timeStr = time.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })
    await send(to, "Akkauntingizga g'ayrioddiy vaqtda kirish aniqlandi", `
      <h2>Xavfsizlik ogohlantirishi</h2>
      <p>Hurmatli ${name},</p>
      <p>Sizning akkauntingizga <strong>tunda (00:00–05:00)</strong> kirish aniqlandi.</p>
      <table>
        <tr><td><b>Vaqt:</b></td><td>${timeStr} (Toshkent)</td></tr>
        <tr><td><b>IP manzil:</b></td><td>${ip}</td></tr>
      </table>
      <p>Agar bu siz bo'lmasangiz, zudlik bilan parolingizni o'zgartiring.</p>
    `)
  },

  async sendMultiDeviceAlert(to: string, name: string, deviceCount: number): Promise<void> {
    await send(to, "Akkauntingiz bir nechta qurilmada ochiq", `
      <h2>Ko'p qurilma ogohlantirishi</h2>
      <p>Hurmatli ${name},</p>
      <p>Sizning akkauntingiz hozir <strong>${deviceCount} ta qurilmada</strong> ochiq.</p>
      <p>Agar bu sizning harakatingiz bo'lmasa — <a href="https://seasmp.uz/profile/sessions">barcha sessiyalarni yoping</a>.</p>
    `)
  },

  async send2FAEnabled(to: string, name: string): Promise<void> {
    await send(to, "Ikki bosqichli tasdiqlash yoqildi", `
      <h2>2FA yoqildi</h2>
      <p>Hurmatli ${name},</p>
      <p>Sizning akkauntingizda ikki bosqichli tasdiqlash (2FA) muvaffaqiyatli yoqildi.</p>
      <p>Endi har safar kirishda authenticator ilovangizdan kod talab qilinadi.</p>
    `)
  },

  async sendDropoutAlert(to: string, teacherName: string, studentName: string, riskScore: number): Promise<void> {
    const pct = Math.round(riskScore * 100)
    await send(to, `O'quvchi ${studentName} — kursni tashlab ketish xavfi`, `
      <h2>Dropout Risk Alert</h2>
      <p>Hurmatli ${teacherName},</p>
      <p>O'quvchi <strong>${studentName}</strong>ning kursni tashlab ketish xavfi <strong>${pct}%</strong>ga yetdi.</p>
      <p>Iltimos, o'quvchi bilan bog'laning va vaziyatni tekshiring.</p>
      <p><a href="https://seasmp.uz/students">O'quvchini ko'rish</a></p>
    `)
  },
}
