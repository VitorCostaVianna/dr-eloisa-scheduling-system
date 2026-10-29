export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

/** Único `new Date()` de produção; o resto recebe `now` por parâmetro. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
