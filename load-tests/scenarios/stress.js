import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const errorRate = new Rate('errors')

export const options = {
  stages: [
    // Ramp up
    { duration: '1m',  target: 50  },
    { duration: '2m',  target: 100 },
    { duration: '2m',  target: 200 },
    // Peak load
    { duration: '3m',  target: 200 },
    // Ramp down
    { duration: '1m',  target: 0   },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed:   ['rate<0.10'],
    errors:            ['rate<0.10'],
  },
}

const BASE_URL = __ENV.BASE_URL  || 'http://localhost:4000'
const TOKEN    = __ENV.API_TOKEN || ''

const headers = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${TOKEN}`,
}

// Weighted endpoint mix
const endpoints = [
  { weight: 5, fn: () => http.get(`${BASE_URL}/health`) },
  { weight: 3, fn: () => http.get(`${BASE_URL}/v1/courses?status=ACTIVE&page=1`, { headers }) },
  { weight: 2, fn: () => http.get(`${BASE_URL}/v1/users/me`, { headers }) },
  { weight: 1, fn: () => http.get(`${BASE_URL}/v1/security/alerts`, { headers }) },
]

const totalWeight = endpoints.reduce((s, e) => s + e.weight, 0)

function weightedPick() {
  let r = Math.random() * totalWeight
  for (const e of endpoints) {
    if (r < e.weight) return e.fn
    r -= e.weight
  }
  return endpoints[0].fn
}

export default function () {
  const fn  = weightedPick()
  const res = fn()

  const ok = check(res, {
    'status not 5xx': (r) => r.status < 500,
    'duration < 2s':  (r) => r.timings.duration < 2000,
  })
  errorRate.add(!ok)

  sleep(Math.random() * 2)
}
