import { format } from "date-fns";
import { CalendarView } from "@/components/CalendarView";
import { loadCalendar } from "@/lib/calendar";

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; days?: string }>;
}) {
  const sp = await searchParams;
  const start = sp.start || format(new Date(), "yyyy-MM-dd");
  const days = Math.min(31, Math.max(7, Number(sp.days || 14)));
  const data = await loadCalendar(start, days);

  return (
    <CalendarView
      days={data.days}
      units={data.units}
      startIso={start}
      dayCount={days}
    />
  );
}
