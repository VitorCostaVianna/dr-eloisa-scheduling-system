import type { CalendarResponse } from "@sistema-agendamento/shared-types";
import { apiServer } from "@/lib/api-server";
import { addDays, todayInClinic } from "@/lib/clinic-time";
import { parseWeekStart } from "@/lib/week-param";
import { WeekView } from "@/components/calendar/week-view";

export default async function AgendaPage({
  searchParams,
}: PageProps<"/dashboard/agenda">) {
  const { semana } = await searchParams;
  const weekStart = parseWeekStart(semana, todayInClinic());
  const calendar = await apiServer<CalendarResponse>(
    `/calendar?from=${weekStart}&to=${addDays(weekStart, 6)}`,
  );
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Agenda</h1>
      <WeekView calendar={calendar} weekStart={weekStart} />
    </main>
  );
}
