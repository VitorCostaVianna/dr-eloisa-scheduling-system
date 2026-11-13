'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/dashboard/agenda', label: 'Agenda' },
  { href: '/dashboard/procedimentos', label: 'Procedimentos' },
  { href: '/dashboard/horario', label: 'Horário' },
  { href: '/dashboard/bloqueios', label: 'Bloqueios e feriados' },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Painel" className="flex flex-wrap gap-4 border-b px-6 py-3">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn('text-sm', active ? 'font-semibold underline' : 'text-zinc-600')}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
