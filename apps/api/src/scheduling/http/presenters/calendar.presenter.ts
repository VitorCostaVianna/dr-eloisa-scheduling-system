import type { CalendarResponse } from '@sistema-agendamento/shared-types';
import type { CalendarView } from '../../application/calendar.service';
import { toBlockDto } from './block.presenter';

export function toCalendarResponse(view: CalendarView): CalendarResponse {
  return { ...view, blocks: view.blocks.map(toBlockDto) };
}
