import { getCurrentUser } from '@/lib/auth';
import { DashboardNav } from '@/components/dashboard/nav';

export default async function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  // Redireciona para /login se a sessão não for válida (a checagem real é da API).
  await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      <DashboardNav />
      <div className="flex flex-1 flex-col p-6">{children}</div>
    </div>
  );
}
