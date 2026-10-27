import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listLiveAvailability, suggestPriceArs } from "@/lib/availability";
import type { ServiceType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const checkInDate = sp.get("checkInDate") || "";
  const checkOutDate = sp.get("checkOutDate") || "";
  if (!checkInDate || !checkOutDate) {
    return NextResponse.json({ error: "checkInDate y checkOutDate son obligatorios" }, { status: 400 });
  }

  try {
    const result = await listLiveAvailability(prisma, {
      checkInDate,
      checkOutDate,
      adults: Number(sp.get("adults") || 2),
      children: Number(sp.get("children") || 0),
      mandatoryAttributeIds: (sp.get("mandatory") || "").split(",").filter(Boolean),
      preferenceAttributeIds: (sp.get("preference") || "").split(",").filter(Boolean),
      excludeReservationId: sp.get("excludeReservationId") || undefined,
      softMandatory: sp.get("softMandatory") === "1" || sp.get("softMandatory") === "true",
    });

    const selectionKey = sp.get("selectionKey") || "";
    const serviceType = (sp.get("serviceType") || "DESAYUNO") as ServiceType;
    let suggestedTotalArs: number | null = null;
    if (selectionKey) {
      const cand = result.candidates.find((c) => c.selectionKey === selectionKey);
      if (cand) {
        suggestedTotalArs = await suggestPriceArs(prisma, {
          commercialCategoryId: cand.commercialCategoryId,
          serviceType,
          checkInDate,
          checkOutDate,
        });
      }
    }

    return NextResponse.json({ ...result, suggestedTotalArs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de disponibilidad";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
