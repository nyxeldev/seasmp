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
| **Phase 6** | Ilmiy validatsiya (BMI uchun): E1 — tashqi benchmark (CMU CERT Insider Threat r4.2) ustida haqiqiy ROC/AUC; E2 — ko'r baholash (threshold/vaznlardan mustaqil yozilgan ssenariylar, haqiqiy DB orqali) | 🔄 ishlanmoqda — `claude/e1-e2-experiments` shoxida |

**Hozir:** Phase 6 — natijalar `apps/api/src/tools/blindEval.ts` (E2, tugallangan) va
tashqi CMU CERT dataset asosidagi baholash skriptida (E1) hisoblanmoqda. Batafsil:
[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) 13- va 15-bo'limlar.

## Muhim eslatmalar
- Versiyalarni o'zgartirma — barchasi tekshirilgan
- RBAC middleware — har bir endpoint'da
- Barcha input Zod bilan validate qilinadi
- Har yangi feature uchun test yoz (Jest/Pytest)