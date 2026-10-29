# CLAUDE.md — Sistema de agendamento da Dra. Eloísa

Produto de uma cliente real (consultório odontológico, uma dentista, Belo Horizonte).
Barra de qualidade: **produção**. Monorepo pnpm + Turborepo: `apps/api` (NestJS + Prisma
6.19.3 + Postgres 16), `apps/web` (Next.js 16), `packages/shared-types`.

Este arquivo diz **como trabalhar**. O **quê** e o **porquê** estão nos documentos abaixo;
não os duplique aqui.

## 1. Fontes da verdade (em ordem de precedência)

| # | Documento | Para quê |
|---|---|---|
| 1 | `docs/superpowers/specs/2026-10-28-agenda-e-agendamento-design.md` | Regras (`RN-xx`), transições (`T1`–`T14`), critérios de aceite (`CA-x.y`) por fatia |
| 2 | `docs/decisions.md` | ADRs aceitas (o que já foi decidido e por quê) |
| 3 | `docs/architecture/arquitetura.md` | Camadas, contratos, concorrência, erros, rotas; §13 = candidatas (ADR-C n) e o número da ADR de cada uma |
| 4 | `docs/architecture/guia-de-desenvolvimento.md` | Setup, comandos, **receitas** (§3), testes (§4), DoD (§5), segurança (§6), armadilhas (§7), dívidas da fatia 1 (§8) |

- Regra sem `RN`/`CA` na spec **não está aprovada**: pare e pergunte.
- Conflito entre documentos: vale o de número menor, mas **não resolva em silêncio** —
  aponte o conflito ao usuário e corrija o documento perdedor no mesmo trabalho.
- Antes de qualquer tarefa, leia a receita do guia que se aplica (§3.1–3.11). Ela é o
  passo a passo; este arquivo não repete.
- Frontend: Next.js 16 tem mudanças incompatíveis com o que você conhece. Leia
  `apps/web/AGENTS.md` e os guias em `apps/web/node_modules/next/dist/docs/` antes de
  escrever código no `apps/web`.

## 2. Ambiente (Windows)

- Comandos do dia a dia: guia §1.3. Regressão completa: guia §4.8.
- pnpm 9.12.0 instalado via `npm i -g pnpm@9.12.0` (**não** corepack).
- Docker Desktop **não** inicia sozinho: se `docker ps` falhar com erro de pipe, peça ao
  usuário para abri-lo. Sem Docker não há testes de integração/e2e.
- PowerShell: `$env:VAR="x"; comando` (não `VAR=x comando`).
- O lint do `apps/api` roda com `--fix` e **altera arquivos**: confira `git status` depois.

## 3. Fluxo de trabalho com agentes

Desde 2026-10-28 os agentes implementam tudo; o usuário revisa e aprova. A sessão
principal **orquestra** (planeja, despacha, decide) e não implementa features
diretamente.

### 3.1 Papéis — quem implementa nunca dá o aceite

| Papel | Faz | Não faz |
|---|---|---|
| **Orquestrador** (sessão principal) | Quebra o plano em tarefas, escreve o briefing, despacha, arbitra divergências contra a spec, mantém docs/ADRs | Escrever código de feature; aceitar sem evidência |
| **Testador** (agente A) | Escreve os testes `[CA-x.y]` da tarefa contra o esqueleto, **antes** da implementação (devem falhar pelo motivo certo); depois roda tudo e dá o veredito de aceite | Escrever código de produção |
| **Implementador** (agente B ≠ A) | Primeiro, o **esqueleto** dos contratos do briefing; depois faz os testes de aceite passarem, com seus próprios testes unitários de apoio (TDD, skill `superpowers:test-driven-development`) | Editar, pular ou enfraquecer um teste `[CA-x.y]` |

**Esqueleto** = os contratos do briefing (item 5 da 3.2) existindo de verdade: tipos,
DTOs, assinaturas de casos de uso e repositórios, rotas registradas no módulo, factories
de teste que a tarefa precisa. Cada método de comportamento só lança
`new NotImplementedException()`. O esqueleto compila (`pnpm typecheck`) e não contém
regra nenhuma. Ele existe para o teste do testador ficar vermelho numa asserção ou no
`NotImplementedException`, e não num `Cannot find module`.
| **Revisor** (agente C, ou o próprio testador numa segunda passada) | Revisão de código (skill `superpowers:requesting-code-review`) + checklist de segurança do guia §6 | Corrigir ele mesmo |

Se o implementador achar que um teste de aceite está errado, ele **reporta** ao
orquestrador com a citação da spec; quem decide é o orquestrador (e, na dúvida, o
usuário). Nunca "ajusta o teste para passar".

### 3.2 Briefing obrigatório de cada tarefa

Todo despacho para um agente contém, explicitamente:

1. **Objetivo** em uma frase.
2. **Escopo:** arquivos/módulos que pode tocar e o que está **fora** do escopo.
3. **Critérios de aceite:** a lista de `CA-x.y` e `RN-xx` (com o trecho da spec colado,
   não só o id) e a camada de cada um (U/I/E/W/P, guia §4.3).
4. **Receita** do guia que se aplica e as seções da arquitetura relevantes.
5. **Contratos** que a tarefa consome/produz (tipos do `shared-types`, códigos de erro,
   eventos, rotas).
6. **Definition of Done** (guia §5.1) e os comandos exatos de verificação.
7. **Formato do retorno:** o que mudou (arquivos), saída dos comandos, pendências e
   qualquer divergência encontrada na spec.

Tarefa sem critério de aceite verificável não é despachada: volte ao plano.

### 3.3 Ciclo implementar → testar → corrigir (com limite)

```
implementador: esqueleto → testador escreve [CA] (vermelho) → implementador → testador verifica
   ├─ verde + regressão da camada verde → revisor → aceite
   └─ vermelho → relatório de falha (teste, saída, hipótese) → implementador corrige
```

- **Limite: 3 rodadas de correção por tarefa.** Na 3ª falha, pare: aplique
  `superpowers:systematic-debugging` sobre o histórico das tentativas e leve ao usuário o
  diagnóstico (o que falha, o que já foi tentado, hipótese de causa, opções). Nada de 4ª
  tentativa às cegas.
- A mesma falha duas vezes seguidas com correções diferentes conta como sinal de causa
  mal entendida: vá direto ao debugging sistemático, sem esperar a 3ª.
- Teste instável (passa e falha sem mudança): não é "verde". Investigue pelo guia §7.5;
  repetir 20× (guia §4.6) para provar a correção.
- "Aceito" exige **evidência**: a saída real dos comandos (skill
  `superpowers:verification-before-completion`). Relatório do implementador não é
  evidência.

### 3.4 Quando usar `/loop`

- **Não** use `/loop` para o ciclo da 3.3: ele roda dentro da sessão, dirigido por
  eventos (o agente termina → você é notificado), e tem limite de rodadas. `/loop` não é
  forma de contornar esse limite.
- **Use** `/loop` só para esperar estado **externo** que o harness não notifica: CI de um
  PR, um deploy, propagação de DNS/SPF/DKIM (CA-4.14), um serviço de hospedagem subindo.
  Intervalo compatível com a velocidade real da coisa (CI de ~8 min → um check aos ~8 min).
- Para repetir um teste N vezes, use um laço no shell (guia §4.6), não `/loop`.

### 3.5 Fatias e checkpoints

- Entrega em 4 fatias verticais (spec §8). Uma fatia por plano
  (`superpowers:writing-plans`), executado com `superpowers:subagent-driven-development`.
- Fatia 1 começa pagando as **dívidas do guia §8**, antes de qualquer feature.
- Ao fim de cada tarefa: DoD da tarefa (guia §5.1). Ao fim da fatia: DoD da fatia
  (guia §5.2) + regressão completa (guia §4.8) + passeio manual com seed limpo, e o
  usuário aprova antes da próxima fatia.
- O site público só vai ao ar depois da fatia 4 (portão de go-live, spec §8).

## 4. Código

### 4.1 Regras invioláveis

- `*/domain/**` é puro: sem `@nestjs/*`, sem `@prisma/client`, sem `new Date()`/`Date.now()`
  — `now` entra por parâmetro, vindo do `Clock`.
- Data/hora de calendário **só** via `clinic-time.ts` (único importador de `luxon`, no api
  e no web). Nunca `getHours()`/`getDay()`/offset fixo (guia §7.1).
- Transição de estado = `updateMany` condicional + checagem de `count` + `AppointmentEvent`
  na mesma transação; eventos emitidos **depois** do commit (guia §3.4).
- Dentro de `$transaction`, repasse o `tx` até o repositório (nunca `this.prisma`).
- Proibidos: `$queryRawUnsafe`, `$executeRawUnsafe`, `dangerouslySetInnerHTML`, Server
  Actions.
- `professionalId` nunca vem do cliente.
- Endpoint público novo só com spec/ADR autorizando (guia §3.2).
- Nenhum dado pessoal em log, `AppointmentEvent`, URL ou mensagem de erro.
- Dependência nova: versão **exata**, publicada há ≥ 14 dias, CJS no `apps/api`, ADR
  (guia §3.10).

### 4.2 Clean code, SOLID e DRY — na medida deste projeto

- **Responsabilidade única:** um caso de uso por classe em `application/`; controller só
  traduz HTTP ↔ caso de uso; repositório só traduz domínio ↔ Prisma; presenter só molda a
  resposta.
- **Inversão de dependência por portas, não por reflexo:** `Clock`, `EmailSender`,
  `CaptchaVerifier`, `AppointmentReader` existem porque há troca real (teste/produção) ou
  fronteira de módulo (ADR 003). Não crie interface para algo com uma implementação e
  nenhuma fronteira.
- **DRY nas regras, não nos testes:** uma regra mora num lugar só (ex.: T5b e T6 chamam a
  mesma função; limites e enums vêm do `shared-types`). Nos testes, prefira o "Dado"
  explícito e legível a helpers que escondem o cenário.
- **Nomes do domínio:** identificadores em inglês com os termos do glossário da spec §3;
  textos de tela e mensagens de erro em pt-BR; documentação em pt-BR.
- **NestJS:** módulos pelas fronteiras da arquitetura §2.1; DI pelo construtor; validação
  na borda (class-validator, `forbidNonWhitelisted`); erros como `DomainError` com `code`
  estável (arquitetura §2.5).
- **Next.js 16:** Server Component por padrão; `'use client'` só onde há interação;
  `params`/`searchParams`/`cookies()` são assíncronos; página pública que lê a API usa
  `await connection()` (guia §7.2).
- Siga o estilo do código ao redor (densidade de comentários, nomes, idioma). Comentário
  explica o **porquê**, não o quê.

## 5. Documentação, decisões e git

- Decisão arquitetural nova → ADR em `docs/decisions.md` (e linha no Índice rápido)
  **antes** da próxima tarefa.
- Implementação divergiu da arquitetura/guia → atualize o documento no mesmo trabalho.
- `.env*.example` atualizados no mesmo commit da variável nova.
- Nunca commitar direto no `main`: uma branch por fatia/plano. Commit só quando o usuário
  pedir. Mensagens no padrão já usado (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- `next dev` recria o bloco do `apps/web/AGENTS.md`: se aparecer no diff, commite junto.

## 6. Testes

Use a skill do projeto **`testes-agendamento`** (`.claude/skills/testes-agendamento/`)
para escrever, organizar e rodar testes. Resumo do que ela cobra (detalhes no guia §4):

- Todo `CA-x.y` vira `it('[CA-x.y] …')` dentro de `describe('[RN-xx] …')`.
- Relógio falso sempre; nunca a data real em teste com data.
- Int/e2e só no `agendamento_test`, com `--runInBand`.
- Antes de fechar fatia: regressão completa e rastreabilidade sem critério faltando.
