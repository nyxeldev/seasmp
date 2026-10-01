# SEASMP Loyiha Konteksti

## Spesifikatsiya
Bu loyiha SEASMP_TechSpec_v2.pdf asosida quriladi.
Hujjatni o'qish: `cat SEASMP_TechSpec_v2.pdf` yoki `docs/` papkasida.

## Stack (muhim)
- Frontend: Next.js 16.2.6 + React 19 + TypeScript 5.8 + Tailwind 4.3 + ShadCN
- Backend: Node.js v22 + Fastify v5 + Prisma v6
- Analytics: Python 3.13 + FastAPI 0.115 + Scikit-learn 1.5
- DB: PostgreSQL 17 + Redis 7.4
- Infra: Docker 27 + Nginx 1.26

## Arxitektura qoidalari
- Monorepo: /frontend, /api, /analytics, /nginx papkalar
- Har bir servis alohida Docker container
- Faqat Nginx tashqi internetga ochiq (80/443)
- seasmp-network — ichki private network

## Boshlash tartibi

| Bosqich | Mazmuni | Holat |
|---|---|---|
| **Phase 1** | Docker Compose, autentifikatsiya (JWT + 2FA), DB migratsiyalari | ✅ tugallangan |
| **Phase 2** | Asosiy LMS: kurslar, ro'yxatga olish, davomat (qo'lda + QR), baholar, RBAC middleware | ✅ tugallangan |
| **Phase 3** | Analitika servisi (FastAPI): xavf tahlili, ML dropout bashorati (RandomForest), Celery kechasi hisob-kitob | ✅ tugallangan |
| **Phase 4** | Ikki qatlamli xavfsizlik aniqlash: 1-qatlam avtorizatsiya (SELF/OWNER/CUSTODIAN/PRIVILEGED/FOREIGN/UNKNOWN), 2-qatlam xatti-harakat (UEBA, 30 kunlik profil), korrelyatsiya qatlami | ✅ tugallangan |
| **Phase 5** | Real vaqt (autentifikatsiyalangan Socket.io), foydalanuvchi bildirishnomalari, xato monitoringi (Sentry, ixtiyoriy), N+1 optimallashtirish | ✅ tugallangan |
| **Phase 6** | Ilmiy validatsiya (BMI uchun): E1 (CMU CERT tashqi benchmark), E2 (ko'r baholash), Bosqich B (egalik munosabatlarini trafikdan avtomatik chiqarish — ilmiy yangilikning yadrosi) | 🔄 ishlanmoqda |

**Hozir:** E1/E2 tugallangan va `main`da (AUC: E1=0.650, E2=0.980 — batafsil
[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) 15-bo'lim). Bosqich B — avtomatik
egalik chiqarish algoritmi (`services/ownershipInference.ts`,
`tools/inferOwnership.ts`) yozilgan va haqiqiy trafikda sinalgan: 4/4
tekshirilishi mumkin bo'lgan MANUAL qoida 0.929–1.000 ishonch bilan
qayta kashf etildi. Batafsil: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
16-bo'lim.

## Muhim eslatmalar
- Versiyalarni o'zgartirma — barchasi tekshirilgan
- RBAC middleware — har bir endpoint'da
- Barcha input Zod bilan validate qilinadi
- Har yangi feature uchun test yoz (Jest/Pytest)