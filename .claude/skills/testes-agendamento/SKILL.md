---
name: testes-agendamento
description: Use when writing, fixing, running or accepting tests in the Dra. Eloísa scheduling repo — acceptance tests for CA-x.y criteria, regression tests for a reported bug, confirmation re-tests after a fix, the regression suite before closing a slice, or giving a tester's acceptance verdict.
---

# Testes do agendamento

## Visão geral

A referência é o guia `docs/architecture/guia-de-desenvolvimento.md` §4 (camadas,
suítes, relógio, fixtures, isolamento, concorrência, regressão) e §7.5 (instabilidade).
Esta skill é o **procedimento** e o **formato** que o guia não fixa. Leia a §4 do guia
antes da primeira tarefa de testes da sessão.

## 1. Teste de critério de aceite

Para cada `CA-x.y` do briefing:

1. Copie o texto do critério da spec (`grep -n "CA-x.y" docs/superpowers/specs/2026-10-28-agenda-e-agendamento-design.md`)
   para um comentário logo acima do `it`. O cenário do teste é **o do critério**: as
   mesmas datas, horários e durações.
2. Camada(s) pela tabela do guia §4.3; um teste por camada, mesma tag.
3. Forma:
   ```ts
   describe('[RN-42] bloqueio de dia inteiro', () => {
     // CA-1.15: Dado um bloqueio de dia inteiro de 16/11 a 20/11, então nenhum início …
     it('[CA-1.15] 16/11–20/11 sem nenhum início', () => {
       // Dado
       const block = fullDayBlock('2026-11-16', '2026-11-20');
       // Quando
       const starts = computeAvailableStarts(availabilityInput({ blocks: [block], … }));
       // Então
       for (const d of ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'])
         expect(starts.get(d) ?? []).toEqual([]);
     });
   });
   ```
4. Instantes **sempre** por `clinicInstant('2026-11-16 23:30')`. Literal ISO com `Z`,
   offset somado à mão e `new Date('YYYY-MM-DD')` ficam fora dos testes, porque escondem
   o mesmo erro de fuso que o teste deveria pegar.
   Fim de dia inteiro = `clinicInstant('<dia seguinte> 00:00')` (semiaberto, guia §7.1).
5. Cláusula negativa ("nada é criado", "nenhum evento") = contagem no banco **antes e
   depois** da ação, com as duas contagens no teste.
6. "Então" afirma o **valor exato** que o critério implica (`toEqual` da lista inteira de
   horários, contagem exata). `toBeGreaterThan(0)`, `toBeTruthy()` e `.length > 0` só
   quando o critério diz literalmente "algum".
7. Comandos: só os do guia §1.3 (`pnpm --filter api test -- -t "CA-1.15]"` etc.), a
   partir da raiz. Sem `\[`: no Windows o pnpm dobra a barra e o regex quebra.

## 2. Teste de regressão de bug

Bug reportado que não é o cenário literal de um `CA`:

- Título: `it('[BUG aaaa-mm-dd] <sintoma em uma frase>')`, dentro do `describe('[RN-xx] …')`
  da regra violada, no mesmo arquivo dos testes dessa regra.
- O cenário reproduz o relato (datas e horários do relato).
- Esses testes ficam para sempre na suíte, como os outros testes da regra.
- Se o bug também quebra um `CA` (o teste do `CA` deveria ter falhado e não falhou),
  corrija o teste do `CA` também e registre isso no relatório.

## 3. Reteste de confirmação (depois de uma correção)

Na ordem, guardando a saída de cada passo:

1. Rode o teste novo **no código sem a correção** (`git stash` ou o commit anterior) →
   vermelho **pelo motivo esperado** (asserção da regra, não `Cannot find module` nem
   erro de setup).
2. Com a correção → verde.
3. Suíte da camada tocada inteira.
4. Teste de concorrência (int/e2e com `Promise.allSettled`): repetir 20× (guia §4.6).
   Unit determinístico não precisa.
5. Fim de fatia: regressão completa (guia §4.8) + rastreabilidade (guia §4.3).

Se o passo 1 não fica vermelho pelo motivo certo (falta infra, módulo, factory), o
veredito é **BLOQUEADO**, não aceito.

**Teste de aceite novo (antes da implementação):** roda contra o esqueleto do
implementador (CLAUDE.md §3.1). Vermelho válido = falha numa asserção ou no
`NotImplementedException` do esqueleto. Se o esqueleto não tem o que o teste precisa,
peça ao orquestrador que o implementador o complete. Não crie o esqueleto você mesmo.

## 4. Contratos que ainda não existem

Ao usar um nome que nem o código nem a arquitetura (§2.3, §2.4, §4.1, §5) definem
(classe, método, formato de retorno, valor de enum, tipo de evento), use o melhor palpite
e liste-o em **Contratos assumidos** no relatório. O orquestrador fixa a lista no
briefing do implementador.

## 5. Relatório do testador (formato fixo)

```
Veredito: ACEITO | REJEITADO | BLOQUEADO — <uma frase>
Critérios: | CA/BUG | camada | arquivo:linha | vermelho antes? | verde agora? |
Comandos: <cada comando + trecho final da saída real>
Repetições: <teste ×N, falhas>
Contratos assumidos: <lista ou "nenhum">
Divergências da spec: <lista ou "nenhuma">
```

Sem saída real de comando, a linha não conta como verde.

## Erros comuns

| Erro | Certo |
|---|---|
| Tag `[CA-x.y]` num cenário parecido, mas não o do critério | Cenário copiado do texto do critério; o resto vira `[BUG …]` ou teste sem tag |
| "Vermelho" por módulo/factory inexistente | BLOQUEADO até a infra ou o esqueleto existir |
| `jest.useFakeTimers()` ou mock do Prisma em int/e2e | `FixedClock` via `CLOCK`; Postgres real (guia §4.1, §4.4) |
| Aceitar pelo relatório do implementador | Rodar os comandos e colar a saída |
| Mudar `process.env.TZ` sem restaurar | `afterEach` restaura (guia §7.5) |
| Fim de dia como `23:59` + 1 min | `clinicInstant('<dia seguinte> 00:00')` |
| `npx jest` dentro de `apps/api` | `pnpm --filter api test …` da raiz (guia §1.3) |
