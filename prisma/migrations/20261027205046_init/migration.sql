-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECEPCION');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONSULTA', 'PRERRESERVA', 'CONFIRMADA', 'CANCELADA', 'IN_HOUSE', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SIN_PAGO', 'SENIA_PARCIAL', 'PARCIAL', 'SALDADO', 'A_FAVOR');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('SIN_DESAYUNO', 'DESAYUNO', 'MEDIA_PENSION');

-- CreateEnum
CREATE TYPE "GuestRole" AS ENUM ('TITULAR', 'ACOMPANANTE');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('SENIA', 'PARCIAL', 'FINAL', 'DEVOLUCION');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ARS', 'USD');

-- CreateEnum
CREATE TYPE "UnitKind" AS ENUM ('HABITACION', 'DEPARTAMENTO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RECEPCION',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalUnit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "UnitKind" NOT NULL DEFAULT 'HABITACION',
    "floor" INTEGER,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "tenantId" TEXT,
    "commercialCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitAttribute" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitAttributeLink" (
    "unitId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,

    CONSTRAINT "UnitAttributeLink_pkey" PRIMARY KEY ("unitId","attributeId")
);

-- CreateTable
CREATE TABLE "CommercialCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompositeUnit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompositeUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompositeUnitMember" (
    "compositeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "CompositeUnitMember_pkey" PRIMARY KEY ("compositeId","unitId")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commercialCategoryId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rate" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "amountArs" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "documentType" TEXT,
    "documentNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "nationality" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONSULTA',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'SIN_PAGO',
    "channel" TEXT,
    "doNotMove" BOOLEAN NOT NULL DEFAULT false,
    "requirements" TEXT,
    "preferences" TEXT,
    "notes" TEXT,
    "checkInDate" DATE NOT NULL,
    "checkOutDate" DATE NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 2,
    "children" INTEGER NOT NULL DEFAULT 0,
    "serviceType" "ServiceType" NOT NULL DEFAULT 'DESAYUNO',
    "agreedPriceArs" DECIMAL(12,2),
    "priceFrozen" BOOLEAN NOT NULL DEFAULT false,
    "priceOverrideNote" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentSegment" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "physicalUnitId" TEXT NOT NULL,
    "compositeUnitId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssignmentSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationGuest" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "role" "GuestRole" NOT NULL DEFAULT 'ACOMPANANTE',

    CONSTRAINT "ReservationGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "amountOriginal" DECIMAL(12,2) NOT NULL,
    "fxRateToArs" DECIMAL(12,4),
    "amountArs" DECIMAL(12,2) NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalUnit_code_key" ON "PhysicalUnit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UnitAttribute_key_key" ON "UnitAttribute"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialCategory_code_key" ON "CommercialCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CompositeUnit_code_key" ON "CompositeUnit"("code");

-- CreateIndex
CREATE INDEX "RatePlan_commercialCategoryId_serviceType_idx" ON "RatePlan"("commercialCategoryId", "serviceType");

-- CreateIndex
CREATE INDEX "Rate_ratePlanId_validFrom_validTo_idx" ON "Rate"("ratePlanId", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "Guest_lastName_firstName_idx" ON "Guest"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Guest_documentNumber_idx" ON "Guest"("documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_code_key" ON "Reservation"("code");

-- CreateIndex
CREATE INDEX "Reservation_checkInDate_checkOutDate_idx" ON "Reservation"("checkInDate", "checkOutDate");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");

-- CreateIndex
CREATE INDEX "Reservation_groupId_idx" ON "Reservation"("groupId");

-- CreateIndex
CREATE INDEX "AssignmentSegment_physicalUnitId_startDate_endDate_idx" ON "AssignmentSegment"("physicalUnitId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "AssignmentSegment_reservationId_idx" ON "AssignmentSegment"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationGuest_reservationId_guestId_key" ON "ReservationGuest"("reservationId", "guestId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");

-- CreateIndex
CREATE INDEX "Payment_reservationId_idx" ON "Payment"("reservationId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- AddForeignKey
ALTER TABLE "PhysicalUnit" ADD CONSTRAINT "PhysicalUnit_commercialCategoryId_fkey" FOREIGN KEY ("commercialCategoryId") REFERENCES "CommercialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitAttributeLink" ADD CONSTRAINT "UnitAttributeLink_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "PhysicalUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitAttributeLink" ADD CONSTRAINT "UnitAttributeLink_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "UnitAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositeUnitMember" ADD CONSTRAINT "CompositeUnitMember_compositeId_fkey" FOREIGN KEY ("compositeId") REFERENCES "CompositeUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositeUnitMember" ADD CONSTRAINT "CompositeUnitMember_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "PhysicalUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_commercialCategoryId_fkey" FOREIGN KEY ("commercialCategoryId") REFERENCES "CommercialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ReservationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSegment" ADD CONSTRAINT "AssignmentSegment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSegment" ADD CONSTRAINT "AssignmentSegment_physicalUnitId_fkey" FOREIGN KEY ("physicalUnitId") REFERENCES "PhysicalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSegment" ADD CONSTRAINT "AssignmentSegment_compositeUnitId_fkey" FOREIGN KEY ("compositeUnitId") REFERENCES "CompositeUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationGuest" ADD CONSTRAINT "ReservationGuest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationGuest" ADD CONSTRAINT "ReservationGuest_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
