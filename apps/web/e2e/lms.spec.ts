import { test, expect } from './fixtures/auth'

test.describe('Dashboard', () => {
  test('admin sees dashboard page', async ({ adminPage }) => {
    await adminPage.goto('/dashboard')
    await expect(adminPage).toHaveURL(/dashboard/)
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('courses page lists courses', async ({ adminPage }) => {
    await adminPage.goto('/courses')
    await expect(adminPage).toHaveURL(/courses/)
    await adminPage.waitForSelector('aside', { timeout: 8000 }).catch(() => {})
    const hasTable = await adminPage.locator('table').isVisible().catch(() => false)
    const hasEmpty = await adminPage.getByText(/kurs yo'q|no courses/i).isVisible().catch(() => false)
    expect(hasTable || hasEmpty).toBe(true)
  })

  test('student can see active courses', async ({ studentPage }) => {
    await studentPage.goto('/courses')
    await expect(studentPage).toHaveURL(/courses/)
  })

  test('enrollment page is accessible to admin', async ({ adminPage }) => {
    await adminPage.goto('/enrollments')
    await expect(adminPage).not.toHaveURL(/login/)
  })

  test('attendance page accessible', async ({ adminPage }) => {
    await adminPage.goto('/attendance')
    await expect(adminPage).not.toHaveURL(/login/)
  })
})
