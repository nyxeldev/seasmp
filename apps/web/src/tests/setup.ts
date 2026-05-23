import '@testing-library/jest-dom'

// Silence next/navigation and next/router in tests
vi.mock('next/navigation', () => ({
  useRouter:   () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  redirect:    vi.fn(),
}))

// Suppress console.error noise from intentional error cases
const originalError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Warning:')) return
    originalError(...args)
  }
})
afterAll(() => {
  console.error = originalError
})
