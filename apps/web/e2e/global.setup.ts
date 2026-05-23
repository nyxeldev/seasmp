import { test as setup } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ADMIN_FILE   = 'playwright/.auth/admin.json'
const STUDENT_FILE = 'playwright/.auth/student.json'

setup('authenticate as admin', async ({ page }) => {
  fs.mkdirSync(path.dirname(ADMIN_FILE), { recursive: true })

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@test.com')
  await page.getByLabel(/parol/i).fill(process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234')
  await page.getByRole('button', { name: /kirish/i }).click()
  await page.waitForURL('**/dashboard')
  await page.context().storageState({ path: ADMIN_FILE })
})

setup('authenticate as student', async ({ page }) => {
  fs.mkdirSync(path.dirname(STUDENT_FILE), { recursive: true })

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.E2E_STUDENT_EMAIL ?? 'student@test.com')
  await page.getByLabel(/parol/i).fill(process.env.E2E_STUDENT_PASSWORD ?? 'Student@1234')
  await page.getByRole('button', { name: /kirish/i }).click()
  await page.waitForURL('**/dashboard')
  await page.context().storageState({ path: STUDENT_FILE })
})
