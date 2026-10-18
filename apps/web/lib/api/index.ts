// Domenga ko'ra bo'lingan API klienti. Har bir domen (auth, users, courses, ...)
// o'z faylida, lekin HAMMASI bitta `request`/token mantig'idan (./client)
// foydalanadi. Bu fayl faqat barrel — `@/lib/api` import yo'li o'zgarmaydi,
// shuning uchun mavjud komponentlar qayta yozilishi shart emas.

export {
  api,
  ApiError,
  resolveMediaUrl,
  setTokens,
  clearTokens,
  uploadFile,
  type PaginationMeta,
} from './client'

export * from './auth'
export * from './users'
export * from './courses'
export * from './enrollments'
export * from './attendance'
export * from './assessments'
export * from './analytics'
export * from './security'
export * from './notifications'
export * from './telemetry'
