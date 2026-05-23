import { test as base, type Page } from '@playwright/test'

export type AuthFixtures = {
  adminPage:   Page
  studentPage: Page
}

export const test = base.extend<AuthFixtures>({
  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: 'playwright/.auth/admin.json',
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },

  studentPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: 'playwright/.auth/student.json',
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },
})

export { expect } from '@playwright/test'
