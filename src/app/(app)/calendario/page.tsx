import { prisma } from "@/lib/db";
import { loadCalendar, resolveCalendarFocusIso } from "@/lib/calendar";
import { CalendarBoard } from "@/components/CalendarBoard";
import { shiftIsoHelper } from "./focus";

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; days?: string }>;
}) {
  const sp = await searchParams;
  const focusIso = sp.start || (await resolveCalendarFocusIso());
  // Initial window centered on focus; client grows/shifts with scroll + viewport.
  const initialDays = Math.min(60, Math.max(21, Number(sp.days || 35)));
  const half = Math.floor(initialDays / 2);
  const startIso = shiftIsoHelper(focusIso, -half);
  const [data, attributes] = await Promise.all([
    loadCalendar(startIso, initialDays),
    prisma.unitAttribute.findMany({
      orderBy: { label: "asc" },
      select: { id: true, key: true, label: true },
    }),
  ]);

  return (
    <CalendarBoard
      focusIso={focusIso}
      attributes={attributes}
      initial={{
        startIso: data.startIso,
        dayCount: data.dayCount,
        days: data.days,
        units: data.units,
      }}
    />
  );
}
