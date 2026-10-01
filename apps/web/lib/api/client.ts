// Barcha domenlar (auth, users, courses, ...) shu yerdagi bitta `api` ob'ekti
// va token mantig'idan foydalanadi — autentifikatsiya/yangilash logikasi
// faqat shu yerda, boshqa hech qayerda takrorlanmaydi.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

// Backend server-relative yo'l qaytaradi (masalan /v1/uploads/avatars/xxx.png) —
// bu API originiga nisbatan, frontend originiga emas. <img src> uchun shuni
// to'liq manzilga aylantiradi.
export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  if (/^https?:\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  return `${BASE}${url}`
}

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('accessToken')
}

// Haqiqiy JWT emas, faqat "sessiya bor/yo'q" belgisi — middleware.ts shuni
// o'qib himoyalangan sahifalarni server darajasida qo'riqlaydi (ruxsatsiz
// foydalanuvchiga himoyalangan UI bir lahza ko'rinib, keyin qayta
// yo'naltirilishining oldini oladi). Haqiqiy avtorizatsiya hamon faqat
// API'da (JWT + RBAC) — bu faqat qo'shimcha qatlam.
const SESSION_COOKIE = 'seasmp-session'
const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // JWT_REFRESH_EXPIRES_IN standartiga mos (7d)

function markSessionCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${SESSION_COOKIE_MAX_AGE}; samesite=lax`
}

function clearSessionCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem('accessToken', access)
  if (refresh) localStorage.setItem('refreshToken', refresh)
  markSessionCookie()
}

export function clearTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  clearSessionCookie()
}

let refreshingPromise: Promise<string | null> | null = null

async function tryRefresh(): Promise<string | null> {
  if (refreshingPromise) return refreshingPromise
  refreshingPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) { clearTokens(); return null }
      const json = await res.json()
      const newToken = json?.data?.accessToken
      if (newToken) { localStorage.setItem('accessToken', newToken); markSessionCookie(); return newToken }
      clearTokens(); return null
    } catch { clearTokens(); return null }
    finally { refreshingPromise = null }
  })()
  return refreshingPromise
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let tok = token !== undefined ? token : getToken()
  if (tok) headers['Authorization'] = `Bearer ${tok}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // Auto-refresh on 401 (only for authenticated paths)
  if (res.status === 401 && token === undefined && path !== '/v1/auth/login') {
    const newToken = await tryRefresh()
    if (newToken) {
      const retryHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${newToken}` }
      const retry = await fetch(`${BASE}${path}`, {
        method, headers: retryHeaders, credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      const retryJson = await retry.json().catch(() => ({}))
      if (!retry.ok) throw new ApiError(retry.status, retryJson?.error?.message ?? `HTTP ${retry.status}`, retryJson?.error?.code)
      return retryJson
    }
  }

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`
    throw new ApiError(res.status, msg, json?.error?.code)
  }

  return json
}

export async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const tok = getToken()
  const headers: Record<string, string> = {}
  if (tok) headers['Authorization'] = `Bearer ${tok}`

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, json?.error?.message ?? `HTTP ${res.status}`, json?.error?.code)
  return json
}

export const api = {
  get:    <T>(path: string, token?: string | null) => request<T>('GET',    path, undefined, token),
  post:   <T>(path: string, body?: unknown, token?: string | null) => request<T>('POST',   path, body, token),
  patch:  <T>(path: string, body?: unknown, token?: string | null) => request<T>('PATCH',  path, body, token),
  delete: <T>(path: string, token?: string | null) => request<T>('DELETE', path, undefined, token),
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export const PY_BASE = process.env.NEXT_PUBLIC_ANALYTICS_URL ?? 'http://localhost:5000'

export async function pyRequest<T>(path: string, method = 'GET'): Promise<T> {
  const res = await fetch(`${PY_BASE}${path}`, { method })
  if (!res.ok) throw new Error(`Analytics service: HTTP ${res.status}`)
  return res.json()
}
