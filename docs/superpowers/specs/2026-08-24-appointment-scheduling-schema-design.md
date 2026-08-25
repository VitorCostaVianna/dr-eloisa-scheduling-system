# Design: Schema de dados — Sistema de Agendamento (Clínica Dra. Eloísa)

Status: aprovado em conversa, pendente de ajustes pós-reunião de 31/08
Escopo: modelo de dados (Prisma/PostgreSQL) para v1 — não cobre estrutura de módulos do
NestJS nem componentização do Next.js, que ficam para o plano de implementação.

## Contexto

Primeiro cliente pagante (consultório odontológico single-tenant). O modelo de dados
precisa suportar o fluxo essencial (paciente agenda sem conta, dentista gerencia tudo)
e ficar flexível o bastante para absorver, sem migração estrutural, as respostas que só
serão conhecidas na reunião do dia 31/08:

- Dias/horários de atendimento da semana
- Intervalo de almoço ou outros intervalos fixos
- Se atende sozinha ou com mais profissionais/cadeiras
- Duração média da consulta
- Fluxo real de cancelamento
- Aprovação manual vs. confirmação automática do agendamento

## Decisões de design e porquês

### 1. `Professional` como entidade própria desde a v1
Mesmo com uma única profissional (a dentista) cadastrada hoje, `Appointment`,
`WorkingHours`, `ScheduleException` e `Service` referenciam `professionalId` via FK.
Adicionar um segundo profissional no futuro é um INSERT, não uma migração estrutural.

### 2. `User` separado de `Professional`
Autenticação (quem loga) e perfil profissional (quem atende) são conceitos diferentes.
Hoje a mesma pessoa ocupa os dois papéis, mas a separação evita acoplar login a
"atende paciente" — útil se um dia existir staff sem função clínica, ou um profissional
sem login próprio. `User.role` já existe como enum (`DENTIST | STAFF`) para o mesmo
motivo: campo barato de manter agora, custoso de adicionar depois. Nenhuma lógica de
permissão por papel é construída na v1 (YAGNI na lógica, não no campo) — hoje só existe
a dentista, sem recepcionista.

### 3. Disponibilidade como regras recorrentes + exceções (não slots pré-gerados)
`WorkingHours` (dia da semana + faixa em minutos) representa o horário normal e
recorrente. `ScheduleException` cobre uma data específica (feriado fechado, ou horário
customizado naquele dia). Os horários disponíveis para agendamento são **calculados em
tempo real** a partir dessas regras + agendamentos existentes — não existem linhas de
"slot" pré-geradas no banco.

Isso resolve, sem mudança de schema, as perguntas em aberto da reunião:
- **Dias/horários de atendimento** → linhas de `WorkingHours`.
- **Intervalo de almoço / outros intervalos fixos** → duas (ou mais) linhas de
  `WorkingHours` no mesmo dia (ex.: 08:00–12:00 e 14:00–18:00). Não existe um campo
  especial de "almoço" — é modelado como ausência de cobertura entre dois intervalos.
- **Feriados / dias sem atendimento** → `ScheduleException` com `type = CLOSED`.
- **Duração da consulta** → `Service.durationMinutes`, usado para calcular `endAt` e o
  espaçamento entre horários disponíveis.

### 4. Prevenção de conflito: exclusion constraint no Postgres (não lock aplicacional)
Como a duração da consulta varia por serviço, dois agendamentos podem começar em
horários diferentes e ainda se sobrepor. Um `UNIQUE(professionalId, startAt)` simples
não pega esse caso. A defesa real fica no banco:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (
    "professionalId" WITH =,
    tsrange("startAt", "endAt") WITH &&
  )
  WHERE (status <> 'CANCELLED');
```

- `btree_gist` ensina o índice GiST a comparar igualdade (`=`) em colunas comuns (como
  `professionalId`), já que por padrão GiST só compara ranges/tipos geométricos.
- O `WHERE (status <> 'CANCELLED')` impede que um agendamento cancelado continue
  bloqueando o horário.
- O Prisma **não sabe expressar** `EXCLUDE`. O `schema.prisma` mantém `startAt`/`endAt`
  como colunas normais; a constraint entra via edição manual do arquivo de migration
  gerado por `prisma migrate dev --create-only`. Fica documentada aqui para ser copiada
  quando o Módulo 0 do plano de implementação rodar essa migration pela primeira vez.
- Violação da constraint chega na aplicação como `PrismaClientKnownRequestError`
  (Postgres `23P01`, exclusion_violation) — o service de `appointments` intercepta e
  responde 409 ao paciente ("esse horário acabou de ser ocupado").
- A query de disponibilidade (WorkingHours + ScheduleException − appointments
  existentes) já filtra horários ocupados para a UX; a constraint é quem garante
  correção sob concorrência real.

### 5. `Patient` como tabela própria, sem conta/login
Paciente agenda só com nome + telefone, sem criar conta. `Patient.phone` é único —
permite localizar um paciente que já existe (por telefone) em vez de duplicar, e deixa
histórico de paciente (fase 2, fora de escopo agora) pronto sem migração de dados.

### 6. Cancelamento pelo paciente via token, sem autenticação
Ao agendar, o paciente recebe um `cancellationToken` único (exibido na tela de
confirmação — sem depender de WhatsApp/automação, que é fase 2). O link
`/cancelar/{token}` é a única porta de entrada do paciente para cancelar. A dentista
cancela/reagenda por qualquer agendamento direto pelo painel logado.

### 7. `AppointmentStatus` já cobre aprovação manual e confirmação automática
Enum `PENDING | CONFIRMED | CANCELLED | COMPLETED | NO_SHOW`. A decisão de "todo
agendamento nasce `PENDING` (aguarda aprovação da dentista)" vs. "nasce `CONFIRMED`
direto" é uma regra de **código** (branch na criação do agendamento), não uma mudança
de schema — fica para o Módulo de `appointments` no plano de implementação, após a
reunião do dia 31.

### 8. Idempotência na criação de agendamento
`Appointment.idempotencyKey` (único, opcional): o front gera uma chave por tentativa de
agendamento; um retry ou duplo clique com a mesma chave não cria um segundo registro.

### 9. Timezone
`startAt`/`endAt` são `DateTime` do Prisma → `timestamptz` no Postgres, sempre
armazenado em UTC. Conversão para o fuso da clínica acontece só na camada de
apresentação (frontend).

## Modelo de dados (visão geral)

```
User (auth) ──1:1── Professional ──1:N── WorkingHours
                          │      ──1:N── ScheduleException
                          │      ──N:M── Service
                          └──1:N── Appointment ──N:1── Service
                                       │
                                       └──N:1── Patient
```

Ver `prisma/schema.prisma` para os campos completos de cada entidade — não duplicado
aqui para evitar os dois arquivos divergirem.

## Fora de escopo deste documento

- Estrutura de módulos do NestJS (comunicação via `@nestjs/event-emitter`, guards,
  DTOs) — decidida durante a implementação, módulo por módulo.
- Componentização do Next.js.
- Regras de negócio finais de disponibilidade/aprovação — dependem da reunião de 31/08;
  o schema foi desenhado para absorvê-las sem refatoração (ver seção "Decisões" acima).
