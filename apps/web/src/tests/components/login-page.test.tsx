import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLogin       = vi.fn()
const mockCompleteLogin = vi.fn()

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ login: mockLogin, completeLogin: mockCompleteLogin }),
}))

vi.mock('@/lib/api', () => ({
  authApi: {
    setup2faStart:  vi.fn(),
    setup2faFinish: vi.fn(),
    verify2fa:      vi.fn(),
    backupCode:     vi.fn(),
  },
  ApiError: class extends Error {
    constructor(public statusCode: number, message: string, public code?: string) {
      super(message)
    }
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// ─── Component under test ─────────────────────────────────────────────────────
import LoginPage from '@/app/(auth)/login/page'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LoginPage — credentials step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email and password fields', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/parol/i)).toBeInTheDocument()
  })

  it('disables submit while loading', async () => {
    mockLogin.mockReturnValue(new Promise(() => {})) // never resolves
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.com')
    await userEvent.type(screen.getByLabelText(/parol/i), 'Password@1')
    fireEvent.submit(screen.getByRole('button', { name: /kirish/i }))
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('transitions to totp step when requires_2fa', async () => {
    mockLogin.mockResolvedValue({ step: 'requires_2fa', twoFactorToken: 'tok123' })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.com')
    await userEvent.type(screen.getByLabelText(/parol/i), 'Password@1')
    await userEvent.click(screen.getByRole('button', { name: /kirish/i }))
    await waitFor(() => {
      expect(screen.getByText(/ikki bosqichli/i)).toBeInTheDocument()
    })
  })

  it('transitions to setup_loading when requires_setup', async () => {
    const { authApi } = await import('@/lib/api')
    vi.mocked(authApi.setup2faStart).mockResolvedValue({
      data: { qrCodeUrl: 'data:image/png;base64,abc', secret: 'MYSECRET', backupCodes: [] },
    } as any)
    mockLogin.mockResolvedValue({ step: 'requires_setup', setupToken: 'setup-tok' })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.com')
    await userEvent.type(screen.getByLabelText(/parol/i), 'Password@1')
    await userEvent.click(screen.getByRole('button', { name: /kirish/i }))
    await waitFor(() => {
      expect(authApi.setup2faStart).toHaveBeenCalledWith('setup-tok')
    })
  })

  it('shows VALIDATION_ERROR from API as toast', async () => {
    const { ApiError } = await import('@/lib/api')
    const { toast } = await import('sonner')
    mockLogin.mockRejectedValue(new ApiError(400, 'Invalid email', 'VALIDATION_ERROR'))
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText(/email/i), 'bad@example.com')
    await userEvent.type(screen.getByLabelText(/parol/i), 'pass')
    await userEvent.click(screen.getByRole('button', { name: /kirish/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })
})
