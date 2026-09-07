import { getCurrentUser } from '@/lib/auth';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  return (
    <main>
      <h1>Painel</h1>
      <p>Logada como {user.role === 'DENTIST' ? 'dentista' : 'equipe'}.</p>
    </main>
  );
}
