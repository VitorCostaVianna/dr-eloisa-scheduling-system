import {
  BLOCKS_LIST_MAX_DAYS,
  type BlockDto,
  type HolidayDto,
} from '@sistema-agendamento/shared-types';
import { apiServer } from '@/lib/api-server';
import { addDays, todayInClinic } from '@/lib/clinic-time';
import { parseYear } from '@/lib/holiday-year';
import { BlockForm } from '@/components/schedule/block-form';
import { BlockList } from '@/components/schedule/block-list';
import { HolidayList } from '@/components/schedule/holiday-list';


export default async function BloqueiosPage({ searchParams }: PageProps<'/dashboard/bloqueios'>) {
  const today = todayInClinic();
  const { ano } = await searchParams;
  const year = parseYear(ano, Number(today.slice(0, 4)));
  const [blocks, holidays] = await Promise.all([
    apiServer<BlockDto[]>(`/blocks?from=${today}&to=${addDays(today, BLOCKS_LIST_MAX_DAYS - 1)}`),
    apiServer<HolidayDto[]>(`/holidays?year=${year}`),
  ]);
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Bloqueios e feriados</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Bloqueios</h2>
        <BlockForm />
        <BlockList blocks={blocks} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Feriados</h2>
        <HolidayList holidays={holidays} year={year} />
      </section>
    </main>
  );
}
