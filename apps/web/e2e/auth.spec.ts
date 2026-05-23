import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('shows login form', async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/parol/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /kirish/i })).toBeVisible()
  })

  test('shows error for invalid email format', async ({ page }) => {
    await page.getByLabel(/email/i).fill('not-an-email')
    await page.getByLabel(/parol/i).fill('pass')
    await page.getByRole('button', { name: /kirish/i }).click()
    // Either browser validation or toast appears
    const invalid = page.getByLabel(/email/i)
    const isInvalid = await invalid.evaluate((el: HTMLInputElement) => !el.validity.valid)
    const toastVisible = await page.locator('[data-sonner-toast]').isVisible().catch(() => false)
    expect(isInvalid || toastVisible).toBe(true)
  })

  test('shows error for wrong credentials', async ({ page }) => {
    await page.getByLabel(/email/i).fill('nobody@test.com')
    await page.getByLabel(/parol/i).fill('WrongPass@1')
    await page.getByRole('button', { name: /kirish/i }).click()
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 5000 })
  })

  test('redirects unauthenticated /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/login/)
  })
})
