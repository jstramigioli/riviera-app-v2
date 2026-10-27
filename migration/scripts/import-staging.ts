/**
 * Import ONLY high-confidence extracted rows.
 * Refuses to run unless ALLOW_STAGING_IMPORT=1.
 * Does not touch production blindly — use a staging DATABASE_URL.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { createReservation } from "../../src/lib/reservations";

const extractedPath = path.join(process.cwd(), "migration/staging/extracted.json");

async function main() {
  if (process.env.ALLOW_STAGING_IMPORT !== "1") {
    console.error("Refusing import. Set ALLOW_STAGING_IMPORT=1 after reviewing ambiguous-report.md");
    process.exit(1);
  }
  if (!fs.existsSync(extractedPath)) {
    console.error("Missing extracted.json — run migration:extract");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(extractedPath, "utf8")) as {
    rows: {
      unit: string;
      checkIn: string;
      checkOut: string;
      guest: string;
      status: string;
      price: string;
      notes: string;
      channel: string;
      confidence: string;
    }[];
  };

  const prisma = new PrismaClient();
  const high = data.rows.filter((r) => r.confidence === "high");
  let ok = 0;
  let failed = 0;

  for (const row of high) {
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

      const reservation = await createReservation({
        physicalUnitId,
        compositeUnitId,
        checkInDate: row.checkIn,
        checkOutDate: row.checkOut,
        status: (row.status as "CONSULTA" | "PRERRESERVA" | "CONFIRMADA") || "CONSULTA",
        channel: row.channel || "Excel",
        notes: row.notes || undefined,
        agreedPriceArs: row.price ? Number(row.price) : null,
        freezePrice: row.status === "CONFIRMADA",
      });

      if (row.guest) {
        const parts = row.guest.split(/\s+/);
        const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
        const lastName = parts.length > 1 ? parts[parts.length - 1] : "—";
        const guest = await prisma.guest.create({ data: { firstName, lastName } });
        await prisma.reservationGuest.create({
          data: { reservationId: reservation.id, guestId: guest.id, role: "TITULAR" },
        });
      }
      ok += 1;
      console.log("OK", reservation.code, row.unit, row.checkIn);
    } catch (e) {
      failed += 1;
      console.error("FAIL", row.unit, row.checkIn, e instanceof Error ? e.message : e);
    }
  }

  await prisma.$disconnect();
  console.log(`Done. imported=${ok} failed=${failed} skipped_low=${data.rows.length - high.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
