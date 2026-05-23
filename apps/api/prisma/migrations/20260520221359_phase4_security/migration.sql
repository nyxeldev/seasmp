-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('BRUTE_FORCE', 'MULTI_DEVICE', 'UNUSUAL_HOUR', 'BULK_DELETE', 'RATE_LIMIT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'TWO_FA_SETUP';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FA_DISABLE';
ALTER TYPE "AuditAction" ADD VALUE 'BACKUP_CODE_USED';
ALTER TYPE "AuditAction" ADD VALUE 'IP_BLOCKED';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "status_code" INTEGER;

-- CreateTable
CREATE TABLE "backup_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_alerts" (
    "id" BIGSERIAL NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "user_id" UUID,
    "ip_address" VARCHAR(45),
    "details" JSONB NOT NULL DEFAULT '{}',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_blocks" (
    "id" BIGSERIAL NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "blocked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ip_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_codes_user_id_idx" ON "backup_codes"("user_id");

-- CreateIndex
CREATE INDEX "security_alerts_type_idx" ON "security_alerts"("type");

-- CreateIndex
CREATE INDEX "security_alerts_severity_idx" ON "security_alerts"("severity");

-- CreateIndex
CREATE INDEX "security_alerts_resolved_idx" ON "security_alerts"("resolved");

-- CreateIndex
CREATE INDEX "security_alerts_created_at_idx" ON "security_alerts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ip_blocks_ip_address_key" ON "ip_blocks"("ip_address");

-- CreateIndex
CREATE INDEX "ip_blocks_expires_at_idx" ON "ip_blocks"("expires_at");

-- AddForeignKey
ALTER TABLE "backup_codes" ADD CONSTRAINT "backup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_alerts" ADD CONSTRAINT "security_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_alerts" ADD CONSTRAINT "security_alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
