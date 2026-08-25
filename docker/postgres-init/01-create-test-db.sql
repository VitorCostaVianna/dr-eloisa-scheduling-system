-- Roda automaticamente na primeira inicialização do container (volume vazio).
-- Sem isso, um ambiente novo (dev novo, CI, ou `docker compose down -v`) sobe só com
-- agendamento_dev e a suíte de teste (Tarefa 6 do Módulo 0) falha até alguém lembrar de
-- criar o banco de teste manualmente.
CREATE DATABASE agendamento_test;
