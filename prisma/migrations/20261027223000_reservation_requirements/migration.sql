-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('MANDATORY', 'PREFERENCE');

-- CreateTable
CREATE TABLE "ReservationRequirement" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "kind" "RequirementKind" NOT NULL,

    CONSTRAINT "ReservationRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationRequirement_attributeId_idx" ON "ReservationRequirement"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationRequirement_reservationId_attributeId_key" ON "ReservationRequirement"("reservationId", "attributeId");

-- AddForeignKey
ALTER TABLE "ReservationRequirement" ADD CONSTRAINT "ReservationRequirement_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationRequirement" ADD CONSTRAINT "ReservationRequirement_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "UnitAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
