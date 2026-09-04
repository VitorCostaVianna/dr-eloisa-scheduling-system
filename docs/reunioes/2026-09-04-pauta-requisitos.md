# Pauta — Reunião de requisitos (Sistema de Agendamento)

Compilada em: 2026-09-04
Reunião anterior: 2026-08-31 (levantamento inicial)

## Já confirmado com a cliente

Estes pontos já foram validados e **não precisam ser reperguntados**:

- Calendário mostrando horários disponíveis.
- Tanto o cliente quanto a dentista podem marcar um agendamento.
- Apenas uma profissional (a dentista) — sem múltiplos profissionais/cadeiras.
- A dentista pode criar **encaixes**: horários fora da disponibilidade normal, à
  escolha dela.
- É obrigatório coletar **Nome** e **Telefone** do cliente ao agendar.
- Evitar duplicidade de cadastro de cliente — um cliente já existente (identificado
  pelo telefone) deve ser reaproveitado, não recriado.
- A dentista pode remarcar e cancelar qualquer agendamento.
- O cliente também pode cancelar o próprio agendamento (não só a dentista).
- O agendamento tem um campo de **descrição opcional** (ex.: "Limpeza de dente"),
  preenchível tanto pelo cliente quanto pela dentista.

## Pauta desta reunião — decisões em aberto

### Críticas (mudam o fluxo/arquitetura — resolver primeiro)

1. **Confirmação automática vs. aprovação manual**
   Todo agendamento entra confirmado direto, ou fica pendente até a dentista aprovar?
   Essa é a decisão de maior impacto: muda toda a experiência do cliente ao agendar.

2. **Duração do agendamento**
   É fixa (ex.: sempre 30 min) ou varia por tipo de procedimento (limpeza, canal,
   avaliação etc.)? Define se cada horário disponível no calendário tem duração igual
   ou se depende do serviço escolhido.

3. **Cancelamento pelo cliente**
   Confirmado que o cliente pode cancelar — falta definir: existe algum prazo mínimo de
   antecedência para isso ser permitido? (ver item 6)

### Importantes (afetam o cálculo de disponibilidade)

4. **Horário de funcionamento semanal**
   Quais dias da semana a clínica atende e em qual faixa de horário (ex.: seg-sex,
   8h-18h)?

5. **Intervalo de almoço / outras pausas fixas**
   Existe, e em que horário?

6. **Feriados e exceções**
   Dias específicos fechados, ou com horário diferente do padrão.

### Secundárias (podem ficar para depois, se o tempo apertar)

7. **Antecedência mínima**
   Prazo mínimo para agendar ou cancelar um horário (ex.: não pode marcar/cancelar em
   cima da hora)?

8. **Canal de notificação do cliente**
   WhatsApp, e-mail, ou apenas confirmação na tela?

   > **Nota técnica:** integração com WhatsApp é significativamente mais difícil que
   > e-mail — exige API oficial do WhatsApp Business, conta empresarial verificada pela
   > Meta, templates de mensagem pré-aprovados fora da janela de 24h de atendimento
   > ativo, custo por conversa, e geralmente um intermediário pago (Twilio, Gupshup,
   > 360dialog). E-mail (SMTP ou provedor transacional como Resend/SES) não tem
   > processo de aprovação e é gratuito/barato para começar.
   > **Recomendação:** e-mail na v1; WhatsApp como evolução futura, a menos que a
   > cliente tenha um motivo forte para priorizar WhatsApp desde já.

## Depois da reunião

- Atualizar `docs/decisions.md` com toda decisão tomada aqui.
- Consolidar as respostas antes de iniciar o brainstorm do próximo módulo
  (provavelmente Disponibilidade/Agendamento).
