import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokens } from './types/auth-tokens.type';
import { JwtPayload } from './types/jwt-payload.type';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Hash fixo calculado uma vez no load do módulo, usado só pra gastar o custo de CPU do
// argon2 quando o usuário não existe (ver login() abaixo) — nunca comparado com um
// valor real. Sem isso, "usuário não existe" (retorno imediato) e "senha errada"
// (retorno só depois do custo do argon2) são distinguíveis por tempo de resposta, mesmo
// com a mesma mensagem de erro (401 genérico) nos dois casos.
const DUMMY_PASSWORD_HASH = argon2.hash(
  'not-a-real-password-used-only-for-timing-equalization',
);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Gasta o mesmo custo de CPU que o caminho "usuário existe, senha errada" abaixo,
      // pra não vazar via timing se o email está cadastrado ou não. O resultado nunca é
      // checado — é sempre false contra este hash fixo, isso não importa aqui.
      await argon2
        .verify(await DUMMY_PASSWORD_HASH, password)
        .catch(() => false);
      throw new UnauthorizedException();
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException();
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user);
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.revokedAt !== null || record.expiresAt < new Date()) {
      throw new UnauthorizedException();
    }

    // updateMany + checar `count` em vez de update({ where: { id } }) fecha uma race de
    // check-then-act: duas chamadas concorrentes com o mesmo refresh token passariam
    // ambas na validação acima antes de qualquer uma escrever. Condicionar o WHERE em
    // `revokedAt: null` garante que só uma das duas chamadas concorrentes consegue
    // de fato flipar revokedAt de null pra uma data — a outra recebe count 0 e sabe que
    // perdeu a corrida.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      throw new UnauthorizedException();
    }

    return this.issueTokens(record.user);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (record) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  // --- Helpers já prontos, não precisam de TODO ---

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private async issueTokens(user: {
    id: string;
    role: JwtPayload['role'];
  }): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt,
    };
  }
}
