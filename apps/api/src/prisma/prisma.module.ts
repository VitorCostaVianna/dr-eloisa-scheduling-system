import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() é intencional: PrismaService é infraestrutura consumida por praticamente
// todo módulo de domínio (services, patients, appointments...). Deixar global evita
// reimportar PrismaModule em cada *.module.ts novo — é uma exceção justificada ao
// princípio geral de módulos explícitos, não o padrão do projeto (módulos de domínio
// continuam se comunicando só via eventos, nunca chamada direta).
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
