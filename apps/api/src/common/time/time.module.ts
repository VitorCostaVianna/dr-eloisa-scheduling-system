import { Global, Module } from '@nestjs/common';
import { CLOCK, SystemClock } from './clock';

// @Global() para qualquer caso de uso injetar o CLOCK sem reimportar o módulo; os testes
// trocam a implementação com overrideProvider(CLOCK).
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class TimeModule {}
