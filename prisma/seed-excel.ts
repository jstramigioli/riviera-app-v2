/**
 * Seed high-confidence Excel extractions into the DB.
 *
 * Prerequisites:
 *   1. `npm run db:seed` (inventory, users, tarifas, temporadas)
 *   2. `npm run migration:extract-excel` (includes Julián 2026-10-28 date fixes)
 *   3. Review migration/staging/ambiguous-report.md
 *
 * Guard: refuses unless ALLOW_EXCEL_SEED=1.
 * Only imports rows with confidence=high / classification=recoverable.
 * Prefers the structured "Reservas" sheet; falls back to Libro merges for
 * units/dates not already covered (guest+unit+checkIn key).
 * Waitlist sheet rows are never imported (they are aspirantes, not VIA_I bookings).
 */
import fs from "fs";
import path from "path";
import {
  PrismaClient,
  type ReservationStatus,
  type ServiceType,
} from "@prisma/client";
import { createReservation } from "../src/lib/reservations";

const extractedPath = path.join(process.cwd(), "migration/staging/extracted.json");

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
  notes?: string;
  channel?: string;
  doNotMove?: boolean;
  adults?: number | null;
  serviceType?: string | null;
  confidence: string;
  classification?: string;
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
      r.unit &&
      r.checkIn &&
      r.checkOut,
  );

  // Prefer structured Reservas sheet; then fill gaps from calendar merges.
  const reservas = high.filter((r) => r.source === "Reservas");
  const merges = high.filter((r) => r.source === "Libro de reservas");
  const seen = new Set(reservas.map((r) => keyOf(r.unit, r.checkIn, r.guest)));
  const mergedExtras = merges.filter((r) => !seen.has(keyOf(r.unit, r.checkIn, r.guest)));
  const toImport = [...reservas, ...mergedExtras];

  const prisma = new PrismaClient();
  let ok = 0;
  let failed = 0;
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
      const price = row.price ? Number(row.price) : null;

      const reservation = await createReservation({
        physicalUnitId,
        compositeUnitId,
        checkInDate: row.checkIn,
        checkOutDate: row.checkOut,
        status: status === "CONSULTA" ? "PRERRESERVA" : status,
        channel: row.channel || "Excel",
        notes: [row.notes, row.sourceRef ? `[excel:${row.sourceRef}]` : ""]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000),
        agreedPriceArs: Number.isFinite(price) ? price : null,
        freezePrice: status === "CONFIRMADA",
        doNotMove: Boolean(row.doNotMove),
        adults: row.adults ?? 2,
        serviceType,
      });

      const { firstName, lastName } = guestParts(row);
      const guest = await prisma.guest.create({ data: { firstName, lastName } });
      await prisma.reservationGuest.create({
        data: { reservationId: reservation.id, guestId: guest.id, role: "TITULAR" },
      });

      ok += 1;
      console.log("OK", reservation.code, row.unit, row.checkIn, firstName, lastName);
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
        skippedLow: data.rows.length - high.length,
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
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
