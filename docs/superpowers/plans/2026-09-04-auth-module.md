# Módulo Auth (login da dentista) — Implementation Plan

> **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans
> para executar este plano tarefa a tarefa. Passos usam checkbox (`- [ ]`) para rastreio.
>
> **Modo de execução deste projeto** (ver memória `feedback-learning-mode`): boilerplate/infra (Tarefas 1, 3, 4,
> 5, 6, 7, 8) pode ser executado por Claude a pedido do usuário. A **Tarefa 2** (`AuthService`: login, rotação e
> revogação de refresh token) é a lógica de negócio deste módulo — tests já vêm escritos (TDD), mas a
> implementação em si é esqueleto com `TODO` para o usuário escrever, com Claude revisando.

**Goal:** Implementar login por email/senha da dentista: API NestJS com JWT de acesso (15min) + refresh token
rotativo (7 dias) em cookies httpOnly, proteção de rotas por guard global, e frontend Next.js consumindo isso
via `proxy.ts` + fetch com retry automático de refresh.

**Architecture:** `AuthModule` novo em `apps/api` com endpoints `/auth/login`, `/auth/refresh`, `/auth/logout`,
`/auth/me`. Sessões vivem em cookies httpOnly, nunca tocadas pelo JS do frontend. `apps/web` não acessa o
Postgres diretamente (arquitetura ADR 003) — toda verificação de sessão passa por uma chamada real à API.

**Tech Stack:** `@nestjs/jwt`, `cookie-parser`, `argon2` (já instalado), Prisma 6.19.3 (já instalado), Next.js
16.3.3 App Router (`proxy.ts`, não `middleware.ts` — renomeado nessa versão).

**Spec:** `docs/superpowers/specs/2026-09-04-auth-module-design.md`

## Global Constraints

- Access token: JWT, TTL **15 minutos**. Refresh token: string opaca aleatória, TTL **7 dias**.
- Cookies `access_token`/`refresh_token`: sempre `httpOnly` + `sameSite=lax`; `secure` **só quando
  `NODE_ENV === 'production'`** (ver correção abaixo — dev local roda em HTTP puro).
- Toda rota da API exige autenticação por padrão (guard global); só rotas marcadas `@Public()` ficam abertas.
- Rate-limit próprio no `/auth/login`: 5 tentativas/min por IP, além do limite global já existente
  (`ThrottlerModule.forRoot` do Módulo 0).
- Nenhum segredo novo (`JWT_SECRET`, credenciais do seed) commitado — só em `.env`/`.env.test` (gitignorados),
  com os `.env.example` correspondentes atualizados.
- `docs/decisions.md` recebe uma entrada nova cobrindo as duas correções técnicas abaixo antes do commit da
  Tarefa 1.

### Correções em relação à spec aprovada

A spec (`docs/superpowers/specs/2026-09-04-auth-module-design.md`) tinha duas imprecisões técnicas encontradas
ao detalhar o plano — corrigidas aqui, não na spec em si (a spec registra a decisão original; a correção entra
no ADR):

1. **`@nestjs/jwt` não estava instalado.** A spec dizia que "`@nestjs/jwt`, `argon2` e `@nestjs/throttler` já
   resolvem o resto" — falso: `apps/api/package.json` só tem `argon2` e `@nestjs/throttler`. `@nestjs/jwt` é
   dependência nova, instalada na Tarefa 1 junto com `cookie-parser`.
2. **`RefreshToken.tokenHash` usa SHA-256, não argon2.** Argon2 é intencionalmente não-determinístico (salt
   aleatório a cada chamada) — serve para comparar uma senha contra o hash de **um** usuário já identificado
   por email, não para localizar **qual** registro corresponde a um valor dado (não dá para fazer
   `WHERE tokenHash = argon2("valor recebido")`, porque duas chamadas de `argon2.hash()` com o mesmo input
   produzem hashes diferentes). SHA-256 (determinístico, rápido) é apropriado aqui porque o valor de entrada já
   é um segredo de alta entropia gerado por `crypto.randomBytes(32)` — não uma senha adivinhável por força
   bruta, que é o cenário que justifica o custo computacional do argon2.

---

### Tarefa 1: Schema (`RefreshToken`), migration e dependências novas

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_refresh_token/migration.sql` (gerado)
- Modify: `apps/api/package.json` (novas dependências)
- Modify: `docs/decisions.md` (ADR 017)

**Interfaces:**
- Produces: model Prisma `RefreshToken` (`id`, `userId`, `tokenHash`, `expiresAt`, `revokedAt`, `createdAt`) e
  `User.refreshTokens: RefreshToken[]`, consumidos pela Tarefa 2 (`AuthService`) via `PrismaService`.

- [x] **Step 1: Instalar as dependências novas**

Run:
```bash
pnpm --filter api add @nestjs/jwt cookie-parser
pnpm --filter api add -D @types/cookie-parser
```
Expected: instala sem erro. Confira em `apps/api/package.json` que `@nestjs/jwt` foi resolvido numa versão
compatível com `@nestjs/common@^11.0.1` já instalado (mesma major do Nest 11) — se resolver uma versão de major
diferente do resto do `@nestjs/*`, pare e pin explicitamente a versão compatível antes de seguir (mesma lição
da ADR 014 sobre Prisma).

- [x] **Step 2: Editar `apps/api/prisma/schema.prisma`** — trocar o bloco de `User` por este (remove os dois
campos de refresh token, adiciona a relação) e acrescentar o novo model logo depois de `User`:

```prisma
model User {
  id           String @id @default(uuid())
  email        String @unique
  passwordHash String
  role         Role   @default(DENTIST)

  professional  Professional?
  refreshTokens RefreshToken[]

  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)
}

// Cada linha é uma sessão (refresh token) ativa ou já revogada de um usuário. Tabela
// própria em vez de um campo único em User — permite, sem migração futura, virar
// multi-sessão (múltiplos dispositivos logados ao mesmo tempo) só mudando a regra de
// código que hoje revoga tudo a cada novo login (ver AuthService.login).
model RefreshToken {
  id     String @id @default(uuid())
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId String

  // SHA-256 do valor do token, não argon2 — ver ADR 017 em docs/decisions.md.
  tokenHash String    @unique
  expiresAt DateTime  @db.Timestamptz(3)
  revokedAt DateTime? @db.Timestamptz(3)

  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([userId])
}
```

- [x] **Step 3: Gerar e aplicar a migration**

Run:
```bash
pnpm --filter api exec prisma migrate dev --name add_refresh_token
```
Expected: gera `apps/api/prisma/migrations/<timestamp>_add_refresh_token/migration.sql` com `DROP COLUMN
"refreshTokenHash"`, `DROP COLUMN "refreshTokenExpiresAt"` em `User`, `CREATE TABLE "RefreshToken"` com a FK e
os índices, e aplica direto em `agendamento_dev` (`Your database is now in sync with your schema.`). Diferente
da Tarefa 5 do Módulo 0, **não precisa editar o SQL gerado à mão** — não há nenhuma constraint que o Prisma não
saiba expressar aqui.

- [x] **Step 4: Aplicar a mesma migration no banco de teste**

Run (ajuste a sintaxe de variável de ambiente conforme o shell — exemplo em bash):
```bash
DATABASE_URL="$DATABASE_URL_TEST" pnpm --filter api exec prisma migrate deploy
```
Expected: `All migrations have been successfully applied.` em `agendamento_test`.

- [x] **Step 5: Registrar a correção em `docs/decisions.md`**

Adicionar ao final do arquivo (antes da tabela "Índice rápido"), seguindo o formato das entradas anteriores:

```markdown
## 017 — Correções técnicas na spec do módulo Auth: `@nestjs/jwt` e hash do refresh token

**Data:** 2026-09-04
**Status:** Aceita

**Contexto:** A spec de design do módulo Auth
(`docs/superpowers/specs/2026-09-04-auth-module-design.md`) continha duas imprecisões encontradas ao detalhar
o plano de implementação: (1) afirmava que `@nestjs/jwt` já estava instalado junto com `argon2` e
`@nestjs/throttler` — não estava; (2) propunha reaproveitar `argon2` para hashear o refresh token armazenado em
`RefreshToken.tokenHash`, mas argon2 é intencionalmente não-determinístico (salt aleatório por chamada), o que
torna impossível localizar o registro certo por igualdade no banco a partir do valor recebido do cliente.

**Decisão:** `@nestjs/jwt` entra como dependência nova do módulo. `RefreshToken.tokenHash` usa SHA-256
(determinístico) em vez de argon2 — apropriado aqui porque o valor de entrada já é um segredo de alta entropia
gerado por `crypto.randomBytes(32)`, não uma senha adivinhável por força bruta (o cenário que justifica o custo
do argon2, mantido para `User.passwordHash`).

**Consequências:** Nenhuma migração adicional necessária além da já prevista para a tabela `RefreshToken`. Fica
registrado como lembrete geral: specs de design descrevem a intenção arquitetural, não substituem a checagem
de dependências/algoritmos feita ao detalhar o plano de implementação.
```

Também adicionar `| 017 | Correções técnicas do módulo Auth (`@nestjs/jwt`, hash SHA-256 do refresh token) |
Backend/Segurança |` à tabela "Índice rápido" no final do arquivo.

- [x] **Step 6: Commit**

```bash
git add apps/api/prisma apps/api/package.json pnpm-lock.yaml docs/decisions.md
git commit -m "fix: add RefreshToken table and nestjs/jwt dependency for auth module"
```

---

### Tarefa 2: `AuthService` — lógica de negócio (TDD, você escreve a implementação)

**Files:**
- Create: `apps/api/src/auth/types/jwt-payload.type.ts`
- Create: `apps/api/src/auth/types/auth-tokens.type.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts` (testes prontos)
- Create: `apps/api/src/auth/auth.service.ts` (esqueleto com `TODO`)

**Interfaces:**
- Consumes: `PrismaService` (Tarefa 4 do Módulo 0) — `prisma.user.findUnique`, `prisma.refreshToken.create`,
  `prisma.refreshToken.findUnique`, `prisma.refreshToken.update`, `prisma.refreshToken.updateMany`.
- Produces: `AuthService.login(email, password): Promise<AuthTokens>`,
  `AuthService.refresh(rawRefreshToken): Promise<AuthTokens>`, `AuthService.logout(rawRefreshToken): Promise<void>`
  — consumidos pelo `AuthController` na Tarefa 3.

- [x] **Step 1: Criar os tipos compartilhados**

`apps/api/src/auth/types/jwt-payload.type.ts`:
```typescript
import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string; // User.id
  role: Role;
}
```

`apps/api/src/auth/types/auth-tokens.type.ts`:
```typescript
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}
```

- [x] **Step 2: Escrever os testes em `apps/api/src/auth/auth.service.spec.ts`** (arquivo completo, já pronto —
não precisa alterar nesta tarefa, só fazer passar):

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const userId = 'user-1';
  const email = 'dentista@example.com';
  const plainPassword = 'senha-correta-123';

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '15m' } })],
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('throws UnauthorizedException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(email, plainPassword)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      const passwordHash = await argon2.hash(plainPassword);
      prisma.user.findUnique.mockResolvedValue({ id: userId, email, passwordHash, role: Role.DENTIST });

      await expect(service.login(email, 'senha-errada')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes previous refresh tokens and returns new tokens on success', async () => {
      const passwordHash = await argon2.hash(plainPassword);
      prisma.user.findUnique.mockResolvedValue({ id: userId, email, passwordHash, role: Role.DENTIST });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const tokens = await service.login(email, plainPassword);

      expect(tokens.accessToken.split('.')).toHaveLength(3); // formato JWT
      expect(tokens.refreshToken).toHaveLength(64); // hex de 32 bytes
      expect(tokens.refreshTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('refresh', () => {
    const rawToken = 'a'.repeat(64);

    it('throws UnauthorizedException when the token does not exist', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the token is revoked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60),
        user: { id: userId, role: Role.DENTIST },
      });

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the token is expired', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: { id: userId, role: Role.DENTIST },
      });

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rotates the token and returns new tokens on success', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        user: { id: userId, role: Role.DENTIST },
      });
      prisma.refreshToken.update.mockResolvedValue({ id: 'rt-1' });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const tokens = await service.refresh(rawToken);

      expect(tokens.refreshToken).not.toBe(rawToken);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('logout', () => {
    const rawToken = 'b'.repeat(64);

    it('revokes the matching refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt-1', revokedAt: null });
      prisma.refreshToken.update.mockResolvedValue({ id: 'rt-1' });

      await service.logout(rawToken);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does not throw when the token does not exist', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.logout(rawToken)).resolves.toBeUndefined();
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });
});
```

- [x] **Step 3: Rodar os testes e confirmar que falham por falta de implementação**

Run: `pnpm --filter api test auth.service`
Expected: FAIL — `AuthService` ainda não existe (ou métodos não implementados).

- [x] **Step 4: Criar o esqueleto em `apps/api/src/auth/auth.service.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokens } from './types/auth-tokens.type';
import { JwtPayload } from './types/jwt-payload.type';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    // TODO: buscar o User por email (prisma.user.findUnique). Se não existir, lançar
    // UnauthorizedException — NÃO diferenciar "usuário não existe" de "senha errada"
    // na mensagem (ver contrato do endpoint na spec, seção "Tratamento de erros").
    //
    // TODO: validar a senha com argon2.verify(user.passwordHash, password). Se
    // inválida, lançar UnauthorizedException.
    //
    // TODO: revogar todos os refresh tokens não-revogados do usuário
    // (prisma.refreshToken.updateMany, where: { userId, revokedAt: null }, data:
    // { revokedAt: new Date() }) — ver ADR de sessão única no design spec.
    //
    // TODO: gerar um novo par de tokens chamando this.issueTokens(user) (ver Step 5)
    // e retorná-lo.
    throw new Error('not implemented');
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    // TODO: hashear rawRefreshToken com this.hashToken() e buscar
    // prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } }).
    // Se não encontrar, ou revokedAt não for null, ou expiresAt já passou: lançar
    // UnauthorizedException.
    //
    // TODO: revogar o token encontrado (prisma.refreshToken.update, data: { revokedAt:
    // new Date() }) e gerar um novo par de tokens com this.issueTokens(record.user) —
    // isso é a rotação: cada uso de refresh invalida o token anterior.
    throw new Error('not implemented');
  }

  async logout(rawRefreshToken: string): Promise<void> {
    // TODO: hashear rawRefreshToken e buscar o registro correspondente. Se existir,
    // revogar (mesmo padrão do refresh). Se não existir, retornar sem erro — logout é
    // idempotente, um cookie já inválido não deve gerar 401/500.
    throw new Error('not implemented');
  }

  // --- Helpers já prontos, não precisam de TODO ---

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private async issueTokens(user: { id: string; role: JwtPayload['role'] }): Promise<AuthTokens> {
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

    return { accessToken, refreshToken: rawRefreshToken, refreshTokenExpiresAt };
  }
}
```

Os três métodos com `TODO` (`login`, `refresh`, `logout`) são a lógica de negócio deste módulo — implemente
usando as pistas nos comentários e os testes do Step 2 como especificação exata do comportamento esperado.
`hashToken` e `issueTokens` já vêm prontos (são só encanamento em torno do que os `TODO`s decidem).

- [x] **Step 5: Implementar os `TODO`s**

Sem código pronto aqui. Quando travar de verdade (já tentou e não funcionou, não só "não sei por onde
começar"), peça revisão do que foi escrito antes de qualquer sugestão de código.

- [x] **Step 6: Rodar os testes e confirmar que todos passam**

Run: `pnpm --filter api test auth.service`
Expected: `Tests: 9 passed, 9 total` (3 em `login`, 4 em `refresh`, 2 em `logout`).

- [x] **Step 7: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts apps/api/src/auth/types
git commit -m "feat: implement AuthService login, refresh rotation and logout"
```

---

### Tarefa 3: `AuthModule` — guard, decorator, controller, DTO, cookies

**Files:**
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Create: `apps/api/src/auth/decorators/public.decorator.ts`
- Create: `apps/api/src/auth/guards/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/cookie.util.ts`
- Create: `apps/api/src/auth/types/express.d.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/.env.example`, `apps/api/.env.test.example`, `apps/api/.env` (local, não commitado)

**Interfaces:**
- Consumes: `AuthService` (Tarefa 2).
- Produces: endpoints HTTP `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`;
  decorator `@Public()` reexportável para módulos futuros marcarem rotas sem autenticação.

- [x] **Step 1: Adicionar `JWT_SECRET` aos arquivos de ambiente**

`apps/api/.env.example` (acrescentar):
```
JWT_SECRET="dev-only-change-me"
```

`apps/api/.env.test.example` (acrescentar):
```
JWT_SECRET="test-only-secret"
```

Copiar o valor para `apps/api/.env` e `apps/api/.env.test` locais (não commitados) também.

- [x] **Step 2: Criar `apps/api/src/auth/dto/login.dto.ts`**

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

- [x] **Step 3: Criar `apps/api/src/auth/decorators/public.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [x] **Step 4: Criar `apps/api/src/auth/guards/jwt-auth.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.['access_token'];
    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      request.user = this.jwtService.verify<JwtPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
```

- [x] **Step 5: Criar `apps/api/src/auth/types/express.d.ts`** (augmenta o tipo `Request` do Express para
aceitar `request.user`, usado no guard acima e no controller)

```typescript
import { JwtPayload } from './jwt-payload.type';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};
```

- [x] **Step 6: Criar `apps/api/src/auth/cookie.util.ts`**

```typescript
import { Response } from 'express';
import { AuthTokens } from './types/auth-tokens.type';

const isProduction = process.env.NODE_ENV === 'production';

// `secure: isProduction` (não sempre `true`) porque o ambiente de dev local roda em
// HTTP puro entre :3000 (web) e :3001 (api) — um cookie sempre `secure` seria
// descartado pelo navegador antes mesmo de chegar no frontend.
export function setAuthCookies(res: Response, tokens: AuthTokens): void {
  res.cookie('access_token', tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refresh_token', tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    expires: tokens.refreshTokenExpiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}
```

- [x] **Step 7: Criar `apps/api/src/auth/auth.controller.ts`**

```typescript
import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { setAuthCookies, clearAuthCookies } from './cookie.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto.email, dto.password);
    setAuthCookies(res, tokens);
    return { success: true };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.['refresh_token'];
    if (!refreshToken) {
      throw new UnauthorizedException();
    }
    const tokens = await this.authService.refresh(refreshToken);
    setAuthCookies(res, tokens);
    return { success: true };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.['refresh_token'];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    clearAuthCookies(res);
    return { success: true };
  }

  @Get('me')
  me(@Req() req: Request) {
    return { id: req.user!.sub, role: req.user!.role };
  }
}
```

- [x] **Step 8: Criar `apps/api/src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET precisa estar definida');
}

@Module({
  imports: [
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
```

O mesmo padrão de "falhar rápido se a env var não estiver definida" já usado em `main.ts` para `CORS_ORIGIN`
(Módulo 0, Tarefa 3) — evita subir a API com um `JwtModule` configurado com `secret: undefined`.

- [x] **Step 9: Registrar `cookie-parser` em `apps/api/src/main.ts`** (adicionar a linha destacada, sem mexer
no resto do arquivo)

```typescript
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN precisa estar definida (nunca usar "*" em produção)');
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

- [x] **Step 10: Importar `AuthModule` em `apps/api/src/app.module.ts`** (acrescentar ao array `imports`,
mantendo tudo que já existe)

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

- [x] **Step 11: Rodar a API e confirmar boot**

Run: `pnpm --filter api dev`
Expected: boot limpo (log pino confirmando `Nest application successfully started`). Se der erro
`JWT_SECRET precisa estar definida`, confirme que `apps/api/.env` tem a linha do Step 1. Pare o processo antes
do próximo passo.

- [x] **Step 12: Commit**

```bash
git add apps/api/src/auth apps/api/src/main.ts apps/api/src/app.module.ts apps/api/.env.example apps/api/.env.test.example
git commit -m "feat: wire AuthModule with JWT guard, cookies and rate-limited login endpoint"
```

---

### Tarefa 4: Seed da usuária dentista

**Files:**
- Create: `apps/api/prisma/seed.ts`
- Modify: `apps/api/package.json` (config `prisma.seed` + script `db:seed`)
- Modify: `apps/api/.env.example` (credenciais do seed)

**Interfaces:**
- Consumes: `PrismaClient` direto (mesmo padrão do teste de overlap do Módulo 0 — script roda fora do Nest).
- Produces: um `User` com `role = DENTIST` em `agendamento_dev`, usável para login manual/e2e.

- [x] **Step 1: Acrescentar credenciais do seed a `apps/api/.env.example`**

```
SEED_DENTIST_EMAIL="dentista@example.com"
SEED_DENTIST_PASSWORD="mude-esta-senha-123"
```

Copiar para `apps/api/.env` local com uma senha real (não commitada).

- [x] **Step 2: Criar `apps/api/prisma/seed.ts`**

```typescript
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_DENTIST_EMAIL;
  const password = process.env.SEED_DENTIST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SEED_DENTIST_EMAIL e SEED_DENTIST_PASSWORD precisam estar definidas em apps/api/.env',
    );
  }

  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, role: 'DENTIST' },
  });

  console.log(`Usuária seedada: ${user.email} (id ${user.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

`upsert` (não `create`) torna o script seguro pra rodar mais de uma vez — reexecutar só atualiza a senha do
mesmo email, não duplica usuário.

- [x] **Step 3: Configurar o `prisma seed` em `apps/api/package.json`**

Acrescentar (nível raiz do JSON, ao lado de `scripts`):
```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

E em `scripts`:
```json
"db:seed": "prisma db seed"
```

- [x] **Step 4: Rodar o seed e confirmar**

Run: `pnpm --filter api db:seed`
Expected: `Usuária seedada: dentista@example.com (id ...)` no console. Confirme direto no banco:

Run: `docker compose exec postgres psql -U agendamento -d agendamento_dev -c "SELECT email, role FROM \"User\";"`
Expected: uma linha com o email do seed e `role = DENTIST`.

- [x] **Step 5: Commit**

```bash
git add apps/api/prisma/seed.ts apps/api/package.json apps/api/.env.example
git commit -m "feat: add dentist user seed script"
```

---

### Tarefa 5: Teste e2e do fluxo completo de auth

**Files:**
- Create: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `AppModule` completo (Tarefas 1–3), `PrismaClient` direto para criar/limpar o usuário de teste
  (mesmo padrão de `appointment-overlap.e2e-spec.ts`).
- Produces: nada consumido por tarefas futuras — é uma prova end-to-end, não uma dependência.

- [x] **Step 1: Criar `apps/api/test/auth.e2e-spec.ts`**

```typescript
import { config } from 'dotenv';
config({ path: '.env.test' });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const email = 'auth-e2e@example.com';
  const password = 'correct-horse-battery-staple';

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const passwordHash = await argon2.hash(password);
    await prisma.user.create({ data: { email, passwordHash, role: 'DENTIST' } });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects a protected route without a session', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects login with the wrong password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('logs in, accesses a protected route, refreshes, then logs out', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const cookies = loginRes.get('Set-Cookie');
    expect(cookies).toBeDefined();

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookies!)
      .expect(200);
    expect(meRes.body.role).toBe('DENTIST');

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies!)
      .expect(201);
    const refreshedCookies = refreshRes.get('Set-Cookie');
    expect(refreshedCookies).toBeDefined();

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', refreshedCookies!)
      .expect(201);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', refreshedCookies!)
      .expect(401);
  });
});
```

- [x] **Step 2: Rodar o teste**

Run: `pnpm --filter api exec jest --config test/jest-e2e.json auth`
Expected: `Tests: 3 passed, 3 total`.

- [x] **Step 3: Commit**

```bash
git add apps/api/test/auth.e2e-spec.ts
git commit -m "test: prove full login/refresh/logout flow end-to-end"
```

---

### Tarefa 6: Frontend — `proxy.ts` e helpers (`lib/auth.ts`, `lib/api-client.ts`)

**Files:**
- Create: `apps/web/src/proxy.ts`
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/.env.local.example` (criar se não existir)

**Interfaces:**
- Produces: `getCurrentUser(): Promise<CurrentUser>` (redireciona para `/login` se não autenticado) e
  `apiFetch(path, init): Promise<Response>` (retry automático de refresh em 401) — consumidos pelas páginas da
  Tarefa 7.

- [x] **Step 1: Criar `apps/web/.env.local.example`**

```
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

Copiar para `apps/web/.env.local` local (Next.js carrega esse arquivo automaticamente, sem `dotenv/config`).

- [x] **Step 2: Criar `apps/web/src/proxy.ts`**

Nome do arquivo e da função são exigidos pelo Next.js 16 — `middleware.ts`/`middleware()` está descontinuado
nessa versão (renomeado para `proxy.ts`/`proxy()`, confirmado em
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Só checa a PRESENÇA do cookie — não valida a assinatura do JWT (desnecessário e
// mais caro aqui). É uma otimização de UX (evita renderizar a página pra só depois
// redirecionar); a verificação real acontece a cada chamada à API (ver lib/auth.ts),
// que tem seu próprio JwtAuthGuard. Ver docs/superpowers/specs/2026-09-04-auth-module-design.md, seção 7.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has('access_token');

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
```

- [x] **Step 3: Criar `apps/web/src/lib/auth.ts`**

```typescript
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface CurrentUser {
  id: string;
  role: 'DENTIST' | 'STAFF';
}

export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const cookieStore = await cookies();
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  if (!response.ok) {
    redirect('/login');
  }

  return response.json();
});
```

`cache()` (de `react`, não do Next) garante que múltiplos componentes no mesmo request reaproveitem a mesma
chamada a `/auth/me` em vez de repetir a requisição — padrão recomendado pela própria doc do Next 16
(`node_modules/next/dist/docs/01-app/02-guides/data-security.md`).

- [x] **Step 4: Criar `apps/web/src/lib/api-client.ts`**

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Wrapper de fetch para chamadas do BROWSER (client components) à API. Em caso de
// 401 (access token expirado), tenta renovar via /auth/refresh uma vez e repete a
// requisição original — a dentista não percebe o access token expirando a cada 15min.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
    });

  let response = await doFetch();

  if (response.status === 401) {
    const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshResponse.ok) {
      response = await doFetch();
    }
  }

  return response;
}
```

- [x] **Step 5: Commit**

```bash
git add apps/web/src/proxy.ts apps/web/src/lib/auth.ts apps/web/src/lib/api-client.ts apps/web/.env.local.example
git commit -m "feat: add Next.js proxy and auth helpers for session handling"
```

---

### Tarefa 7: Frontend — página de login e dashboard protegido

**Files:**
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `apiFetch` e `getCurrentUser` (Tarefa 6).

- [x] **Step 1: Criar `apps/web/src/app/login/page.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      setError('Email ou senha inválidos.');
      return;
    }

    router.push('/dashboard');
  }

  return (
    <main>
      <h1>Entrar</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
```

- [x] **Step 2: Criar `apps/web/src/app/dashboard/page.tsx`**

```tsx
import { getCurrentUser } from '@/lib/auth';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  return (
    <main>
      <h1>Painel</h1>
      <p>Logada como {user.role === 'DENTIST' ? 'dentista' : 'equipe'}.</p>
    </main>
  );
}
```

Página mínima só para provar o fluxo end-to-end (Tarefa 8) — o design real do painel fica para um módulo
futuro.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/app/login apps/web/src/app/dashboard
git commit -m "feat: add login page and protected dashboard stub"
```

---

### Tarefa 8: Definição de pronto — smoke test manual end-to-end

**Files:** nenhum arquivo novo — só verificação manual.

- [x] **Step 1: Subir tudo**

Run: `pnpm dev` (raiz)
Expected: `api` (:3001) e `web` (:3000) sobem juntos, sem erro.

- [x] **Step 2: Confirmar redirect de rota protegida sem sessão**

No navegador, acesse `http://localhost:3000/dashboard` sem ter logado antes.
Expected: redireciona para `/login` (via `proxy.ts`).

- [x] **Step 3: Logar com o usuário do seed e confirmar acesso ao dashboard**

Na tela de `/login`, use o email/senha de `apps/api/.env` (`SEED_DENTIST_EMAIL`/`SEED_DENTIST_PASSWORD`).
Expected: redireciona para `/dashboard`, que mostra "Logada como dentista." — confirma que `getCurrentUser()`
conseguiu ler o cookie e chamar `/auth/me` com sucesso.

- [x] **Step 4: Confirmar que o cookie de acesso expira e o refresh automático funciona**

Não é prático esperar 15 minutos manualmente — em vez disso, abra o DevTools (Application → Cookies) e apague
só o cookie `access_token` (deixe o `refresh_token`). Recarregue `/dashboard`.
Expected: a página ainda carrega (o Server Component chama `/auth/me`, que falha, mas isso só afeta chamadas
server-side — para confirmar o retry do lado do cliente, faça login de novo e, com as ferramentas de rede
abertas, dispare uma ação que use `apiFetch` depois de apagar só o `access_token`; deve aparecer uma chamada a
`/auth/refresh` seguida da chamada original bem-sucedida).

- [x] **Step 5: Confirmar logout**

Dispare `POST http://localhost:3001/auth/logout` (via `apiFetch` de algum botão, ou `curl -i -b cookies.txt -X
POST http://localhost:3001/auth/logout`) e confirme que acessar `/dashboard` depois redireciona para `/login`
de novo.

## Definição de pronto do Módulo Auth

- [x] `pnpm --filter api test` passa (inclui `auth.service.spec.ts`, 9 testes)
- [x] `pnpm --filter api exec jest --config test/jest-e2e.json auth` passa (3 testes e2e)
- [x] Seed cria a usuária dentista em `agendamento_dev` sem duplicar em execuções repetidas
- [x] Fluxo manual da Tarefa 8 (login → dashboard → refresh automático → logout → redirect) funciona de ponta
  a ponta no navegador
- [x] Nenhum segredo novo (`JWT_SECRET`, credenciais do seed) commitado — só nos `.env.example`
- [x] `docs/decisions.md` tem a entrada 017 registrando as correções técnicas da spec
