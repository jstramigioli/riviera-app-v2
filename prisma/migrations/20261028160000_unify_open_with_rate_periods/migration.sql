-- Unify hotel open seasons with tariff periods (D-10).
-- RatePeriod becomes the single source of open nights + rates.

ALTER TABLE "RatePeriod" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Promote former HotelOpenPeriod rows into RatePeriod when name does not already exist.
INSERT INTO "RatePeriod" ("id", "name", "validFrom", "validTo", "active", "notes", "createdAt", "updatedAt")
SELECT
  "id",
  "name",
  "openFrom",
  "openTo",
  "active",
  "notes",
  "createdAt",
  "updatedAt"
FROM "HotelOpenPeriod" h
WHERE NOT EXISTS (
  SELECT 1 FROM "RatePeriod" r WHERE r."name" = h."name"
);

DROP TABLE IF EXISTS "HotelOpenPeriod";
