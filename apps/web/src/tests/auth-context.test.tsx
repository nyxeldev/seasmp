import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { AuthProvider, useAuth } from '@/lib/auth-context'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockAuthApiLogin = vi.fn()
const mockUsersApiMe   = vi.fn()
const mockAuthApiLogout = vi.fn()
const mockClearTokens   = vi.fn()

vi.mock('@/lib/api', () => ({
  authApi: {
    login:  (...args: unknown[]) => mockAuthApiLogin(...args),
    logout: (...args: unknown[]) => mockAuthApiLogout(...args),
  },
  usersApi: {
    me: (...args: unknown[]) => mockUsersApiMe(...args),
  },
  clearTokens: (...args: unknown[]) => mockClearTokens(...args),
}))

// Stub localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem:    (k: string) => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear:      () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// ─── Tests ────────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(AuthProvider, null, children)

describe('useAuth — initial load', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  it('starts with loading=true then false when no token', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('calls /me when token is in localStorage', async () => {
    localStorageMock.setItem('accessToken', 'tok')
    mockUsersApiMe.mockResolvedValue({ data: { id: '1', email: 'a@b.com', role: 'ADMIN' } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockUsersApiMe).toHaveBeenCalled()
    expect(result.current.user?.id).toBe('1')
  })
})

describe('useAuth — login()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  it('returns done and stores token on success', async () => {
    const fakeUser = { id: '1', email: 'a@b.com', role: 'ADMIN' }
    mockAuthApiLogin.mockResolvedValue({ data: { accessToken: 'at', user: fakeUser } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let loginResult: any
    await act(async () => {
      loginResult = await result.current.login('a@b.com', 'pass')
    })

    expect(loginResult.step).toBe('done')
    expect(localStorageMock.getItem('accessToken')).toBe('at')
    expect(result.current.user?.id).toBe('1')
    expect(mockPush).toHaveBeenCalledWith('/dashboard')
  })

  it('returns requires_2fa without storing token', async () => {
    mockAuthApiLogin.mockResolvedValue({
      data: { requiresTwoFactor: true, twoFactorToken: 'tf-tok' },
    })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let loginResult: any
    await act(async () => {
      loginResult = await result.current.login('a@b.com', 'pass')
    })

    expect(loginResult.step).toBe('requires_2fa')
    expect(loginResult.twoFactorToken).toBe('tf-tok')
    expect(localStorageMock.getItem('accessToken')).toBeNull()
  })

  it('returns requires_setup for admin without 2FA', async () => {
    mockAuthApiLogin.mockResolvedValue({
      data: { requiresTwoFactorSetup: true, setupToken: 'setup-tok' },
    })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let loginResult: any
    await act(async () => {
      loginResult = await result.current.login('a@b.com', 'pass')
    })

    expect(loginResult.step).toBe('requires_setup')
    expect(loginResult.setupToken).toBe('setup-tok')
  })
})

describe('useAuth — logout()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  it('clears user and redirects to /login', async () => {
    localStorageMock.setItem('accessToken', 'tok')
    mockUsersApiMe.mockResolvedValue({ data: { id: '1', email: 'a@b.com', role: 'ADMIN' } })
    mockAuthApiLogout.mockResolvedValue({})

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).toBeTruthy())

    await act(async () => { await result.current.logout() })

    expect(result.current.user).toBeNull()
    expect(mockClearTokens).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/login')
  })
})
