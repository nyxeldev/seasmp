import { api } from './client'
import type { User } from './users'

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{
      success: boolean
      data:
        | { accessToken: string; user: User }
        | { requiresTwoFactor: true; twoFactorToken: string }
        | { requiresTwoFactorSetup: true; setupToken: string }
    }>('/v1/auth/login', { email, password }, null),

  logout: () => api.post('/v1/auth/logout'),

  verify2fa: (twoFactorToken: string, code: string) =>
    api.post<{ success: boolean; data: { accessToken: string; user: User } }>(
      '/v1/auth/2fa/verify', { twoFactorToken, code }, null
    ),

  backupCode: (twoFactorToken: string, backupCode: string) =>
    api.post<{ success: boolean; data: { accessToken: string; user: User } }>(
      '/v1/auth/2fa/backup', { twoFactorToken, backupCode }, null
    ),

  setup2faStart: (setupToken: string) =>
    api.post<{ success: boolean; data: { qrCodeUrl: string; secret: string; backupCodes: string[] } }>(
      '/v1/auth/2fa/setup-start', { setupToken }, null
    ),

  setup2faFinish: (setupToken: string, code: string) =>
    api.post<{ success: boolean; data: { message: string; backupCodes: string[]; accessToken: string; user: User } }>(
      '/v1/auth/2fa/setup-finish', { setupToken, code }, null
    ),

  setup2fa: () =>
    api.get<{ success: boolean; data: { qrCodeUrl: string; secret: string } }>('/v1/auth/2fa/setup'),
}
