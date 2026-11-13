import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Única origem do professionalId: nunca vem do cliente.
@Injectable()
export class ProfessionalContextService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<string> {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!professional) {
      throw new Error(
        'Usuário sem profissional associada (erro de configuração)',
      );
    }
    return professional.id;
  }

  async forPublic(): Promise<string> {
    const found = await this.prisma.professional.findMany({
      where: { user: { role: 'DENTIST' } },
      select: { id: true },
      take: 2,
    });
    if (found.length !== 1) {
      throw new Error(
        'Esperada exatamente uma profissional ligada a um usuário DENTIST (erro de configuração)',
      );
    }
    return found[0].id;
  }
}
