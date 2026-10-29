import { clinicHolidays, easterSunday, holidaysForDates } from './holidays';

describe('[RN-08] feriados de BH (spec 9.4)', () => {
  // CA-1.10: Dado o cálculo de feriados móveis, então saem certos: ... (Páscoa é a base
  // de Sexta-feira Santa, Carnaval e Corpus Christi).
  it.each([
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2029, '2029-04-01'],
    [2030, '2030-04-21'],
  ])('[CA-1.10] Páscoa de %i = %s', (year, date) => {
    expect(easterSunday(year)).toBe(date);
  });

  // CA-1.10: Sexta-feira Santa: 03/04/2026, 26/03/2027, 14/04/2028, 30/03/2029, 19/04/2030.
  it.each([
    '2026-04-03',
    '2027-03-26',
    '2028-04-14',
    '2029-03-30',
    '2030-04-19',
  ])('[CA-1.10] Sexta-feira Santa %s', (date) => {
    expect(clinicHolidays(Number(date.slice(0, 4))).get(date)).toBe(
      'Sexta-feira da Paixão',
    );
  });

  // CA-1.10: terça de Carnaval: 17/02/2026, 09/02/2027, 29/02/2028 (ano bissexto).
  it.each(['2026-02-17', '2027-02-09', '2028-02-29'])(
    '[CA-1.10] terça de Carnaval %s',
    (date) => {
      expect(clinicHolidays(Number(date.slice(0, 4))).get(date)).toBe(
        'Carnaval (terça-feira)',
      );
    },
  );

  // CA-1.10: Corpus Christi: 04/06/2026, 27/05/2027, 15/06/2028.
  it.each(['2026-06-04', '2027-05-27', '2028-06-15'])(
    '[CA-1.10] Corpus Christi %s',
    (date) => {
      expect(clinicHolidays(Number(date.slice(0, 4))).get(date)).toBe(
        'Corpus Christi',
      );
    },
  );

  // CA-1.8: Dado 02/11/2026 (Finados), 20/11/2026 (Consciência Negra), 25/12/2026,
  // 08/12/2026 (Imaculada Conceição, BH), 26/03/2027 (Sexta-feira Santa), 27/05/2027
  // (Corpus Christi) e 15/08/2028 (Assunção, BH), então ... o painel mostra cada um como
  // feriado com o nome.
  it.each([
    ['2026-11-02', 'Finados'],
    ['2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
    ['2026-12-25', 'Natal'],
    ['2026-12-08', 'Imaculada Conceição'],
    ['2027-03-26', 'Sexta-feira da Paixão'],
    ['2027-05-27', 'Corpus Christi'],
    ['2028-08-15', 'Assunção de Nossa Senhora'],
  ])('[CA-1.8] %s é feriado: %s', (date, name) => {
    expect(clinicHolidays(Number(date.slice(0, 4))).get(date)).toBe(name);
  });

  // CA-1.9: Dado 08/02/2027 e 09/02/2027 (segunda e terça de Carnaval), então nenhum
  // início; dado 10/02/2027 (Quarta de Cinzas), horários normais de quarta (RN-09).
  it('[CA-1.9] 08/02 e 09/02/2027 são Carnaval; 10/02/2027 (Cinzas) não é feriado', () => {
    const holidays = clinicHolidays(2027);
    expect(holidays.get('2027-02-08')).toBe('Carnaval (segunda-feira)');
    expect(holidays.get('2027-02-09')).toBe('Carnaval (terça-feira)');
    expect(holidays.has('2027-02-10')).toBe(false);
  });

  it('2026 tem exatamente 15 feriados', () => {
    expect(clinicHolidays(2026).size).toBe(15);
  });

  it('12/12 (aniversário de BH) não é feriado', () => {
    expect(clinicHolidays(2026).has('2026-12-12')).toBe(false);
  });

  it('holidaysForDates une os anos que aparecem nas datas', () => {
    const holidays = holidaysForDates(['2026-12-31', '2027-01-01']);
    expect(holidays.get('2027-01-01')).toBe('Confraternização Universal');
    expect(holidays.get('2026-12-25')).toBe('Natal');
  });

  it('dois feriados na mesma data têm os nomes unidos por " / " na ordem da tabela', () => {
    // 2079: Páscoa em 23/04, logo a Sexta-feira Santa (Páscoa − 2) cai em 21/04.
    expect(easterSunday(2079)).toBe('2079-04-23');
    expect(clinicHolidays(2079).get('2079-04-21')).toBe(
      'Sexta-feira da Paixão / Tiradentes',
    );
  });
});
