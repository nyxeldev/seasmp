import { test as setup } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// Standart hisoblar prisma/seed.ts yaratadiganlar bilan bir xil bo'lishi kerak.
// Ilgari bu yerda admin@test.com / student@test.com turardi — bazada bunday
// foydalanuvchi yo'q, shuning uchun setup login'da qotib qolardi va butun
// E2E to'plami hech qachon ishlamagan.

const ADMIN_FILE   = 'playwright/.auth/admin.json'
const STUDENT_FILE = 'playwright/.auth/student.json'

setup('authenticate as admin', async ({ page }) => {
  fs.mkdirSync(path.dirname(ADMIN_FILE), { recursive: true })

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@seasmp.uz')
  await page.getByLabel(/parol/i).fill(process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234')
  await page.getByRole('button', { name: /kirish/i }).click()
  await page.waitForURL('**/dashboard')
  await page.context().storageState({ path: ADMIN_FILE })
})

setup('authenticate as student', async ({ page }) => {
  fs.mkdirSync(path.dirname(STUDENT_FILE), { recursive: true })

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.E2E_STUDENT_EMAIL ?? 'student1@seasmp.uz')
  await page.getByLabel(/parol/i).fill(process.env.E2E_STUDENT_PASSWORD ?? 'Student@1234')
  await page.getByRole('button', { name: /kirish/i }).click()
  await page.waitForURL('**/dashboard')
  await page.context().storageState({ path: STUDENT_FILE })
})
