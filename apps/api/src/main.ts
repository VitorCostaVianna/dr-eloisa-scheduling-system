import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './common/configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  configureApp(app);

  // Sem isto, hooks como PrismaService.onModuleDestroy (que fecha o pool de conexões)
  // só rodam em app.close() manual — nunca em SIGTERM/SIGINT reais (restart de
  // container, deploy, Ctrl+C).
  app.enableShutdownHooks();

  app.useLogger(app.get(Logger));

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
