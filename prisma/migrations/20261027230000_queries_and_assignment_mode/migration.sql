-- CreateEnum
CREATE TYPE "QueryStatus" AS ENUM ('OPEN', 'CONVERTED', 'ARCHIVED');

-- AlterTable Reservation: default status PRERRESERVA (CONSULTA remains in enum for legacy rows)
ALTER TABLE "Reservation" ALTER COLUMN "status" SET DEFAULT 'PRERRESERVA';

-- CreateTable
CREATE TABLE "Query" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "QueryStatus" NOT NULL DEFAULT 'OPEN',
    "channel" TEXT,
    "notes" TEXT,
    "checkInDate" DATE NOT NULL,
    "checkOutDate" DATE NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 2,
    "children" INTEGER NOT NULL DEFAULT 0,
    "serviceType" "ServiceType" NOT NULL DEFAULT 'DESAYUNO',
    "guestFirstName" TEXT,
    "guestLastName" TEXT,
    "guestPhone" TEXT,
    "guestEmail" TEXT,
    "guestDocumentNumber" TEXT,
    "guestId" TEXT,
    "convertedReservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Query_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueryRequirement" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "kind" "RequirementKind" NOT NULL,

    CONSTRAINT "QueryRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Query_code_key" ON "Query"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Query_convertedReservationId_key" ON "Query"("convertedReservationId");

-- CreateIndex
CREATE INDEX "Query_status_checkInDate_idx" ON "Query"("status", "checkInDate");

-- CreateIndex
CREATE INDEX "Query_guestLastName_guestFirstName_idx" ON "Query"("guestLastName", "guestFirstName");

-- CreateIndex
CREATE INDEX "QueryRequirement_attributeId_idx" ON "QueryRequirement"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "QueryRequirement_queryId_attributeId_key" ON "QueryRequirement"("queryId", "attributeId");

-- AddForeignKey
ALTER TABLE "Query" ADD CONSTRAINT "Query_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Query" ADD CONSTRAINT "Query_convertedReservationId_fkey" FOREIGN KEY ("convertedReservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryRequirement" ADD CONSTRAINT "QueryRequirement_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "Query"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryRequirement" ADD CONSTRAINT "QueryRequirement_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "UnitAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
