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
    // Kurslar jadvalda emas, kartalarda ko'rsatiladi — har birida /courses/<slug>
    // havolasi bor. Ilgari bu yerda <table> kutilardi va test hech qachon o'tmasdi.
    const cards = adminPage.locator('a[href^="/courses/"]')
    const empty = adminPage.getByText(/kurslar mavjud emas|kurs topilmadi|no courses/i)
    await expect(cards.first().or(empty)).toBeVisible({ timeout: 10000 })
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
