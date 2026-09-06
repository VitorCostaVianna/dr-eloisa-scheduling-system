import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  // Falha rápido em vez de deixar o CORS do Nest cair pro padrão "*" quando a env var
  // não está setada (comportamento do pacote `cors`: origin undefined == allow-all).
  if (!process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN precisa estar definida (nunca usar "*" em produção)');
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Sem isto, hooks como PrismaService.onModuleDestroy (que fecha o pool de conexões)
  // só rodam em app.close() manual — nunca em SIGTERM/SIGINT reais (restart de
  // container, deploy, Ctrl+C).
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
