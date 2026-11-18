import { ERROR_MESSAGE, ERROR_STATUS } from './error-codes';

describe('códigos de erro', () => {
  const expected = {
    VALIDATION_FAILED: 400,
    NOT_FOUND: 404,
    UNSUPPORTED_MEDIA_TYPE: 415,
    PROCEDURE_NAME_TAKEN: 409,
    INVALID_DURATION: 422,
    PROCEDURE_INACTIVE: 422,
    NOT_A_HOLIDAY: 422,
  };

  it('ERROR_STATUS e ERROR_MESSAGE têm as mesmas chaves e cobrem os 7 códigos', () => {
    const codes = Object.keys(expected).sort();
    expect(Object.keys(ERROR_STATUS).sort()).toEqual(codes);
    expect(Object.keys(ERROR_MESSAGE).sort()).toEqual(codes);
  });

  it('cada código mapeia para o status HTTP combinado', () => {
    expect(ERROR_STATUS).toEqual(expected);
  });

  it('toda mensagem é um texto não vazio', () => {
    for (const msg of Object.values(ERROR_MESSAGE)) {
      expect(msg.trim().length).toBeGreaterThan(0);
    }
  });
});
