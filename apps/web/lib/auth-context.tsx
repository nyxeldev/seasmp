'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { authApi, usersApi, clearTokens, type User } from './api'

export type LoginResult =
  | { step: 'done' }
  | { step: 'requires_2fa'; twoFactorToken: string }
  | { step: 'requires_setup'; setupToken: string }

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  completeLogin: (accessToken: string, user: User) => void
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export const PENDING_QR_TOKEN_KEY = 'seasmp-pending-qr-token'

/**
 * Login muvaffaqiyatli bo'lgach qayerga yuborish kerakligini hal qiladi.
 *
 * Talaba QR kodni skanerlab, lekin tizimga kirmagan bo'lsa,
 * `/attendance/scan` sahifasi tokenni shu kalit bilan saqlab, login'ga
 * yuboradi — login tugagach foydalanuvchi standart /dashboard o'rniga
 * aynan o'sha skanerlash sahifasiga qaytishi kerak, aks holda davomat
 * hech qachon belgilanmay qoladi.
 */
function postLoginRedirect(router: ReturnType<typeof useRouter>) {
  let pendingToken: string | null = null
  try { pendingToken = sessionStorage.getItem(PENDING_QR_TOKEN_KEY) } catch { /* xavfsiz e'tiborsiz qoldiriladi */ }
  router.push(pendingToken ? `/attendance/scan?token=${pendingToken}` : '/dashboard')
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router                = useRouter()

  const refresh = useCallback(async () => {
    try {
      const res = await usersApi.me()
      setUser(res.data)
    } catch {
      setUser(null)
      clearTokens()
    }
  }, [])

  useEffect(() => {
    // Always attempt refresh — the httpOnly cookie may still be valid even
    // if the localStorage access token is missing (e.g. after browser restart)
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const res = await authApi.login(email, password)
    const data = res.data

    if ('requiresTwoFactor' in data && data.requiresTwoFactor) {
      return { step: 'requires_2fa', twoFactorToken: (data as { requiresTwoFactor: true; twoFactorToken: string }).twoFactorToken }
    }
    if ('requiresTwoFactorSetup' in data && data.requiresTwoFactorSetup) {
      return { step: 'requires_setup', setupToken: (data as { requiresTwoFactorSetup: true; setupToken: string }).setupToken }
    }

    const loginData = data as { accessToken: string; user: User }
    localStorage.setItem('accessToken', loginData.accessToken)
    setUser(loginData.user)
    postLoginRedirect(router)
    return { step: 'done' }
  }

  const completeLogin = (accessToken: string, newUser: User) => {
    localStorage.setItem('accessToken', accessToken)
    setUser(newUser)
    postLoginRedirect(router)
  }

  const logout = async () => {
    try { await authApi.logout() } catch {}
    clearTokens()
    setUser(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, completeLogin, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
