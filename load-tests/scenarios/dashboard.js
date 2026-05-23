import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const errorRate = new Rate('errors')

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m',  target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors:            ['rate<0.05'],
  },
}

const BASE_URL = __ENV.BASE_URL  || 'http://localhost:4000'
const TOKEN    = __ENV.API_TOKEN || ''

const headers = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${TOKEN}`,
}

export default function () {
  // ── Courses list ──────────────────────────────────────────────────────────────
  const coursesRes = http.get(`${BASE_URL}/v1/courses?status=ACTIVE&page=1&limit=10`, { headers })
  const ok1 = check(coursesRes, {
    'courses 200':           (r) => r.status === 200,
    'courses < 500ms':       (r) => r.timings.duration < 500,
    'courses has data array': (r) => {
      try { return Array.isArray(JSON.parse(r.body).data) } catch { return false }
    },
  })
  errorRate.add(!ok1)

  sleep(0.5)

  // ── Dashboard stats (audit logs) ─────────────────────────────────────────────
  const auditRes = http.get(`${BASE_URL}/v1/security/audit-logs?limit=5`, { headers })
  check(auditRes, {
    'audit-logs 200 or 403': (r) => r.status === 200 || r.status === 403,
    'audit-logs < 500ms':    (r) => r.timings.duration < 500,
  })

  sleep(0.5)

  // ── User profile ──────────────────────────────────────────────────────────────
  const meRes = http.get(`${BASE_URL}/v1/users/me`, { headers })
  const ok3 = check(meRes, {
    'me 200 or 401': (r) => r.status === 200 || r.status === 401,
    'me < 300ms':    (r) => r.timings.duration < 300,
  })
  errorRate.add(!ok3)

  sleep(1)
}
