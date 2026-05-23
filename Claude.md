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
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
Hozir: Phase 1 (Docker setup, auth, DB migrations)

## Muhim eslatmalar
- Versiyalarni o'zgartirma — barchasi tekshirilgan
- RBAC middleware — har bir endpoint'da
- Barcha input Zod bilan validate qilinadi
- Har yangi feature uchun test yoz (Jest/Pytest)