import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHolidayOverrideDto } from './create-holiday-override.dto';

// Mesma faixa de anos do GET /holidays: desbloqueio fora dela ficaria invisível na lista.
async function errorsFor(date: unknown): Promise<string[]> {
  const dto = plainToInstance(CreateHolidayOverrideDto, { date });
  return (await validate(dto)).map((e) => e.property);
}

describe('CreateHolidayOverrideDto', () => {
  it.each(['2000-01-01', '2026-12-08', '2100-12-25'])(
    'aceita %s (dentro de 2000–2100, inclusive datas passadas)',
    async (date) => {
      expect(await errorsFor(date)).toEqual([]);
    },
  );

  it.each(['1999-12-31', '2101-01-01', '0001-01-01', '9998-12-25'])(
    'recusa %s (fora de 2000–2100)',
    async (date) => {
      expect(await errorsFor(date)).toEqual(['date']);
    },
  );

  it.each(['2026-02-30', '08/12/2026', 20261208, undefined])(
    'recusa data inválida %p',
    async (date) => {
      expect(await errorsFor(date)).toEqual(['date']);
    },
  );
});
