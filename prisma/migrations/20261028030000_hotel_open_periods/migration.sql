-- DropTable (provisional closed-period model from PMS-14; Julián confirmed open windows)
DROP TABLE IF EXISTS "HotelClosedPeriod";

-- CreateTable
CREATE TABLE "HotelOpenPeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "openFrom" DATE NOT NULL,
    "openTo" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelOpenPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelOpenPeriod_openFrom_openTo_idx" ON "HotelOpenPeriod"("openFrom", "openTo");
