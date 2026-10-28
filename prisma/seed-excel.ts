/**
 * Seed high-confidence Excel extractions into the DB.
 *
 * Prerequisites:
 *   1. `npm run db:seed`
 *   2. `npm run migration:extract-excel`
 *   3. Review migration/staging/ambiguous-report.md
 *
 * Guard: ALLOW_EXCEL_SEED=1
 *
 * Persists:
 *  - adults/children/guestCount from "x N" notes
 *  - N guest slots (1 TITULAR + acompañantes sin nombre)
 *  - phone/email/DNI on titular Guest
 *  - agreedPriceArs + Payment (SENIA/FINAL) from comment money
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  PrismaClient,
  type Currency,
  type PaymentType,
  type ReservationStatus,
  type ServiceType,
} from "@prisma/client";
import { createReservation, refreshPaymentStatus } from "../src/lib/reservations";

const extractedPath = path.join(process.cwd(), "migration/staging/extracted.json");

type ExtractedPayment = {
  type: string;
  currency: string;
  amountOriginal: number;
  amountArs?: number | null;
  fxRateToArs?: number | null;
  paidOn?: string | null;
  raw?: string;
  note?: string;
};

type ExtractedRow = {
  source: string;
  sourceRef?: string;
  unit: string;
  checkIn: string;
  checkOut: string;
  guest: string;
  firstName?: string;
  lastName?: string;
  status: string;
  price?: string;
  agreedPriceArs?: number | null;
  notes?: string;
  channel?: string;
  doNotMove?: boolean;
  adults?: number | null;
  children?: number | null;
  guestCount?: number | null;
  phone?: string | null;
  email?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  serviceType?: string | null;
  confidence: string;
  classification?: string;
  payments?: ExtractedPayment[];
  moneyHints?: string[];
  moneyWarnings?: string[];
  creditArs?: number | null;
};

function guestParts(row: ExtractedRow): { firstName: string; lastName: string } {
  if (row.firstName || row.lastName) {
    return {
      firstName: row.firstName?.trim() || "—",
      lastName: row.lastName?.trim() || "—",
    };
  }
  const cleaned = (row.guest || "")
    .replace(/\s*x\s*\d+.*$/i, "")
    .replace(/\s*-\s*no mover.*$/i, "")
    .replace(/^SC\s+/i, "")
    .replace(/^BK\s+/i, "")
    .trim();
  if (!cleaned) return { firstName: "Huésped", lastName: "Excel" };
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "—" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function keyOf(unit: string, checkIn: string, guest: string): string {
  return `${unit}|${checkIn}|${guest.trim().toLowerCase()}`;
}

function agreedPrice(row: ExtractedRow): number | null {
  if (typeof row.agreedPriceArs === "number" && Number.isFinite(row.agreedPriceArs)) {
    return row.agreedPriceArs;
  }
  if (row.price) {
    const n = Number(row.price);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function guestCountOf(row: ExtractedRow): { adults: number; children: number; slots: number } {
  const adults = Math.max(1, Number(row.adults) || Number(row.guestCount) || 2);
  const children = Math.max(0, Number(row.children) || 0);
  const slots = Math.max(adults + children, Number(row.guestCount) || adults + children, 1);
  return { adults, children, slots };
}

async function nextReceiptNumber(prisma: PrismaClient): Promise<string> {
  const count = await prisma.payment.count();
  return `REC-XLS-${String(count + 1).padStart(4, "0")}`;
}

async function seedPayments(
  prisma: PrismaClient,
  reservationId: string,
  payments: ExtractedPayment[],
): Promise<number> {
  let created = 0;
  for (const p of payments) {
    const currency = (p.currency || "ARS").toUpperCase() as Currency;
    const type = (p.type || "SENIA").toUpperCase() as PaymentType;
    const amountOriginal = Number(p.amountOriginal);
    if (!Number.isFinite(amountOriginal) || amountOriginal <= 0) continue;

    let amountArs = p.amountArs != null ? Number(p.amountArs) : null;
    const fx = p.fxRateToArs != null ? Number(p.fxRateToArs) : null;

    if (currency === "USD") {
      if (amountArs == null || !(fx && fx > 0)) {
        console.warn("SKIP USD payment without ARS/FX", p.raw);
        continue;
      }
    } else {
      amountArs = amountArs ?? amountOriginal;
    }

    const receiptNumber = await nextReceiptNumber(prisma);
    await prisma.payment.create({
      data: {
        reservationId,
        type,
        currency,
        amountOriginal,
        fxRateToArs: currency === "USD" ? fx : null,
        amountArs: amountArs!,
        receiptNumber,
        notes: [p.raw, p.note, p.paidOn ? `fecha nota: ${p.paidOn}` : ""]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 500),
      },
    });
    created += 1;
  }
  if (created) await refreshPaymentStatus(reservationId);
  return created;
}

async function seedGuests(
  prisma: PrismaClient,
  reservationId: string,
  row: ExtractedRow,
  slots: number,
): Promise<number> {
  const { firstName, lastName } = guestParts(row);
  const titular = await prisma.guest.create({
    data: {
      firstName,
      lastName,
      phone: row.phone || null,
      email: row.email || null,
      documentType: row.documentType || (row.documentNumber ? "DNI" : null),
      documentNumber: row.documentNumber || null,
      notes: row.phone || row.email ? "Contacto importado desde Excel (comentario)" : null,
    },
  });
  await prisma.reservationGuest.create({
    data: { reservationId, guestId: titular.id, role: "TITULAR" },
  });

  let created = 1;
  for (let i = 2; i <= slots; i++) {
    const companion = await prisma.guest.create({
      data: {
        firstName: `Acompañante ${i}`,
        lastName: lastName !== "—" ? lastName : "Sin nombre",
        notes: "Cupo de huésped importado desde Excel (sin nombre individual)",
      },
    });
    await prisma.reservationGuest.create({
      data: { reservationId, guestId: companion.id, role: "ACOMPANANTE" },
    });
    created += 1;
  }
  return created;
}

async function main() {
  if (process.env.ALLOW_EXCEL_SEED !== "1") {
    console.error(
      "Refusing Excel seed. Set ALLOW_EXCEL_SEED=1 after reviewing ambiguous-report.md",
    );
    process.exit(1);
  }
  if (!fs.existsSync(extractedPath)) {
    console.error("Missing extracted.json — run npm run migration:extract-excel");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(extractedPath, "utf8")) as {
    sourceSha256?: string;
    counts?: Record<string, number>;
    rows: ExtractedRow[];
  };

  const high = data.rows.filter(
    (r) =>
      (r.confidence === "high" || r.classification === "recoverable") &&
      r.classification !== "unit_header" &&
      r.classification !== "ignore" &&
      r.classification !== "waitlist" &&
      r.classification !== "noise" &&
      r.unit &&
      r.checkIn &&
      r.checkOut,
  );

  // Prefer Reservas (enriched with Libro money/contact). Only add Libro merges
  // when that unit+check-in is not already covered — avoids double-booking the
  // same stay under different guest-label keys.
  const reservas = high.filter((r) => r.source === "Reservas");
  const merges = high.filter((r) => r.source === "Libro de reservas");
  const seenUnitStay = new Set(reservas.map((r) => `${r.unit}|${r.checkIn}`));
  const seenGuest = new Set(reservas.map((r) => keyOf(r.unit, r.checkIn, r.guest)));
  const mergedExtras = merges.filter((r) => {
    const unitStay = `${r.unit}|${r.checkIn}`;
    if (seenUnitStay.has(unitStay)) return false;
    if (seenGuest.has(keyOf(r.unit, r.checkIn, r.guest))) return false;
    // Also skip if any composite member stay already imported (8 vs 8+9)
    if (r.unit.includes("+")) {
      const parts = r.unit.split("+");
      if (parts.some((p) => seenUnitStay.has(`${p}|${r.checkIn}`))) return false;
    } else {
      for (const u of seenUnitStay) {
        const [code, cin] = u.split("|");
        if (cin === r.checkIn && code.includes("+") && code.split("+").includes(r.unit)) {
          return false;
        }
      }
    }
    seenUnitStay.add(unitStay);
    return true;
  });
  const toImport = [...reservas, ...mergedExtras];

  const prisma = new PrismaClient();
  let ok = 0;
  let failed = 0;
  let paymentsCreated = 0;
  let guestsCreated = 0;
  let withPrice = 0;
  let withContact = 0;
  const failures: string[] = [];

  for (const row of toImport) {
    try {
      const isComposite = row.unit.includes("+");
      let physicalUnitId: string | undefined;
      let compositeUnitId: string | undefined;
      if (isComposite) {
        const c = await prisma.compositeUnit.findUnique({ where: { code: row.unit } });
        if (!c) throw new Error(`Composite not found: ${row.unit}`);
        compositeUnitId = c.id;
      } else {
        const u = await prisma.physicalUnit.findUnique({ where: { code: row.unit } });
        if (!u) throw new Error(`Unit not found: ${row.unit}`);
        physicalUnitId = u.id;
      }

      const status = (row.status as ReservationStatus) || "PRERRESERVA";
      const serviceType = (row.serviceType as ServiceType | undefined) || undefined;
      const price = agreedPrice(row);
      if (price != null) withPrice += 1;
      if (row.phone || row.email || row.documentNumber) withContact += 1;

      const { adults, children, slots } = guestCountOf(row);

      const moneyMeta = [
        row.moneyHints?.length ? `hints=${row.moneyHints.join(",")}` : "",
        row.moneyWarnings?.length ? `warn=${row.moneyWarnings.join(",")}` : "",
        row.creditArs != null ? `a_favor=${row.creditArs}` : "",
        `guestCount=${slots}`,
      ]
        .filter(Boolean)
        .join(" · ");

      const reservation = await createReservation({
        physicalUnitId,
        compositeUnitId,
        checkInDate: row.checkIn,
        checkOutDate: row.checkOut,
        status: status === "CONSULTA" ? "PRERRESERVA" : status,
        channel: row.channel || "Excel",
        notes: [row.notes, row.sourceRef ? `[excel:${row.sourceRef}]` : "", moneyMeta]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000),
        agreedPriceArs: price,
        freezePrice: status === "CONFIRMADA" || price != null,
        doNotMove: Boolean(row.doNotMove),
        adults,
        children,
        serviceType,
      });

      // Defend against any layer dropping price (should already be set).
      if (price != null && reservation.agreedPriceArs == null) {
        await prisma.reservation.update({
          where: { id: reservation.id },
          data: { agreedPriceArs: price, priceFrozen: true },
        });
      }

      const gCount = await seedGuests(prisma, reservation.id, row, slots);
      guestsCreated += gCount;

      const payCount = await seedPayments(prisma, reservation.id, row.payments || []);
      paymentsCreated += payCount;

      ok += 1;
      console.log(
        "OK",
        reservation.code,
        row.unit,
        row.checkIn,
        `guests=${gCount}`,
        price != null ? `price=${price}` : "price=∅",
        payCount ? `payments=${payCount}` : "",
        row.phone ? `tel=${row.phone}` : "",
      );
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${row.unit} ${row.checkIn} ${row.guest}: ${msg}`);
      console.error("FAIL", row.unit, row.checkIn, msg);
    }
  }

  await prisma.$disconnect();
  console.log(
    JSON.stringify(
      {
        sourceSha256: data.sourceSha256,
        imported: ok,
        failed,
        withAgreedPrice: withPrice,
        withContact,
        guestsCreated,
        paymentsCreated,
        considered: toImport.length,
        fromReservas: reservas.length,
        fromMergesExtra: mergedExtras.length,
      },
      null,
      2,
    ),
  );
  if (failures.length) {
    console.error("Failures:\n" + failures.slice(0, 30).join("\n"));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
