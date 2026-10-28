import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listLiveAvailability } from "@/lib/availability";
import { suggestPriceArs, suggestPriceBreakdown } from "@/lib/rates";
import type { ServiceType } from "@prisma/client";
import { loadActiveOpenPeriods } from "@/lib/hotel-open";
import { assertStayDatesOpen, closedNightsInStay } from "@/lib/hotel-calendar";
import { isoDate } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const checkInDate = sp.get("checkInDate") || "";
  const checkOutDate = sp.get("checkOutDate") || "";
  if (!checkInDate || !checkOutDate) {
    return NextResponse.json(
      { error: "checkInDate y checkOutDate son obligatorios" },
      { status: 400 },
    );
  }

  try {
    const openPeriods = await loadActiveOpenPeriods();
    try {
      assertStayDatesOpen(checkInDate, checkOutDate, openPeriods);
    } catch (closedErr) {
      const nights = closedNightsInStay(checkInDate, checkOutDate, openPeriods).map(
        isoDate,
      );
      return NextResponse.json(
        {
          error:
            closedErr instanceof Error
              ? closedErr.message
              : "Hotel cerrado en esas fechas",
          hotelClosed: true,
          closedNights: nights,
        },
        { status: 400 },
      );
    }

    const desired = [
      ...new Set(
        [
          ...(sp.get("desired") || "").split(","),
          ...(sp.get("mandatory") || "").split(","),
          ...(sp.get("preference") || "").split(","),
        ]
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];

    const result = await listLiveAvailability(prisma, {
      checkInDate,
      checkOutDate,
      adults: Number(sp.get("adults") || 2),
      children: Number(sp.get("children") || 0),
      desiredAttributeIds: desired,
      excludeReservationId: sp.get("excludeReservationId") || undefined,
    });

    const selectionKey = sp.get("selectionKey") || "";
    const serviceType = (sp.get("serviceType") || "DESAYUNO") as ServiceType;
    let suggestedTotalArs: number | null = null;
    let priceBreakdown: Awaited<ReturnType<typeof suggestPriceBreakdown>> | null =
      null;
    if (selectionKey) {
      const cand = result.candidates.find((c) => c.selectionKey === selectionKey);
      if (cand) {
        priceBreakdown = await suggestPriceBreakdown(prisma, {
          commercialCategoryId: cand.commercialCategoryId,
          serviceType,
          checkInDate,
          checkOutDate,
        });
        suggestedTotalArs =
          priceBreakdown.totalArs ??
          (await suggestPriceArs(prisma, {
            commercialCategoryId: cand.commercialCategoryId,
            serviceType,
            checkInDate,
            checkOutDate,
          }));
      }
    }

    return NextResponse.json({ ...result, suggestedTotalArs, priceBreakdown });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de disponibilidad";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
