import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const format = req.nextUrl.searchParams.get("format") || "csv";
  const rows = await prisma.guest.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  if (format === "json") return NextResponse.json(rows);
  const header = ["lastName", "firstName", "documentType", "documentNumber", "phone", "email"];
  const lines = rows.map((g) =>
    [
      g.lastName,
      g.firstName,
      g.documentType ?? "",
      g.documentNumber ?? "",
      g.phone ?? "",
      g.email ?? "",
    ]
      .map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v))
      .join(","),
  );
  return new NextResponse([header.join(","), ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="guests.csv"',
    },
  });
}
