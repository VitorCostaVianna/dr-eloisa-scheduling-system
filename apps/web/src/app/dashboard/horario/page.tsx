import type { WorkingHoursDto } from '@sistema-agendamento/shared-types';
import { apiServer } from '@/lib/api-server';
import { formatWeekdayLine, groupWorkingHours } from '@/lib/working-hours';

export default async function HorarioPage() {
  const rows = await apiServer<WorkingHoursDto[]>('/working-hours');
  const lines = groupWorkingHours(rows).map(formatWeekdayLine);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Horário de atendimento</h1>
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
