/**
 * Real vaqt shlyuzini uchidan-uchiga tekshiradi.
 *
 * Nega alohida vosita: soket qatlamini jest bilan sinash uchun butun server
 * ko'tarilishi kerak (HTTP + WebSocket + baza + Redis), bu esa unit testlar
 * qoidasini buzadi — ular tashqi xizmatga ulanmaydi. Integration to'plami
 * ham Fastify'ni `inject` bilan chaqiradi, WebSocket esa u yerdan o'tmaydi.
 *
 * Shuning uchun bu ishlab turgan serverga qarshi qo'lda ishlatiladigan
 * tekshiruv. Eng muhimi — XONA RUXSATI: ilgari mijoz istalgan kurs yoki
 * foydalanuvchi xonasiga o'zi qo'shila olardi.
 *
 * Ishlatish (API ishlab turgan bo'lishi kerak):
 *   npm run check:realtime --workspace=apps/api
 *
 * DIQQAT: oxirgi tekshiruv ataylab 12 marta noto'g'ri parol yuboradi va
 * brute-force qoidasini ishga tushiradi. Skript yakunida o'sha blokni
 * o'zi ochadi.
 */
import { io, type Socket } from 'socket.io-client'
import { redis } from '../config/redis'

const API = process.env.CHECK_API_URL ?? 'http://localhost:4000'

interface ConnectResult { ok: boolean; socket?: Socket; why?: string }

async function login(email: string, password: string): Promise<string> {
  const r = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j: any = await r.json()
  if (!j?.data?.accessToken) throw new Error(`${email}: ${JSON.stringify(j).slice(0, 140)}`)
  return j.data.accessToken
}

function connect(token: string | null): Promise<ConnectResult> {
  return new Promise((resolve) => {
    const s = io(API, {
      path: '/ws',
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    })
    s.on('connect',       () => resolve({ ok: true, socket: s }))
    s.on('connect_error', (e) => resolve({ ok: false, why: e.message }))
    setTimeout(() => resolve({ ok: false, why: 'timeout' }), 6000)
  })
}

const joinCourse = (s: Socket, courseId: string): Promise<boolean | null> =>
  new Promise((res) => {
    s.emit('join:course', courseId, (ok: boolean) => res(ok))
    setTimeout(() => res(null), 4000)
  })

const waitEvent = <T,>(s: Socket, ev: string, ms = 12000): Promise<T | null> =>
  new Promise((res) => {
    s.once(ev, (p: T) => res(p))
    setTimeout(() => res(null), ms)
  })

let failures = 0
function check(name: string, ok: boolean, extra = ''): void {
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'XATO'}  ${name}${extra ? '  — ' + extra : ''}`)
}

async function main(): Promise<void> {
  console.log(`\nReal vaqt shlyuzi tekshiruvi (${API})\n`)

  const noToken = await connect(null)
  check('tokensiz ulanish rad etiladi', !noToken.ok, noToken.why)

  const badToken = await connect('aaa.bbb.ccc')
  check('yaroqsiz token rad etiladi', !badToken.ok, badToken.why)

  const adminTok   = await login('admin@seasmp.uz', process.env.CHECK_ADMIN_PASSWORD ?? 'Admin@1234')
  const teacherTok = await login('teacher1@seasmp.uz', process.env.CHECK_TEACHER_PASSWORD ?? 'Teacher@1234')

  const admin   = await connect(adminTok)
  const teacher = await connect(teacherTok)
  check('admin ulanadi', admin.ok, admin.why)
  check('o\'qituvchi ulanadi', teacher.ok, teacher.why)
  if (!admin.socket || !teacher.socket) { process.exitCode = 1; return }

  const H = { authorization: `Bearer ${adminTok}` }
  const courses: any = await fetch(`${API}/v1/courses?limit=100`, { headers: H }).then((r) => r.json())
  const me: any = await fetch(`${API}/v1/users/me`, {
    headers: { authorization: `Bearer ${teacherTok}` },
  }).then((r) => r.json())

  const mine   = courses.data.find((c: any) => c.teacherId === me.data.id)
  const others = courses.data.find((c: any) => c.teacherId !== me.data.id)
  if (!mine || !others) { check('sinov uchun kurslar topildi', false); process.exitCode = 1; return }

  check('o\'qituvchi BEGONA kursga qo\'shila olmaydi',
    (await joinCourse(teacher.socket, others.id)) === false, others.title)
  check('o\'qituvchi o\'z kursiga qo\'shiladi',
    (await joinCourse(teacher.socket, mine.id)) === true, mine.title)

  const enrolls: any = await fetch(`${API}/v1/enrollments?courseId=${mine.id}&limit=5`, { headers: H })
    .then((r) => r.json())
  const enr = (enrolls.data ?? [])[0]
  if (!enr) {
    check('davomat hodisasi', false, 'ro\'yxatga olish topilmadi')
  } else {
    // Sana takrorlanmasligi kerak: davomat (enrollment, sana) bo'yicha yagona
    const far = new Date(Date.now() + (200 + Math.floor(Math.random() * 9000)) * 86_400_000)
    const lessonDate = far.toISOString().slice(0, 10)
    const waiting = waitEvent<any>(teacher.socket, 'attendance:marked')
    const res = await fetch(`${API}/v1/attendance`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId: enr.id, lessonDate, status: 'PRESENT' }),
    })
    const ev = await waiting
    check('davomat hodisasi kurs xonasiga keladi',
      ev !== null && ev?.courseId === mine.id,
      ev ? `${ev.status} ${ev.lessonDate}` : `javob ${res.status}`)
  }

  const alertWait = waitEvent<any>(admin.socket, 'security:alert', 15000)
  for (let i = 0; i < 12; i++) {
    await fetch(`${API}/v1/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student1@seasmp.uz', password: 'deliberately-wrong' }),
    })
  }
  const alert = await alertWait
  check('xavfsizlik ogohlantirishi adminga keladi', alert !== null,
    alert ? `${alert.type} ${alert.severity}` : 'kelmadi')

  admin.socket.close()
  teacher.socket.close()

  // Brute-force sinovi bloklagan IP ni ochamiz — aks holda muhit 30 daqiqa
  // yaroqsiz bo'lib qoladi va sabab tushunarsiz ko'rinadi.
  await redis.del('ip_blocked:127.0.0.1', 'brute:127.0.0.1')
  console.log('\n  (sinov bloklagan IP ochildi)')

  console.log(failures === 0 ? '\nHammasi o\'tdi.\n' : `\n${failures} ta tekshiruv yiqildi.\n`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => { redis.disconnect() })
