import {
  PrismaClient,
  Role,
  ServiceType,
  UnitKind,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, startOfDay } from "date-fns";

const prisma = new PrismaClient();

/** Riviera inventory: rooms 1–36 except 4 and 20, plus departments. */
const ROOM_CODES = Array.from({ length: 36 }, (_, i) => String(i + 1)).filter(
  (c) => c !== "4" && c !== "20",
);

const DEPTOS = [
  { code: "D1", name: "Depto 1", capacity: 4 },
  { code: "D2", name: "Depto 2", capacity: 4 },
  { code: "D3", name: "Depto 3", capacity: 5 },
];

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);
  const recepcionHash = await bcrypt.hash("recepcion123", 10);

  await prisma.user.upsert({
    where: { email: "admin@riviera.local" },
    update: {},
    create: {
      email: "admin@riviera.local",
      name: "Admin Riviera",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: "recepcion@riviera.local" },
    update: {},
    create: {
      email: "recepcion@riviera.local",
      name: "Melina Recepción",
      passwordHash: recepcionHash,
      role: Role.RECEPCION,
    },
  });

  const attrs = [
    { key: "balcon", label: "Balcón" },
    { key: "vista_mar", label: "Vista al mar" },
    { key: "planta_baja", label: "Planta baja" },
    { key: "ac", label: "Aire acondicionado" },
  ];
  for (const a of attrs) {
    await prisma.unitAttribute.upsert({
      where: { key: a.key },
      update: { label: a.label },
      create: a,
    });
  }

  const categories = [
    { code: "STD", name: "Standard", sortOrder: 1 },
    { code: "SUP", name: "Superior", sortOrder: 2 },
    { code: "DEP", name: "Departamento", sortOrder: 3 },
    { code: "COMP", name: "Habitaciones comunicadas", sortOrder: 4 },
  ];
  for (const c of categories) {
    await prisma.commercialCategory.upsert({
      where: { code: c.code },
      update: { name: c.name, sortOrder: c.sortOrder },
      create: c,
    });
  }

  const std = await prisma.commercialCategory.findUniqueOrThrow({ where: { code: "STD" } });
  const sup = await prisma.commercialCategory.findUniqueOrThrow({ where: { code: "SUP" } });
  const dep = await prisma.commercialCategory.findUniqueOrThrow({ where: { code: "DEP" } });

  let sort = 0;
  for (const code of ROOM_CODES) {
    const n = Number(code);
    const floor = n <= 12 ? 1 : n <= 24 ? 2 : 3;
    const categoryId = n % 5 === 0 ? sup.id : std.id;
    await prisma.physicalUnit.upsert({
      where: { code },
      update: {
        name: `Habitación ${code}`,
        floor,
        capacity: n >= 30 ? 3 : 2,
        sortOrder: sort,
        commercialCategoryId: categoryId,
      },
      create: {
        code,
        name: `Habitación ${code}`,
        kind: UnitKind.HABITACION,
        floor,
        capacity: n >= 30 ? 3 : 2,
        sortOrder: sort,
        commercialCategoryId: categoryId,
      },
    });
    sort += 1;
  }

  for (const d of DEPTOS) {
    await prisma.physicalUnit.upsert({
      where: { code: d.code },
      update: {
        name: d.name,
        capacity: d.capacity,
        sortOrder: sort,
        commercialCategoryId: dep.id,
      },
      create: {
        code: d.code,
        name: d.name,
        kind: UnitKind.DEPARTAMENTO,
        capacity: d.capacity,
        sortOrder: sort,
        commercialCategoryId: dep.id,
      },
    });
    sort += 1;
  }

  const balcon = await prisma.unitAttribute.findUniqueOrThrow({ where: { key: "balcon" } });
  for (const code of ["8", "9", "35", "36", "D1"]) {
    const unit = await prisma.physicalUnit.findUnique({ where: { code } });
    if (!unit) continue;
    await prisma.unitAttributeLink.upsert({
      where: { unitId_attributeId: { unitId: unit.id, attributeId: balcon.id } },
      update: {},
      create: { unitId: unit.id, attributeId: balcon.id },
    });
  }

  async function ensureComposite(code: string, name: string, memberCodes: string[]) {
    const composite = await prisma.compositeUnit.upsert({
      where: { code },
      update: { name, active: true },
      create: { code, name },
    });
    await prisma.compositeUnitMember.deleteMany({ where: { compositeId: composite.id } });
    for (const mc of memberCodes) {
      const unit = await prisma.physicalUnit.findUniqueOrThrow({ where: { code: mc } });
      await prisma.compositeUnitMember.create({
        data: { compositeId: composite.id, unitId: unit.id },
      });
    }
    return composite;
  }

  await ensureComposite("8+9", "Habitaciones comunicadas 8+9", ["8", "9"]);
  await ensureComposite("35+36", "Habitaciones comunicadas 35+36", ["35", "36"]);

  const comp = await prisma.commercialCategory.findUniqueOrThrow({ where: { code: "COMP" } });

  // Temporada base (plan tarifario) — montos solo vía seed/DB, no hardcode en UI
  const from = startOfDay(new Date());
  const to = addDays(from, 365);
  let basePeriod = await prisma.ratePeriod.findFirst({
    where: { name: "Temporada base" },
  });
  if (!basePeriod) {
    basePeriod = await prisma.ratePeriod.create({
      data: {
        name: "Temporada base",
        validFrom: from,
        validTo: to,
        active: true,
      },
    });
  } else {
    basePeriod = await prisma.ratePeriod.update({
      where: { id: basePeriod.id },
      data: { validFrom: from, validTo: to, active: true },
    });
  }

  for (const cat of [std, sup, dep, comp]) {
    for (const service of [ServiceType.SIN_DESAYUNO, ServiceType.DESAYUNO, ServiceType.MEDIA_PENSION]) {
      const name = `${cat.code} / ${service}`;
      const existing = await prisma.ratePlan.findFirst({
        where: { commercialCategoryId: cat.id, serviceType: service },
      });
      const plan =
        existing ??
        (await prisma.ratePlan.create({
          data: {
            name,
            commercialCategoryId: cat.id,
            serviceType: service,
          },
        }));
      const base =
        cat.code === "DEP" ? 180000 : cat.code === "SUP" ? 140000 : cat.code === "COMP" ? 200000 : 110000;
      const bump =
        service === ServiceType.MEDIA_PENSION ? 40000 : service === ServiceType.DESAYUNO ? 20000 : 0;
      const existingRate = await prisma.rate.findFirst({
        where: { ratePlanId: plan.id, periodId: basePeriod.id },
      });
      if (!existingRate) {
        await prisma.rate.create({
          data: {
            ratePlanId: plan.id,
            periodId: basePeriod.id,
            validFrom: from,
            validTo: to,
            amountArs: base + bump,
          },
        });
      }
    }
  }

  await prisma.appSetting.upsert({
    where: { key: "usd_blue_rate" },
    update: { valueJson: { rate: 1400 } },
    create: { key: "usd_blue_rate", valueJson: { rate: 1400 } },
  });

  // Demo reservation for calendar (unit 1, next week) if none
  const demoCount = await prisma.reservation.count();
  if (demoCount === 0) {
    const unit1 = await prisma.physicalUnit.findUniqueOrThrow({ where: { code: "1" } });
    const checkIn = addDays(startOfDay(new Date()), 3);
    const checkOut = addDays(checkIn, 4);
    const guest = await prisma.guest.create({
      data: {
        firstName: "Ana",
        lastName: "Pérez",
        documentType: "DNI",
        documentNumber: "30111222",
        phone: "+54 223 555-0101",
      },
    });
    const reservation = await prisma.reservation.create({
      data: {
        code: "RIV-DEMO-001",
        status: "CONFIRMADA",
        paymentStatus: "SENIA_PARCIAL",
        channel: "WhatsApp",
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: 2,
        serviceType: ServiceType.DESAYUNO,
        agreedPriceArs: 480000,
        priceFrozen: true,
        doNotMove: false,
        notes: "Reserva demo seed",
        segments: {
          create: [
            {
              physicalUnitId: unit1.id,
              startDate: checkIn,
              endDate: checkOut,
              sortOrder: 0,
            },
          ],
        },
        guests: {
          create: [{ guestId: guest.id, role: "TITULAR" }],
        },
      },
    });
    await prisma.payment.create({
      data: {
        reservationId: reservation.id,
        type: "SENIA",
        currency: "ARS",
        amountOriginal: 100000,
        amountArs: 100000,
        receiptNumber: "REC-0001",
        notes: "Seña demo",
      },
    });
  }

  console.log(
    "Seed OK: users, inventory, comunicadas, período Temporada base, rates, demo reservation",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
