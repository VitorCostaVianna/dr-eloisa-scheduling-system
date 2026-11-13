import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  BlockDto,
  CreateBlockRequest,
} from '@sistema-agendamento/shared-types';
import { ProfessionalContextService } from '../../application/professional-context.service';
import { ScheduleConfigService } from '../../application/schedule-config.service';
import { CreateBlockDto } from '../dto/create-block.dto';
import { ListRangeDto } from '../dto/list-range.dto';
import { toBlockDto } from '../presenters/block.presenter';

@Controller('blocks')
export class BlocksController {
  constructor(
    private readonly config: ScheduleConfigService,
    private readonly context: ProfessionalContextService,
  ) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query() range: ListRangeDto,
  ): Promise<BlockDto[]> {
    const rows = await this.config.listBlocks(
      await this.context.forUser(req.user!.sub),
      range.from,
      range.to,
    );
    return rows.map(toBlockDto);
  }

  // POST responde 201 por padrão no Nest.
  @Post()
  async create(
    @Req() req: Request,
    @Body() dto: CreateBlockDto,
  ): Promise<BlockDto> {
    return toBlockDto(
      await this.config.createBlock(
        await this.context.forUser(req.user!.sub),
        // O DTO (campos opcionais) é validado por `kind`; o serviço revalida a coerência.
        dto as CreateBlockRequest,
      ),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.config.deleteBlock(
      await this.context.forUser(req.user!.sub),
      id,
    );
  }
}
