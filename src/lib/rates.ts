import type { PrismaClient, ServiceType } from "@prisma/client";
import { eachNight, isoDate, rangesOverlap, toDateOnly } from "./dates";
import { toDecimal } from "./money";

type Db = PrismaClient;

export type NightPriceLine = {
  date: string;
  amountArs: number | null;
  periodId: string | null;
  periodName: string | null;
  missing: boolean;
};

export type PriceBreakdown = {
  nights: NightPriceLine[];
  totalArs: number | null;
  hasGaps: boolean;
};

export type RateMatrixCell = {
  commercialCategoryId: string;
  serviceType: ServiceType;
  amountArs: number | null;
  rateId: string | null;
  ratePlanId: string | null;
};

export type PeriodWithMatrix = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string;
  active: boolean;
  updatedAt: string;
  cells: RateMatrixCell[];
};

export type PeriodOverlap = {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  from: string;
  to: string;
};

function spanDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

/** Night covered if validFrom ≤ night ≤ validTo (inclusive). */
function coversNight(
  validFrom: Date,
  validTo: Date,
  night: Date,
): boolean {
  return validFrom <= night && night <= validTo;
}

type RateCandidate = {
  amountArs: number;
  validFrom: Date;
  validTo: Date;
  updatedAt: Date;
  periodId: string | null;
  periodName: string | null;
};

/**
 * Most-specific wins: shortest date span; if tie, latest updatedAt.
 */
export function pickMostSpecificRate(candidates: RateCandidate[]): RateCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const sa = spanDays(a.validFrom, a.validTo);
    const sb = spanDays(b.validFrom, b.validTo);
    if (sa !== sb) return sa - sb;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0]!;
}

export async function suggestPriceBreakdown(
  db: Db,
  input: {
    commercialCategoryId: string | null;
    serviceType: ServiceType;
    checkInDate: string;
    checkOutDate: string;
  },
): Promise<PriceBreakdown> {
  const empty: PriceBreakdown = { nights: [], totalArs: null, hasGaps: true };
  if (!input.commercialCategoryId) return empty;

  const checkIn = toDateOnly(input.checkInDate);
  const checkOut = toDateOnly(input.checkOutDate);
  const nights = eachNight(checkIn, checkOut);
  if (nights.length === 0) return empty;

  const plans = await db.ratePlan.findMany({
    where: {
      active: true,
      commercialCategoryId: input.commercialCategoryId,
      serviceType: input.serviceType,
    },
    include: {
      rates: {
        include: { period: { select: { id: true, name: true, active: true } } },
      },
    },
  });

  const lines: NightPriceLine[] = [];
  let total = 0;
  let hasGaps = false;

  for (const night of nights) {
    const candidates: RateCandidate[] = [];
    for (const plan of plans) {
      for (const r of plan.rates) {
        if (r.period && !r.period.active) continue;
        if (!coversNight(r.validFrom, r.validTo, night)) continue;
        candidates.push({
          amountArs: Number(r.amountArs),
          validFrom: r.validFrom,
          validTo: r.validTo,
          updatedAt: r.updatedAt,
          periodId: r.periodId,
          periodName: r.period?.name ?? null,
        });
      }
    }
    const picked = pickMostSpecificRate(candidates);
    if (!picked) {
      hasGaps = true;
      lines.push({
        date: isoDate(night),
        amountArs: null,
        periodId: null,
        periodName: null,
        missing: true,
      });
    } else {
      total += picked.amountArs;
      lines.push({
        date: isoDate(night),
        amountArs: picked.amountArs,
        periodId: picked.periodId,
        periodName: picked.periodName,
        missing: false,
      });
    }
  }

  return {
    nights: lines,
    totalArs: hasGaps ? null : total,
    hasGaps,
  };
}

export async function suggestPriceArs(
  db: Db,
  input: {
    commercialCategoryId: string | null;
    serviceType: ServiceType;
    checkInDate: string;
    checkOutDate: string;
  },
): Promise<number | null> {
  const b = await suggestPriceBreakdown(db, input);
  return b.totalArs;
}

export function findPeriodOverlaps(
  periods: { id: string; name: string; validFrom: Date; validTo: Date; active: boolean }[],
): PeriodOverlap[] {
  const active = periods.filter((p) => p.active);
  const overlaps: PeriodOverlap[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!;
      const b = active[j]!;
      // Periods use inclusive nights; treat as [from, to+1day) for overlap check
      const aEnd = new Date(a.validTo.getTime() + 24 * 60 * 60 * 1000);
      const bEnd = new Date(b.validTo.getTime() + 24 * 60 * 60 * 1000);
      if (!rangesOverlap(a.validFrom, aEnd, b.validFrom, bEnd)) continue;
      const from = a.validFrom > b.validFrom ? a.validFrom : b.validFrom;
      const to = a.validTo < b.validTo ? a.validTo : b.validTo;
      overlaps.push({
        aId: a.id,
        aName: a.name,
        bId: b.id,
        bName: b.name,
        from: isoDate(from),
        to: isoDate(to),
      });
    }
  }
  return overlaps;
}

async function ensureRatePlan(
  db: Db,
  commercialCategoryId: string,
  serviceType: ServiceType,
) {
  const existing = await db.ratePlan.findFirst({
    where: { commercialCategoryId, serviceType, active: true },
  });
  if (existing) return existing;
  const cat = await db.commercialCategory.findUniqueOrThrow({
    where: { id: commercialCategoryId },
  });
  return db.ratePlan.create({
    data: {
      name: `${cat.code} / ${serviceType}`,
      commercialCategoryId,
      serviceType,
    },
  });
}

export async function listPeriodsWithMatrix(db: Db): Promise<{
  periods: PeriodWithMatrix[];
  overlaps: PeriodOverlap[];
  categories: { id: string; code: string; name: string; sortOrder: number }[];
  serviceTypes: ServiceType[];
}> {
  const [periods, categories] = await Promise.all([
    db.ratePeriod.findMany({
      orderBy: [{ validFrom: "asc" }, { name: "asc" }],
      include: {
        rates: {
          include: {
            ratePlan: { select: { id: true, commercialCategoryId: true, serviceType: true } },
          },
        },
      },
    }),
    db.commercialCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, sortOrder: true },
    }),
  ]);

  const serviceTypes: ServiceType[] = ["SIN_DESAYUNO", "DESAYUNO", "MEDIA_PENSION"];

  const mapped: PeriodWithMatrix[] = periods.map((p) => {
    const cellMap = new Map<string, RateMatrixCell>();
    for (const r of p.rates) {
      const key = `${r.ratePlan.commercialCategoryId}:${r.ratePlan.serviceType}`;
      cellMap.set(key, {
        commercialCategoryId: r.ratePlan.commercialCategoryId,
        serviceType: r.ratePlan.serviceType,
        amountArs: Number(r.amountArs),
        rateId: r.id,
        ratePlanId: r.ratePlanId,
      });
    }
    const cells: RateMatrixCell[] = [];
    for (const cat of categories) {
      for (const st of serviceTypes) {
        const key = `${cat.id}:${st}`;
        cells.push(
          cellMap.get(key) ?? {
            commercialCategoryId: cat.id,
            serviceType: st,
            amountArs: null,
            rateId: null,
            ratePlanId: null,
          },
        );
      }
    }
    return {
      id: p.id,
      name: p.name,
      validFrom: isoDate(p.validFrom),
      validTo: isoDate(p.validTo),
      active: p.active,
      updatedAt: p.updatedAt.toISOString(),
      cells,
    };
  });

  return {
    periods: mapped,
    overlaps: findPeriodOverlaps(periods),
    categories,
    serviceTypes,
  };
}

export async function createRatePeriod(
  db: Db,
  input: {
    name: string;
    validFrom: string;
    validTo: string;
    active?: boolean;
    copyFromPeriodId?: string;
    percentAdjust?: number;
  },
) {
  const validFrom = toDateOnly(input.validFrom);
  const validTo = toDateOnly(input.validTo);
  if (validFrom > validTo) {
    throw new Error("La fecha hasta debe ser posterior o igual a desde");
  }

  const period = await db.ratePeriod.create({
    data: {
      name: input.name.trim(),
      validFrom,
      validTo,
      active: input.active ?? true,
    },
  });

  if (input.copyFromPeriodId) {
    await copyPeriodRates(db, {
      sourcePeriodId: input.copyFromPeriodId,
      targetPeriodId: period.id,
      percentAdjust: input.percentAdjust ?? 0,
    });
  }

  return period;
}

export async function updateRatePeriodMeta(
  db: Db,
  input: {
    id: string;
    name?: string;
    validFrom?: string;
    validTo?: string;
    active?: boolean;
  },
) {
  const current = await db.ratePeriod.findUniqueOrThrow({ where: { id: input.id } });
  const validFrom = input.validFrom ? toDateOnly(input.validFrom) : current.validFrom;
  const validTo = input.validTo ? toDateOnly(input.validTo) : current.validTo;
  if (validFrom > validTo) {
    throw new Error("La fecha hasta debe ser posterior o igual a desde");
  }

  const updated = await db.ratePeriod.update({
    where: { id: input.id },
    data: {
      name: input.name?.trim() ?? current.name,
      validFrom,
      validTo,
      active: input.active ?? current.active,
    },
  });

  // Keep linked rates' date range in sync with the period
  await db.rate.updateMany({
    where: { periodId: updated.id },
    data: { validFrom, validTo },
  });

  return updated;
}

export async function deleteRatePeriod(db: Db, id: string) {
  await db.ratePeriod.delete({ where: { id } });
}

export type CellSave = {
  commercialCategoryId: string;
  serviceType: ServiceType;
  /** null / undefined → clear cell (delete rate) */
  amountArs: number | null;
};

/** Explicit save of period matrix cells (TAR-UI). */
export async function savePeriodCells(
  db: Db,
  periodId: string,
  cells: CellSave[],
) {
  const period = await db.ratePeriod.findUniqueOrThrow({ where: { id: periodId } });

  for (const cell of cells) {
    const plan = await ensureRatePlan(db, cell.commercialCategoryId, cell.serviceType);
    const existing = await db.rate.findFirst({
      where: { ratePlanId: plan.id, periodId },
    });

    if (cell.amountArs == null || !(cell.amountArs > 0)) {
      if (existing) await db.rate.delete({ where: { id: existing.id } });
      continue;
    }

    if (existing) {
      await db.rate.update({
        where: { id: existing.id },
        data: {
          amountArs: toDecimal(cell.amountArs),
          validFrom: period.validFrom,
          validTo: period.validTo,
        },
      });
    } else {
      await db.rate.create({
        data: {
          ratePlanId: plan.id,
          periodId,
          validFrom: period.validFrom,
          validTo: period.validTo,
          amountArs: toDecimal(cell.amountArs),
        },
      });
    }
  }

  return listPeriodsWithMatrix(db);
}

export async function copyPeriodRates(
  db: Db,
  input: {
    sourcePeriodId: string;
    targetPeriodId: string;
    percentAdjust?: number;
  },
) {
  const source = await db.ratePeriod.findUniqueOrThrow({
    where: { id: input.sourcePeriodId },
    include: {
      rates: { include: { ratePlan: true } },
    },
  });
  const target = await db.ratePeriod.findUniqueOrThrow({
    where: { id: input.targetPeriodId },
  });
  const factor = 1 + (input.percentAdjust ?? 0) / 100;

  const cells: CellSave[] = source.rates.map((r) => ({
    commercialCategoryId: r.ratePlan.commercialCategoryId,
    serviceType: r.ratePlan.serviceType,
    amountArs: Math.round(Number(r.amountArs) * factor),
  }));

  // Clear target first then write
  await db.rate.deleteMany({ where: { periodId: target.id } });
  await savePeriodCells(db, target.id, cells);
  return target;
}
