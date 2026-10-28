import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadCalendar } from "@/lib/calendar";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const start = sp.get("start") || "";
  const days = Number(sp.get("days") || "21");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return NextResponse.json({ error: "start YYYY-MM-DD requerido" }, { status: 400 });
  }

  try {
    const data = await loadCalendar(start, days);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar calendario";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
