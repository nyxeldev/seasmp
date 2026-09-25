#!/usr/bin/env node
/**
 * Aniqlash qatlamlarining narxini o'lchaydi.
 *
 * Nega kerak: qatlamlar `onResponse` da ishlaydi, ya'ni javob yuborilgandan
 * KEYIN. Shuning uchun ular bitta so'rovning kechikishiga qo'shilmaydi —
 * lekin hodisalar siklidan vaqt va bazadan ulanish oladi. Demak ta'sir
 * kechikishda emas, YUK ostidagi o'tkazuvchanlikda ko'rinadi.
 *
 * Shu sababli bu skript ketma-ket emas, parallel so'rov yuboradi va
 * DETECTION_ENABLED=true/false holatlarini solishtirish uchun ishlatiladi.
 *
 * Ishlatish:
 *   node load-tests/detection-overhead.js --url http://localhost:4000 \
 *        --email admin@seasmp.uz --password 'Admin@1234' \
 *        --concurrency 20 --duration 20 --label "yoqilgan"
 *
 * k6 o'rnatilmagan muhitlarda ishlashi uchun ataylab bog'liqliksiz yozilgan.
 */

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const BASE        = arg('url', 'http://localhost:4000')
const EMAIL       = arg('email', 'admin@seasmp.uz')
const PASSWORD    = arg('password', 'Admin@1234')
const CONCURRENCY = Number(arg('concurrency', '20'))
const DURATION    = Number(arg('duration', '20')) * 1000
const WARMUP      = Number(arg('warmup', '3')) * 1000
const LABEL       = arg('label', 'o\'lchov')
// Egalik aniqlanadigan yo'l — qatlamlar aynan shu yerda eng ko'p ish qiladi
const PATH        = arg('path', '/v1/courses')

async function login() {
  const res = await fetch(`${BASE}/v1/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`Login ${res.status}: ${await res.text()}`)
  const json = await res.json()
  const token = json?.data?.accessToken
  if (!token) throw new Error('Javobda accessToken yo\'q')
  return token
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[i]
}

/** Belgilangan muddat davomida `concurrency` ta parallel oqim so'rov yuboradi */
async function drive(token, durationMs, collect) {
  const deadline = Date.now() + durationMs
  const headers = { authorization: `Bearer ${token}` }

  async function worker() {
    while (Date.now() < deadline) {
      const t0 = performance.now()
      try {
        const res = await fetch(`${BASE}${PATH}`, { headers })
        await res.arrayBuffer() // javobni to'liq o'qish — aks holda o'lchov yolg'on
        collect(performance.now() - t0, res.status)
      } catch (err) {
        collect(performance.now() - t0, 0)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

async function main() {
  const token = await login()

  // Qizdirish — JIT, ulanishlar hovuzi va Prisma sovuq startini o'lchovdan chiqarish
  process.stdout.write(`[${LABEL}] qizdirilmoqda (${WARMUP / 1000}s)...\n`)
  await drive(token, WARMUP, () => {})

  const latencies = []
  const statuses  = new Map()
  const started   = performance.now()

  process.stdout.write(`[${LABEL}] o'lchov: ${CONCURRENCY} parallel, ${DURATION / 1000}s, ${PATH}\n`)
  await drive(token, DURATION, (ms, status) => {
    latencies.push(ms)
    statuses.set(status, (statuses.get(status) ?? 0) + 1)
  })

  const elapsed = (performance.now() - started) / 1000
  latencies.sort((a, b) => a - b)
  const sum = latencies.reduce((a, b) => a + b, 0)

  const fmt = (n) => n.toFixed(1).padStart(7)
  console.log(`
── ${LABEL} ──────────────────────────────────
  So'rovlar        ${latencies.length}
  Davomiylik       ${elapsed.toFixed(1)}s
  O'tkazuvchanlik  ${(latencies.length / elapsed).toFixed(1)} req/s
  Kechikish  o'rt  ${fmt(sum / latencies.length)} ms
             p50   ${fmt(percentile(latencies, 50))} ms
             p95   ${fmt(percentile(latencies, 95))} ms
             p99   ${fmt(percentile(latencies, 99))} ms
             max   ${fmt(latencies[latencies.length - 1])} ms
  Status           ${[...statuses.entries()].map(([s, n]) => `${s || 'xato'}:${n}`).join('  ')}
`)
}

main().catch((err) => { console.error(err.message); process.exit(1) })
