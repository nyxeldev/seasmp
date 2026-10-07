import { api } from './client'

/**
 * Brauzerdagi xatolarni serverga yuboradi.
 *
 * Ataylab `void` qaytaradi va hech qachon istisno tashlamaydi: xato haqida
 * xabar berishda yuz bergan xato foydalanuvchiga ko'rinmasligi kerak.
 */
export const telemetryApi = {
  clientError: (payload: {
    message: string
    stack?: string
    path?: string
    componentStack?: string
  }): void => {
    api.post('/v1/telemetry/client-error', payload).catch(() => { /* jim */ })
  },
}
