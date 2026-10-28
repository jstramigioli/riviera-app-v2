-- CreateTable
CREATE TABLE "HotelClosedPeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "closedFrom" DATE NOT NULL,
    "closedTo" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelClosedPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelClosedPeriod_closedFrom_closedTo_idx" ON "HotelClosedPeriod"("closedFrom", "closedTo");
