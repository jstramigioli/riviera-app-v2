-- PMS-12: tags deseados (RequirementKind → DESIRED)
-- PMS-13: RatePeriod for tarifas matrix UI

-- CreateTable RatePeriod
CREATE TABLE "RatePeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RatePeriod_validFrom_validTo_idx" ON "RatePeriod"("validFrom", "validTo");

-- AlterTable Rate: add periodId
ALTER TABLE "Rate" ADD COLUMN "periodId" TEXT;

CREATE INDEX "Rate_periodId_idx" ON "Rate"("periodId");

-- Unique per plan+period (NULLs allowed multiple for legacy rates without period)
CREATE UNIQUE INDEX "Rate_ratePlanId_periodId_key" ON "Rate"("ratePlanId", "periodId");

ALTER TABLE "Rate" ADD CONSTRAINT "Rate_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "RatePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate RequirementKind: MANDATORY|PREFERENCE → DESIRED
CREATE TYPE "RequirementKind_new" AS ENUM ('DESIRED');

ALTER TABLE "QueryRequirement" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "QueryRequirement"
  ALTER COLUMN "kind" TYPE "RequirementKind_new"
  USING ('DESIRED'::"RequirementKind_new");

ALTER TABLE "ReservationRequirement" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "ReservationRequirement"
  ALTER COLUMN "kind" TYPE "RequirementKind_new"
  USING ('DESIRED'::"RequirementKind_new");

DROP TYPE "RequirementKind";
ALTER TYPE "RequirementKind_new" RENAME TO "RequirementKind";
