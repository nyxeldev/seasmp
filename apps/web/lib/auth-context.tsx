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
    router.push('/dashboard')
    return { step: 'done' }
  }

  const completeLogin = (accessToken: string, newUser: User) => {
    localStorage.setItem('accessToken', accessToken)
    setUser(newUser)
    router.push('/dashboard')
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
