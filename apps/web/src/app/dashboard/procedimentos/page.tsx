import type { ProcedureDto } from '@sistema-agendamento/shared-types';
import { apiServer } from '@/lib/api-server';
import { ProcedureForm } from '@/components/procedures/procedure-form';
import { ProcedureList } from '@/components/procedures/procedure-list';

export default async function ProcedimentosPage() {
  const procedures = await apiServer<ProcedureDto[]>('/procedures');
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Procedimentos</h1>
      <ProcedureForm />
      <ProcedureList procedures={procedures} />
    </main>
  );
}
