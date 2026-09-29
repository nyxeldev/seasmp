-- ═══════════════════════════════════════════════════════════════════════════
-- Foydalanuvchi bildirishnomalari
--
-- Ilgari qo'ng'iroq faqat ADMIN uchun ishlardi va u audit jurnali bilan hal
-- qilinmagan xavfsizlik ogohlantirishlaridan YASALARDI. Ya'ni talabaga
-- "bahoyingiz qo'yildi" yoki o'qituvchiga "kursingizga talaba yozildi"
-- degan xabar berish imkoni umuman yo'q edi: audit jurnali harakatni KIM
-- qilganini yozadi, KIMGA tegishli ekanini emas.
--
-- Bu jadval o'sha bo'shliqni yopadi: qator aynan qabul qiluvchi uchun
-- yaratiladi.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "NotificationType" AS ENUM (
  'ATTENDANCE_MARKED',
  'GRADE_POSTED',
  'ENROLLED',
  'DROPOUT_RISK',
  'SECURITY_ALERT'
);

CREATE TABLE "notifications" (
  "id"         BIGSERIAL PRIMARY KEY,
  "user_id"    UUID NOT NULL,
  "type"       "NotificationType" NOT NULL,
  "title"      VARCHAR(255) NOT NULL,
  "body"       TEXT,
  -- Ilovadagi ichki manzil, masalan /courses/web-dasturlash/attendance
  "link"       VARCHAR(255),
  "data"       JSONB NOT NULL DEFAULT '{}',
  "read_at"    TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Qo'ng'iroq ikki narsani so'raydi: o'qilmaganlar soni va oxirgilar ro'yxati.
-- Ikkalasi ham (user_id, read_at) va sana bo'yicha boradi.
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);
