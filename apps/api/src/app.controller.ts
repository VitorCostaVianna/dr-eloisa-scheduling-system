import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Pré-existente ao módulo Auth (boilerplate do Nest). Continua público depois do
  // guard global entrar em vigor — não expõe dado nenhum, serve como smoke test/health
  // check de que a API está de pé.
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
