import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = req.nextUrl.searchParams.get("format") || "json";
  const rows = await prisma.reservation.findMany({
    include: {
      segments: { include: { physicalUnit: true } },
      guests: { include: { guest: true } },
      payments: true,
    },
    orderBy: { checkInDate: "asc" },
  });

  if (format === "csv") {
    const header = [
      "code",
      "status",
      "paymentStatus",
      "checkIn",
      "checkOut",
      "units",
      "agreedPriceArs",
      "channel",
      "doNotMove",
    ];
    const lines = rows.map((r) =>
      [
        r.code,
        r.status,
        r.paymentStatus,
        r.checkInDate.toISOString().slice(0, 10),
        r.checkOutDate.toISOString().slice(0, 10),
        [...new Set(r.segments.map((s) => s.physicalUnit.code))].join("|"),
        r.agreedPriceArs?.toString() ?? "",
        r.channel ?? "",
        r.doNotMove ? "1" : "0",
      ]
        .map(csvEscape)
        .join(","),
    );
    return new NextResponse([header.join(","), ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="reservations.csv"',
      },
    });
  }

  return NextResponse.json(rows);
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
