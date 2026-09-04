# Design: Módulo de Auth (login da dentista)

Status: aprovado em conversa, pronto para virar plano de implementação
Escopo: autenticação por email/senha para o painel da dentista (API NestJS +
frontend Next.js). Não cobre autorização por papel/permissão granular (só existe a
dentista hoje, sem recepcionista com permissões diferentes), nem qualquer fluxo de
cadastro público, SSO ou recuperação de senha.

## Contexto

Módulo escolhido para adiantar desenvolvimento **antes** da próxima reunião de
requisitos com a cliente, justamente por não depender das perguntas de negócio ainda
em aberto (confirmação automática, duração de consulta, horários etc. — ver
`docs/reunioes/2026-09-04-pauta-requisitos.md`).

Uma dependência de negócio real apareceu durante o brainstorm — "a dentista pode
ficar logada em mais de um dispositivo ao mesmo tempo?" — e o usuário preferiu não
decidir isso agora sem confirmar com a cliente. O design abaixo absorve essa resposta
sem exigir migração (ver seção "Modelo de dados").

O schema de dados (`docs/superpowers/specs/2026-08-24-appointment-scheduling-schema-design.md`)
já previa `User` separado de `Professional`, com `passwordHash` e (originalmente) um
campo único de refresh token — sinalizando desde o início a intenção de JWT com
refresh token. `argon2` já está instalado em `apps/api` como dependência, sem uso
ainda.

## Decisões de design e porquês

### 1. Provisionamento: seed script, sem endpoint de registro público

Só existe uma usuária (a dentista) hoje. O usuário é criado por um script de seed
(`pnpm --filter api prisma db seed`, ou equivalente), com email/senha definidos
manualmente — nenhum endpoint de cadastro é exposto pela API. Reduz a superfície de
ataque de um sistema single-tenant com um usuário só.

### 2. Estratégia de token: JWT de acesso + refresh token opaco rotativo

- **Access token**: JWT assinado (`@nestjs/jwt`), TTL de **15 minutos**. Carrega
  `sub` (userId) e `role`. Vida curta: limita o estrago de um token vazado.
- **Refresh token**: string aleatória opaca (não JWT — não precisa ser
  auto-descritiva, só verificável via hash no banco), TTL de **7 dias**. Cada uso
  rotaciona o token (gera um novo, revoga o antigo) — reduz a janela de reuso de um
  token roubado.
- Ambos entregues como cookies **httpOnly + secure + sameSite=lax**. O JavaScript do
  frontend nunca tem acesso direto ao valor do token — mitiga roubo via XSS. A API já
  faz CORS com `credentials: true` e origem explícita (`main.ts`), o que já suporta
  cookies cross-origin entre `:3000` (web) e `:3001` (api) em dev.

### 3. Modelo de dados: `RefreshToken` como tabela própria, não campo único em `User`

`User.refreshTokenHash` / `User.refreshTokenExpiresAt` (do design original) são
substituídos por uma tabela `RefreshToken`:

```prisma
model RefreshToken {
  id        String    @id @default(uuid())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  tokenHash String    @unique
  expiresAt DateTime  @db.Timestamptz(3)
  revokedAt DateTime? @db.Timestamptz(3)

  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([userId])
}
```

- `tokenHash`: hash argon2 do refresh token, nunca o valor em texto puro — mesmo
  princípio do `passwordHash`.
- `revokedAt` nullable: revogar sem apagar a linha, para permitir auditoria e detectar
  reuso de token já revogado (potencial indício de roubo).
- **Regra de v1, em código, não em schema**: no login, todos os refresh tokens ainda
  não revogados do usuário são revogados antes de emitir um novo — na prática, sessão
  única por usuário. Se a cliente confirmar na próxima reunião que multi-dispositivo é
  necessário, a mudança é só remover essa revogação em massa no login — sem migração.

`User` remove os dois campos de refresh token e ganha a relação `refreshTokens
RefreshToken[]`.

### 4. Hashing: argon2 para senha e para refresh token

`argon2` (já instalado) hasheia tanto `User.passwordHash` quanto
`RefreshToken.tokenHash`. Nenhuma dependência nova aqui.

### 5. Proteção de rotas: Guard customizado com `@nestjs/jwt`, sem Passport

Existe uma única estratégia de autenticação (email/senha, sem OAuth/SSO) — o overhead
de configuração do `@nestjs/passport` não se paga. Em vez disso:

- `JwtAuthGuard` (implementa `CanActivate`): lê o cookie do access token (via
  `cookie-parser`, dependência nova), valida com `JwtService.verifyAsync`, injeta
  `request.user = { id, role }`. Erros de verificação (expirado, assinatura inválida,
  cookie ausente) resultam em 401.
- Aplicado **globalmente** via `APP_GUARD` — nega por padrão.
- Decorator `@Public()` (metadata + reflector) marca rotas que não exigem login:
  `POST /auth/login`, `POST /auth/refresh`, e futuramente os endpoints de agendamento
  usados pelo cliente sem conta.

### 6. Endpoints do `AuthModule`

| Endpoint | Público? | Comportamento |
|---|---|---|
| `POST /auth/login` | Sim | Valida `{ email, senha }` com argon2. Sucesso: revoga refresh tokens antigos, cria um novo, seta os dois cookies. Falha: 401 genérico (não revela qual campo errou). Rate-limit próprio: 5 tentativas/min por IP via `@Throttle()`. |
| `POST /auth/refresh` | Sim | Lê cookie de refresh token, confere hash contra `RefreshToken` não revogado/não expirado. Sucesso: rotaciona (revoga o antigo, cria novo), emite novo access token. Falha: 401. |
| `POST /auth/logout` | Não | Revoga o refresh token atual no banco, limpa os dois cookies. |
| `GET /auth/me` | Não | Retorna dados do usuário logado (id, email, role) — permite ao frontend saber quem está logado sem decodificar o JWT no cliente. |

### 7. Frontend: `proxy.ts` (não `middleware.ts`) + verificação real por request

Achado durante o brainstorm, na documentação local do Next.js 16
(`node_modules/next/dist/docs`, ver ADR 016 sobre consultar essa doc antes de código
de frontend): o arquivo `middleware.ts` foi **descontinuado e renomeado para
`proxy.ts`** (a função exportada também muda de nome, de `middleware` para `proxy`).
A própria documentação recomenda não depender só dele para autenticação — a
verificação real deve acontecer em cada Server Component/Route Handler.

Design adotado:
- `apps/web/src/proxy.ts`: checa só a **presença** do cookie de access token (não
  valida assinatura — desnecessário e mais caro no runtime do proxy) e redireciona
  para `/login` se ausente, com `matcher` nas rotas protegidas (ex.:
  `/dashboard/:path*`). É otimização de UX, não a barreira de segurança real.
- Helper `getCurrentUser()` (`apps/web/src/lib/auth.ts`): chama `GET /auth/me` na
  API repassando os cookies da requisição. Cada Server Component que renderiza dado
  sensível chama esse helper antes de renderizar; 401 da API redireciona para
  `/login`. Como o Next.js aqui nunca acessa o Postgres diretamente (arquitetura ADR
  003 — toda persistência passa pela API NestJS), não há necessidade da Data Access
  Layer completa que a doc do Next recomenda para apps que leem o banco direto no
  server — o "recheck" de autenticação já acontece naturalmente a cada chamada à API,
  que tem seu próprio `JwtAuthGuard`.
- Wrapper de fetch (`apps/web/src/lib/api-client.ts`): intercepta 401 de qualquer
  chamada à API, tenta `POST /auth/refresh` uma vez, repete a requisição original se
  o refresh funcionar. Mantém a dentista logada sem perceber o access token expirando
  a cada 15 minutos.
- Página `/login`: formulário email/senha chamando `POST /auth/login`; sucesso
  redireciona para o dashboard. Sem client-side state management — a sessão já vive
  nos cookies.

### 8. Fora de escopo (v1)

- Recuperação de senha ("esqueci minha senha") — só existe um usuário; reset é feito
  manualmente via script/seed se necessário.
- Autorização granular por papel — `Role` (`DENTIST | STAFF`) já existe no schema,
  mas nenhuma lógica de permissão por papel é construída agora (YAGNI na lógica, não
  no campo — mesma decisão já registrada na ADR 002 do design de schema).
- Multi-sessão simultânea — ver seção 3; absorvido sem retrabalho de schema quando a
  cliente responder.

## Tratamento de erros

- Credenciais inválidas → 401 genérico, mesma mensagem para email inexistente ou
  senha errada.
- Refresh token ausente, expirado ou já revogado → 401, força novo login.
- Limite de tentativas de login excedido → 429 (via `@nestjs/throttler`, já
  instalado desde o Módulo 0).

## Testes

- **Unitários (`AuthService`)** — lógica de negócio do módulo, escrita como
  esqueleto + contratos + testes primeiro (TDD), seguindo o padrão dos módulos
  anteriores: login com senha certa/errada, rotação de refresh token, revogação em
  massa no login, expiração.
- **E2E** (`test/`, padrão já existente no scaffold do NestJS): fluxo completo login
  → acessar rota protegida → refresh → logout → rota protegida volta a barrar.
- **Guard e infraestrutura** (`JwtAuthGuard`, decorator `@Public()`, setup do
  `cookie-parser`, hashing com argon2) — boilerplate de configuração, entregue pronto
  como nos módulos anteriores.

## Dependências novas

- `cookie-parser` (+ `@types/cookie-parser`) em `apps/api` — ler cookies no Express
  por trás do Nest. Nenhuma outra dependência nova; `@nestjs/jwt`, `argon2` e
  `@nestjs/throttler` já resolvem o resto.

## Fora de escopo deste documento

- Estrutura de módulos do NestJS além do `AuthModule` em si.
- Componentização visual das telas de login/dashboard no Next.js.
- Regras de autorização por papel além de "logado vs. não logado".
