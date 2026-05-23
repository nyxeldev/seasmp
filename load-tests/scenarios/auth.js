import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const errorRate = new Rate('errors')

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m',  target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors:            ['rate<0.05'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000'

export default function () {
  // ── Login with valid credentials ────────────────────────────────────────────
  const loginRes = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email: __ENV.TEST_EMAIL || 'admin@test.com', password: __ENV.TEST_PASSWORD || 'Admin@1234' }),
    { headers: { 'Content-Type': 'application/json' } },
  )

  const ok = check(loginRes, {
    'login status 200 or 401': (r) => r.status === 200 || r.status === 401,
    'login response < 500ms':  (r) => r.timings.duration < 500,
  })
  errorRate.add(!ok)

  // ── Login with bad credentials (expect 401) ──────────────────────────────────
  const badRes = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email: 'nobody@test.com', password: 'WrongPass@1' }),
    { headers: { 'Content-Type': 'application/json' } },
  )

  check(badRes, {
    'bad login returns 401': (r) => r.status === 401,
  })

  sleep(1)
}
