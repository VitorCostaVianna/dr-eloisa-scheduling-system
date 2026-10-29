import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

// Setup HTTP compartilhado entre o main.ts e os testes (createTestApp): garante que
// e2e exercita exatamente o mesmo pipeline de produção (helmet, CORS, validação).
export function configureApp(app: NestExpressApplication): void {
  // Falha rápido em vez de deixar o CORS do Nest cair pro padrão "*" quando a env var
  // não está setada (comportamento do pacote `cors`: origin undefined == allow-all).
  if (!process.env.CORS_ORIGIN) {
    throw new Error(
      'CORS_ORIGIN precisa estar definida (nunca usar "*" em produção)',
    );
  }

  // `@nestjs/throttler` identifica o cliente por `req.ips[0] ?? req.ip`, que só reflete
  // o IP real por trás de um reverse proxy/load balancer se o Express souber confiar no
  // header `X-Forwarded-For`. Sem isto, toda requisição atrás de qualquer proxy chega
  // com o mesmo IP (o do proxy), transformando o rate limit de login (5/min) num
  // cadeado global em vez de por cliente. `1` assume exatamente UM hop de proxy na
  // frente da API (o topologia típica: um único reverse proxy/LB de PaaS) — precisa ser
  // revisitado se a topologia de deploy mudar (mais de um hop, ex. Cloudflare na frente
  // de um LB de PaaS, ou nenhum hop, API exposta direto pra internet). Confiar num hop
  // que não é de fato um proxy real deixaria um cliente malicioso forjar seu próprio IP
  // via X-Forwarded-For e furar o rate limit por completo — não é um default
  // cosmético, é uma decisão real de topologia de produção (ver ADR 018 em
  // docs/decisions.md).
  app.set('trust proxy', 1);

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
}
