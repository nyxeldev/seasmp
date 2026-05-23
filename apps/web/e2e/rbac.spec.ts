import { test, expect } from './fixtures/auth'

test.describe('RBAC — route access', () => {
  test('admin can access /users', async ({ adminPage }) => {
    await adminPage.goto('/users')
    await expect(adminPage).not.toHaveURL(/login/)
  })

  test('student is denied /users', async ({ studentPage }) => {
    await studentPage.goto('/users')
    await studentPage.waitForSelector('aside', { timeout: 8000 }).catch(() => {})
    const denied     = await studentPage.getByText(/kirish taqiqlangan|forbidden/i).isVisible().catch(() => false)
    const redirected = studentPage.url().includes('login') || studentPage.url().includes('dashboard')
    expect(denied || redirected).toBe(true)
  })

  test('admin can access /analytics', async ({ adminPage }) => {
    await adminPage.goto('/analytics')
    await expect(adminPage).not.toHaveURL(/login/)
  })

  test('student cannot access /security/audit', async ({ studentPage }) => {
    await studentPage.goto('/security/audit')
    await studentPage.waitForSelector('aside', { timeout: 8000 }).catch(() => {})
    const denied     = await studentPage.getByText(/kirish taqiqlangan|forbidden/i).isVisible().catch(() => false)
    const redirected = studentPage.url().includes('login') || studentPage.url().includes('dashboard')
    expect(denied || redirected).toBe(true)
  })

  test('sidebar shows role-appropriate links for admin', async ({ adminPage }) => {
    await adminPage.goto('/dashboard')
    await expect(adminPage.getByRole('link', { name: /foydalanuvchilar|users/i })).toBeVisible()
  })

  test('sidebar shows role-appropriate links for student', async ({ studentPage }) => {
    await studentPage.goto('/dashboard')
    // Students should not see the Users management link
    await expect(studentPage.getByRole('link', { name: /foydalanuvchilar|users/i })).not.toBeVisible()
  })
})
