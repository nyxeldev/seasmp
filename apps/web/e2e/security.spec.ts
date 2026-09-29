import { test, expect } from './fixtures/auth'

test.describe('Security page', () => {
  test('admin can access security dashboard', async ({ adminPage }) => {
    await adminPage.goto('/security')
    await adminPage.waitForSelector('aside', { timeout: 8000 }).catch(() => {})
    await expect(adminPage).not.toHaveURL(/login/)
    await expect(adminPage.getByRole('heading', { name: /xavfsizlik/i })).toBeVisible({ timeout: 5000 })
  })

  test('security alerts section visible', async ({ adminPage }) => {
    await adminPage.goto('/security')
    await adminPage.waitForSelector('aside', { timeout: 8000 }).catch(() => {})
    // Stats cards should be present
    await expect(adminPage.locator('[data-testid="alert-stats"]')).toBeVisible({ timeout: 8000 })
  })

  test('audit log page accessible', async ({ adminPage }) => {
    await adminPage.goto('/security/audit')
    await expect(adminPage).not.toHaveURL(/login/)
  })

  test('student is denied access to security page', async ({ studentPage }) => {
    await studentPage.goto('/security')
    // RoleGuard rol yuklangandan KEYIN router.replace chaqiradi, shuning uchun
    // yo'naltirishni kutish kerak — darhol url() ni o'qish poygaga tushadi.
    await studentPage.waitForURL(/\/(dashboard|login)/, { timeout: 10000 })
    await expect(studentPage).not.toHaveURL(/\/security/)
  })
})
