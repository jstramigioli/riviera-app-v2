import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const format = req.nextUrl.searchParams.get("format") || "csv";
  const rows = await prisma.payment.findMany({
    include: { reservation: true },
    orderBy: { createdAt: "asc" },
  });
  if (format === "json") return NextResponse.json(rows);

  const header = [
    "receiptNumber",
    "reservationCode",
    "type",
    "currency",
    "amountOriginal",
    "fxRateToArs",
    "amountArs",
    "voidedAt",
  ];
  const lines = rows.map((p) =>
    [
      p.receiptNumber,
      p.reservation.code,
      p.type,
      p.currency,
      p.amountOriginal.toString(),
      p.fxRateToArs?.toString() ?? "",
      p.amountArs.toString(),
      p.voidedAt?.toISOString() ?? "",
    ].join(","),
  );
  return new NextResponse([header.join(","), ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="payments.csv"',
    },
  });
}
