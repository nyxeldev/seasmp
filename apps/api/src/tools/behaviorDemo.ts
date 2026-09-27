/**
 * Xatti-harakat qatlamining namoyishi — jonli profillar ustida.
 *
 * Nega alohida skript kerak: qo'lda o'tkazilgan birinchi namoyishda 45 ta
 * so'rov bir necha soniyada yuborilgan edi va CHASTOTA signali boshqa hamma
 * narsani to'yintirib yubordi. Natijada tungi admin ham, kunduzgi admin ham
 * bir xil ogohlantirish oldi — ya'ni "soat bir odam uchun me'yor, boshqasi
 * uchun anomaliya" degan asosiy da'vo ko'rinmay qoldi.
 *
 * Bu skript shuni ajratadi. Ikki qismi bor:
 *
 *   1-QISM — BALLASH. Jonli profillar o'qiladi va AYNI hodisa har bir
 *     foydalanuvchi uchun alohida ballanadi. Hech qanday so'rov yuborilmaydi,
 *     shuning uchun chastota aralashmaydi va farqni faqat profil beradi.
 *
 *   2-QISM — JONLI QUVUR. Haqiqiy HTTP so'rovlari yuboriladi va bazada
 *     paydo bo'lgan ogohlantirish ko'rsatiladi. Bu yerda maqsad boshqa:
 *     korrelyatsiya haqiqatan ishlashini isbotlash.
 *
 * Ishlatish:
 *   npm run demo:behavior --workspace=apps/api
 *   npm run demo:behavior --workspace=apps/api -- --skip-live
 *
 * Talab: baza seed qilingan, `db:seed:history` ishlagan va profillar
 * qurilgan (POST /v1/security/profiles/refresh).
 *
 * MUHIM — PROFIL IFLOSLANISHI. Profil MUVAFFAQIYATLI so'rovlardan quriladi
 * (behaviorProfiler FOREIGN va 4xx ni chiqarib tashlaydi, qolganini o'rganadi).
 * Demak imtiyozli aktorning muvaffaqiyatli murojaati — jumladan shu skriptning
 * 3-QISMI yuborgan so'rovlar — keyingi `profiles/refresh` da ME'YOR sifatida
 * o'rganiladi. Amalda buni ko'rdik: namoyishni bir marta o'tkazgandan keyin
 * superadmin uchun soat 03:00 "odatiy" bo'lib qoldi.
 *
 * Bu o'yinchoq kamchilik emas, tizimning haqiqiy cheklovi: sekin va sabrli
 * ichki tahdid o'zini asta-sekin me'yorga aylantira oladi. Shuning uchun
 * namoyishni takrorlashdan oldin tarixni qayta yozing:
 *
 *   npm run db:seed:history --workspace=apps/api   # eski tarixni almashtiradi
 *   POST /v1/security/profiles/refresh
 */
import { prisma } from '../config/prisma'
import { redis } from '../config/redis'
import { loadProfile } from '../services/behaviorProfiler'
import { scoreEvent, type BehaviorProfile } from '../services/behaviorScoring'
import {
  correlate,
  SINGLE_THRESHOLD, CORRELATED_THRESHOLD, PRIVILEGED_SCOPE_CAP,
} from '../services/correlation'
import { clearSignals } from '../services/signalWindow'

const API = process.env.DEMO_API_URL ?? 'http://localhost:4000'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Admin@1234'

/** Tungi admin — seed-history.ts uni ataylab shunday qiladi */
const NIGHT = 'admin@seasmp.uz'
/** Kunduzgi imtiyozli aktor */
const DAY = 'superadmin@seasmp.uz'
const TEACHER = 'teacher1@seasmp.uz'

const line = (n = 74) => '─'.repeat(n)

interface Subject { email: string; id: string; profile: BehaviorProfile }

async function loadSubjects(emails: string[]): Promise<Subject[]> {
  const out: Subject[] = []
  for (const email of emails) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (!u) { console.log(`  (${email} topilmadi — o'tkazib yuborildi)`); continue }
    const profile = await loadProfile(u.id)
    if (profile.sampleCount === 0) {
      console.log(`  (${email} uchun profil yo'q — avval db:seed:history va profiles/refresh)`)
      continue
    }
    out.push({ email, id: u.id, profile })
  }
  return out
}

/** Har bir sub'ekt uchun AYNI hodisa, faqat profil boshqacha */
function scoreAtHour(s: Subject, hour: number, opts: { foreign?: boolean } = {}): number {
  const p = s.profile
  return scoreEvent(p, {
    hour,
    weekday: 2,
    ip: opts.foreign ? '198.51.100.7' : (p.knownIps[0] ?? '127.0.0.1'),
    userAgent: opts.foreign ? 'python-requests/2.32' : (p.knownUserAgents[0] ?? 'Chrome'),
    resource: Object.keys(p.resourceMix)[0] ?? 'courses',
    // Chastota ATAYLAB me'yorda: bu qism soat va qurilmani o'lchaydi,
    // portlashni emas. Aks holda rate signali hammasini bosib ketadi.
    reqLastHour: Math.max(1, Math.round(p.reqPerHourMean)),
  }).score
}

function partOne(subjects: Subject[]): void {
  console.log(`\n${line()}`)
  console.log('1-QISM — AYNI HODISA, TURLI PROFIL')
  console.log(line())
  console.log('\nHar bir qatorda bir xil harakat: o\'z IP va qurilmasidan kirish.')
  console.log('Farq faqat SOATDA. Chastota har kim uchun o\'z me\'yorida.\n')

  const hours = [3, 6, 10, 15, 20, 23]
  console.log('foydalanuvchi'.padEnd(26), hours.map((h) => `${String(h).padStart(2, '0')}:00`.padStart(7)).join(''))
  console.log(line(26), line(hours.length * 7))
  for (const s of subjects) {
    const row = hours.map((h) => scoreAtHour(s, h).toFixed(3).padStart(7)).join('')
    console.log(s.email.padEnd(26), row)
  }

  console.log('\nTungi admin uchun eng past ball tunda, qolganlar uchun kunduzi.')
  console.log('Eski qoida (securityMonitor.checkUnusualHour) esa soat 0-5 ni HAR QANDAY')
  console.log('admin uchun HIGH deb belgilardi — har kecha, har safar.\n')

  console.log(`${line()}`)
  console.log('O\'SHA SOATLAR, LEKIN NOTANISH IP VA QURILMA BILAN')
  console.log(line())
  console.log()
  console.log('foydalanuvchi'.padEnd(26), '  03:00    15:00   sabablar (03:00 da)')
  console.log(line(26), line(44))
  for (const s of subjects) {
    const p = s.profile
    const reasons = scoreEvent(p, {
      hour: 3, weekday: 2, ip: '198.51.100.7', userAgent: 'python-requests/2.32',
      resource: Object.keys(p.resourceMix)[0] ?? 'courses',
      reqLastHour: Math.max(1, Math.round(p.reqPerHourMean)),
    }).reasons
    console.log(
      s.email.padEnd(26),
      scoreAtHour(s, 3, { foreign: true }).toFixed(3).padStart(7),
      scoreAtHour(s, 15, { foreign: true }).toFixed(3).padStart(8),
      '  ' + reasons.join(', '),
    )
  }
  console.log()
}

/** Ikkala qatlam yolg'iz o'tkazib yuboradigan, lekin gibrid tutadigan nuqta */
function partTwoOffline(subjects: Subject[]): void {
  console.log(`${line()}`)
  console.log('2-QISM — KORRELYATSIYA: YOLG\'IZ YETMAYDI, BIRGALIKDA YETADI')
  console.log(line())
  console.log(`\nYolg'iz qatlam chegarasi ${SINGLE_THRESHOLD}, korrelyatsiya chegarasi ${CORRELATED_THRESHOLD}.\n`)

  console.log('Stsenariy: soat 03:00, notanish IP va vosita, imtiyozli aktor.')
  console.log('Qamrov oshgani sayin gibrid hukm qanday o\'zgaradi.\n')

  const owners = [10, 25, 32, 45]
  console.log('foydalanuvchi'.padEnd(26), '2-qat  ', owners.map((o) => `${o} ega`.padStart(9)).join(''))
  console.log(line(26), line(8 + owners.length * 9))

  for (const s of subjects) {
    const behavior = scoreAtHour(s, 3, { foreign: true })
    const cells = owners.map((o) => {
      const v = correlate({
        authzDenied: 0, authzAllowed: 0, massAccess: false,
        behaviorScore: behavior, privilegedOwners: o,
      })
      return `${v.alert ? '!' : ' '}${v.risk.toFixed(3)}`.padStart(9)
    })
    const alone = behavior >= SINGLE_THRESHOLD ? '*' : ' '
    console.log(s.email.padEnd(26), `${behavior.toFixed(3)}${alone} `, cells.join(''))
  }

  console.log('\n  *  — xatti-harakat qatlami YOLG\'IZ o\'zi chegaradan o\'tadi')
  console.log('  !  — gibrid hukm ogohlantirish beradi')
  console.log('\nEng qiziq qator — yulduzchasi YO\'Q, lekin undov belgisi BOR bo\'lgani:')
  console.log('o\'sha holatda 2-qatlam yolg\'iz jim qolardi, 1-qatlam esa imtiyozli')
  console.log('aktor uchun hech qachon yolg\'iz ogohlantirmaydi (qamrov riski tepasi')
  console.log(`${PRIVILEGED_SCOPE_CAP} — ataylab ${SINGLE_THRESHOLD} dan past). Ya'ni hukmni faqat korrelyatsiya beradi.`)
  console.log()
}

// ── 2-qism: jonli quvur ──────────────────────────────────────────────────────

async function login(email: string, userAgent: string): Promise<{ token?: string; why?: string }> {
  const res = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    // 429 bu yerda kutilgan holat: namoyish o'zi ham API ning tezlik
    // chegarasiga (RATE_LIMIT_MAX, standart 100/daqiqa) tushadi. Sababni
    // ko'rsatmasak, "kirish muvaffaqiyatsiz" degan foydasiz xabar chiqadi.
    const code = json?.error?.code ?? res.status
    return { why: code === 'RATE_LIMIT_EXCEEDED' || res.status === 429
      ? 'API tezlik chegarasi (429) — bir daqiqa kutib qayta urining'
      : `${res.status} ${code}` }
  }
  return { token: json?.data?.accessToken }
}

/** Tezlik chegarasiga urilmaslik uchun sub'ektlar orasidagi pauza */
const PAUSE_MS = Number(process.env.DEMO_PAUSE_MS ?? 20_000)

async function liveRun(subject: Subject, userAgent: string, targets: number): Promise<void> {
  // Oyna, sovish va SOATLIK HISOBLAGICHni tozalaymiz — namoyish takroriy
  // ishlashi kerak. Hisoblagichsiz ikkinchi yugurish birinchisining ustiga
  // qo'shilib boradi va bir soat ichida uch-to'rt marta ishlatilsa
  // `isMassAccess` qat'iy qoidasi ishga tushib, hamma narsani 1.0 ga
  // ko'taradi — o'shanda nozik korrelyatsiya ko'rinmay qoladi.
  await clearSignals(subject.id)
  for (const layer of ['AUTHORIZATION', 'BEHAVIOR', 'CORRELATED']) {
    await redis.del(`corr_alert:${subject.id}:${layer}`)
  }
  const bucket = Math.floor(Date.now() / 3_600_000)
  await redis.del(`req_hour:${subject.id}:${bucket}`)

  const { token, why } = await login(subject.email, userAgent)
  if (!token) { console.log(`  ${subject.email}: kirish bo'lmadi — ${why}`); return }

  const headers = { authorization: `Bearer ${token}`, 'user-agent': userAgent }
  const listRes = await fetch(`${API}/v1/users?role=STUDENT&limit=${targets}`, { headers })
  const list: any = await listRes.json()
  const ids: string[] = (list?.data ?? []).slice(0, targets).map((u: any) => u.id)

  for (const id of ids) {
    await fetch(`${API}/v1/users/${id}`, { headers })
  }

  // onResponse hook javobdan KEYIN ishlaydi — yozilishiga ulgursin
  await new Promise((r) => setTimeout(r, 1500))

  const alert = await prisma.securityAlert.findFirst({
    where: { userId: subject.id, layer: { not: null } },
    orderBy: { id: 'desc' },
  })
  const label = `${subject.email} (${ids.length} ta ega)`.padEnd(48)
  if (!alert) {
    console.log(`  ${label} ogohlantirish yo'q`)
    return
  }
  const signals = (alert.details as any)?.signals ?? {}
  console.log(
    `  ${label} ${alert.layer} ${Number(alert.score).toFixed(4)} ${alert.severity}`,
    `\n      signallar: xatti-harakat ${Number(signals.behaviorScore ?? 0).toFixed(3)},`,
    `egalar ${signals.privilegedOwners ?? 0}`,
  )
}

async function partTwoLive(subjects: Subject[]): Promise<void> {
  console.log(`${line()}`)
  console.log('3-QISM — JONLI QUVUR (haqiqiy HTTP so\'rovlari)')
  console.log(line())

  const health = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false)
  if (!health) {
    console.log(`\n  API ishlamayapti (${API}) — bu qism o'tkazib yuborildi.\n`)
    return
  }

  console.log('\nHar ikkala admin AYNI harakatni bajaradi: 32 ta talaba yozuvini ochadi.')
  console.log('Farq faqat QURILMADA: biri o\'z qurilmasidan, biri notanish vositadan.')
  console.log('\nDIQQAT — bu qism nimani ko\'rsatadi va nimani ko\'rsatmaydi:')
  console.log('  ko\'rsatadi    : quvur uchidan-uchiga ishlaydi, ikkala qatlamning dalili')
  console.log('                  bir oynada uchrashadi va CORRELATED hukm bazaga yoziladi.')
  console.log('  qisman        : soat va qurilma farqi ballarda ko\'rinadi, lekin HUKMNI')
  console.log('                  o\'zgartirishga yetmaydi — ikkala admin ham ogohlantirish')
  console.log('                  oladi. Sababi: 32 ta so\'rovni bir necha soniyada yuborish')
  console.log('                  chastota signalini ko\'taradi va u farqni siqib qo\'yadi.')
  console.log('                  Toza ajratilgan holat 1-QISMDA.\n')

  const day = subjects.find((s) => s.email === DAY)
  const night = subjects.find((s) => s.email === NIGHT)

  if (night) {
    await liveRun(night, night.profile.knownUserAgents[0] ?? 'Mozilla/5.0', 32)
  }
  if (night && day) {
    console.log(`  (tezlik chegarasi tushishi uchun ${Math.round(PAUSE_MS / 1000)}s kutilmoqda)`)
    await new Promise((r) => setTimeout(r, PAUSE_MS))
  }
  if (day) {
    await liveRun(day, 'python-requests/2.32', 32)
  }
  console.log()
}

async function main(): Promise<void> {
  const skipLive = process.argv.includes('--skip-live')

  console.log('\nSEASMP — xatti-harakat qatlami namoyishi')
  const subjects = await loadSubjects([NIGHT, DAY, TEACHER])
  if (subjects.length === 0) {
    console.log('\nProfil topilmadi. Avval:')
    console.log('  npm run db:seed:history --workspace=apps/api')
    console.log('  POST /v1/security/profiles/refresh\n')
    return
  }

  partOne(subjects)
  partTwoOffline(subjects)
  if (!skipLive) await partTwoLive(subjects)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => {
    await prisma.$disconnect()
    redis.disconnect()
  })
