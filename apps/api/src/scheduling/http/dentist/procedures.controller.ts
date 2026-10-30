import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ProcedureDto } from '@sistema-agendamento/shared-types';
import { ProceduresService } from '../../application/procedures.service';
import { ProfessionalContextService } from '../../application/professional-context.service';
import { CreateProcedureDto } from '../dto/create-procedure.dto';
import { UpdateProcedureDto } from '../dto/update-procedure.dto';
import { toProcedureDto } from '../presenters/procedure.presenter';

@Controller('procedures')
export class ProceduresController {
  constructor(
    private readonly procedures: ProceduresService,
    private readonly context: ProfessionalContextService,
  ) {}

  @Get()
  async list(@Req() req: Request): Promise<ProcedureDto[]> {
    const rows = await this.procedures.list(
      await this.context.forUser(req.user!.sub),
    );
    return rows.map(toProcedureDto);
  }

  // POST responde 201 por padrão no Nest.
  @Post()
  async create(
    @Req() req: Request,
    @Body() dto: CreateProcedureDto,
  ): Promise<ProcedureDto> {
    return toProcedureDto(
      await this.procedures.create(
        await this.context.forUser(req.user!.sub),
        dto,
      ),
    );
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcedureDto,
  ): Promise<ProcedureDto> {
    return toProcedureDto(
      await this.procedures.update(
        await this.context.forUser(req.user!.sub),
        id,
        dto,
      ),
    );
  }
}
