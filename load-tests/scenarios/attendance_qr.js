import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const errorRate    = new Rate('errors')
const qrGenTrend   = new Trend('qr_generation_ms')
const qrScanTrend  = new Trend('qr_scan_ms')

export const options = {
  stages: [
    { duration: '20s', target: 5  },
    { duration: '1m',  target: 30 },
    { duration: '20s', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    qr_generation_ms:  ['p(95)<800'],
    qr_scan_ms:        ['p(95)<500'],
    errors:            ['rate<0.05'],
  },
}

const BASE_URL  = __ENV.BASE_URL      || 'http://localhost:4000'
const TOKEN     = __ENV.API_TOKEN     || ''
const COURSE_ID = __ENV.TEST_COURSE_ID || ''

const headers = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${TOKEN}`,
}

export default function () {
  if (!COURSE_ID) {
    // Fallback: just hit the courses list
    const r = http.get(`${BASE_URL}/v1/courses?status=ACTIVE`, { headers })
    check(r, { 'courses ok': (res) => res.status === 200 || res.status === 401 })
    sleep(1)
    return
  }

  // ── Generate QR ───────────────────────────────────────────────────────────────
  const genStart  = Date.now()
  const genRes = http.post(
    `${BASE_URL}/v1/attendance/qr`,
    JSON.stringify({ courseId: COURSE_ID }),
    { headers },
  )
  qrGenTrend.add(Date.now() - genStart)

  const genOk = check(genRes, {
    'qr generate 201':      (r) => r.status === 201,
    'qr generate < 800ms':  (r) => r.timings.duration < 800,
  })
  errorRate.add(!genOk)

  sleep(0.3)

  // ── Simulate QR scan ──────────────────────────────────────────────────────────
  let token = ''
  try { token = JSON.parse(genRes.body).data?.token || '' } catch {}

  if (token) {
    const scanStart = Date.now()
    const scanRes = http.post(
      `${BASE_URL}/v1/attendance/scan`,
      JSON.stringify({ token }),
      { headers },
    )
    qrScanTrend.add(Date.now() - scanStart)

    check(scanRes, {
      'qr scan 200 or 409':  (r) => r.status === 200 || r.status === 409,
      'qr scan < 500ms':     (r) => r.timings.duration < 500,
    })
  }

  sleep(1)
}
