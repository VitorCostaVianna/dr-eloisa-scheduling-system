import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HolidayList } from './holiday-list';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

describe('[W] HolidayList - navegação de ano', () => {
  it('[W] ano comum oferece "Ano anterior" e "Próximo ano"', () => {
    render(<HolidayList holidays={[]} year={2026} />);
    expect(screen.getByRole('link', { name: 'Ano anterior' })).toHaveAttribute('href', '?ano=2025');
    expect(screen.getByRole('link', { name: 'Próximo ano' })).toHaveAttribute('href', '?ano=2027');
  });

  it('[W] no ano mínimo (2000) não há "Ano anterior"', () => {
    render(<HolidayList holidays={[]} year={2000} />);
    expect(screen.queryByRole('link', { name: 'Ano anterior' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Próximo ano' })).toBeInTheDocument();
  });

  it('[W] no ano máximo (2100) não há "Próximo ano"', () => {
    render(<HolidayList holidays={[]} year={2100} />);
    expect(screen.queryByRole('link', { name: 'Próximo ano' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ano anterior' })).toBeInTheDocument();
  });
});
