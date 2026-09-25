-- SEASMP — ikki qatlamli aniqlash tizimi uchun sxema kengaytmasi
-- 1-qatlam: avtorizatsiya (obyekt-egalik) | 2-qatlam: xatti-harakat profillari

-- ─── 1. AuditLog kengaytmasi ─────────────────────────────────────────────────
ALTER TABLE "audit_logs" ADD COLUMN "resource_owner_id" UUID;
ALTER TABLE "audit_logs" ADD COLUMN "http_method" VARCHAR(10);
ALTER TABLE "audit_logs" ADD COLUMN "path" VARCHAR(255);
ALTER TABLE "audit_logs" ADD COLUMN "duration_ms" INTEGER;

CREATE INDEX "audit_logs_resource_owner_id_idx" ON "audit_logs"("resource_owner_id");
CREATE INDEX "audit_logs_cross_access_idx" ON "audit_logs"("user_id", "resource_owner_id")
  WHERE "resource_owner_id" IS NOT NULL;

-- ─── 2. Egalik qoidalari (1-qatlam) ──────────────────────────────────────────
CREATE TYPE "OwnershipSource" AS ENUM ('MANUAL', 'INFERRED');

CREATE TABLE "ownership_rules" (
  "id"            BIGSERIAL PRIMARY KEY,
  "resource_type" VARCHAR(100) NOT NULL,
  "owner_path"    VARCHAR(255) NOT NULL,
  "source"        "OwnershipSource" NOT NULL DEFAULT 'MANUAL',
  "confidence"    DECIMAL(5,4),
  "support_count" INTEGER NOT NULL DEFAULT 0,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ownership_rules_type_path_key" UNIQUE ("resource_type", "owner_path")
);
CREATE INDEX "ownership_rules_resource_type_idx" ON "ownership_rules"("resource_type");
CREATE INDEX "ownership_rules_source_idx" ON "ownership_rules"("source");

-- ─── 3. Xatti-harakat profillari (2-qatlam) ──────────────────────────────────
CREATE TABLE "user_behavior_profiles" (
  "id"                 BIGSERIAL PRIMARY KEY,
  "user_id"            UUID NOT NULL,
  "hour_histogram"     JSONB NOT NULL DEFAULT '[]',
  "weekday_histogram"  JSONB NOT NULL DEFAULT '[]',
  "known_ips"          JSONB NOT NULL DEFAULT '[]',
  "known_user_agents"  JSONB NOT NULL DEFAULT '[]',
  "resource_mix"       JSONB NOT NULL DEFAULT '{}',
  "req_per_hour_mean"  DECIMAL(10,4),
  "req_per_hour_std"   DECIMAL(10,4),
  "sample_count"       INTEGER NOT NULL DEFAULT 0,
  "window_start"       TIMESTAMPTZ,
  "window_end"         TIMESTAMPTZ,
  "model_version"      VARCHAR(50),
  "trained_at"         TIMESTAMPTZ,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "user_behavior_profiles_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "user_behavior_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "user_behavior_profiles_trained_at_idx" ON "user_behavior_profiles"("trained_at");

-- ─── 4. SecurityAlert kengaytmasi ────────────────────────────────────────────
CREATE TYPE "DetectionLayer" AS ENUM ('AUTHORIZATION', 'BEHAVIOR', 'CORRELATED');

ALTER TABLE "security_alerts" ADD COLUMN "layer" "DetectionLayer";
ALTER TABLE "security_alerts" ADD COLUMN "score" DECIMAL(5,4);
ALTER TABLE "security_alerts" ADD COLUMN "detector_version" VARCHAR(50);
ALTER TABLE "security_alerts" ADD COLUMN "audit_log_id" BIGINT;

CREATE INDEX "security_alerts_layer_idx" ON "security_alerts"("layer");
CREATE INDEX "security_alerts_score_idx" ON "security_alerts"("score");

ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'UNAUTHORIZED_OBJECT_ACCESS';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'PRIVILEGE_ESCALATION';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BEHAVIOR_ANOMALY';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'MASS_DATA_ACCESS';

-- ─── 5. AuditAction kengaytmasi ──────────────────────────────────────────────
-- ACCESS         — muvaffaqiyatli so'rov (to'liq hodisa qamrovi uchun)
-- ACCESS_DENIED  — 401/403 bilan rad etilgan urinish. Hozir bular umuman
--                  qayd etilmaydi: aynan shu iz yo'qligi asosiy bo'shliq edi.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCESS';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCESS_DENIED';

-- ─── 6. Egalik roli va murojaat munosabati ───────────────────────────────────
-- OWNER     — obyekt kimga tegishli (talaba -> o'z bahosi)
-- CUSTODIAN — kim javobgar (o'qituvchi -> o'z kursidagi baho)
CREATE TYPE "OwnerRole" AS ENUM ('OWNER', 'CUSTODIAN');
ALTER TABLE "ownership_rules" ADD COLUMN "role" "OwnerRole" NOT NULL DEFAULT 'OWNER';

-- FOREIGN  — ruxsatsiz obyektga murojaat belgisi (1-qatlamning asosiy signali)
-- UNKNOWN  — bu resurs turi uchun qoida yo'q, ya'ni qamrov bo'shlig'i
CREATE TYPE "AccessRelation" AS ENUM ('SELF','OWNER','CUSTODIAN','PRIVILEGED','FOREIGN','UNKNOWN');
ALTER TABLE "audit_logs" ADD COLUMN "access_relation" "AccessRelation";
CREATE INDEX "audit_logs_access_relation_idx" ON "audit_logs"("access_relation");

-- ─── 7. Boshlang'ich egalik qoidalari (Bosqich A — qo'lda) ───────────────────
-- Bular servis kodidagi ~22 ta tarqoq tekshiruvdan ajratib olindi.
INSERT INTO "ownership_rules" ("resource_type","owner_path","role","source","updated_at") VALUES
  ('users',       'id',                          'OWNER',     'MANUAL', now()),
  ('courses',     'teacherId',                   'CUSTODIAN', 'MANUAL', now()),
  ('enrollments', 'studentId',                   'OWNER',     'MANUAL', now()),
  ('enrollments', 'course.teacherId',            'CUSTODIAN', 'MANUAL', now()),
  ('assessments', 'course.teacherId',            'CUSTODIAN', 'MANUAL', now()),
  ('grades',      'enrollment.studentId',        'OWNER',     'MANUAL', now()),
  ('grades',      'enrollment.course.teacherId', 'CUSTODIAN', 'MANUAL', now()),
  ('attendance',  'enrollment.studentId',        'OWNER',     'MANUAL', now()),
  ('attendance',  'enrollment.course.teacherId', 'CUSTODIAN', 'MANUAL', now())
ON CONFLICT ("resource_type","owner_path") DO NOTHING;
