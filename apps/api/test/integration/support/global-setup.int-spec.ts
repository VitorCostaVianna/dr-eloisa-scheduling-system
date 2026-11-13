import { assertTestDatabaseUrl } from '../../support/global-setup';

describe('assertTestDatabaseUrl', () => {
  it('recusa banco de desenvolvimento', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://u:p@localhost:5432/agendamento_dev'),
    ).toThrow(/_test/);
  });

  it('aceita banco _test, mesmo com query string', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://u:p@localhost:5432/agendamento_test?connection_limit=5',
      ),
    ).not.toThrow();
  });

  it('recusa URL ausente', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/_test/);
  });
});
