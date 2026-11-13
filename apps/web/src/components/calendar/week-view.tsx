import Link from "next/link";
import type {
  CalendarAppointmentDto,
  CalendarResponse,
} from "@sistema-agendamento/shared-types";
import { addDays, formatClinicDate, formatClinicTime } from "@/lib/clinic-time";
import { buttonVariants } from "@/components/ui/button";
import { layoutWeek, SLOT_MINUTES, type PositionedItem } from "./week-layout";

export interface WeekViewProps {
  calendar: CalendarResponse;
  /** Segunda-feira da semana exibida, 'YYYY-MM-DD'. */
  weekStart: string;
}

const FIRST_MINUTE = 7 * 60;
const LAST_MINUTE = 19 * 60;
const SLOT_COUNT = (LAST_MINUTE - FIRST_MINUTE) / SLOT_MINUTES;
const SLOT_REM = 1.25;
const ROWS = `repeat(${SLOT_COUNT}, ${SLOT_REM}rem)`;

const STATUS_STYLE: Record<CalendarAppointmentDto["status"], string> = {
  PENDING: "border-dashed border-amber-500 bg-amber-50 text-amber-950",
  CONFIRMED: "border-solid border-emerald-600 bg-emerald-50 text-emerald-950",
  COMPLETED: "border-solid border-slate-400 bg-slate-100 text-slate-700",
  NO_SHOW: "border-solid border-rose-500 bg-rose-50 text-rose-950",
};

const HATCH =
  "repeating-linear-gradient(45deg, transparent 0 6px, rgba(100,116,139,0.25) 6px 8px)";

const STATUS_LABEL: Record<CalendarAppointmentDto["status"], string> = {
  PENDING: "pendente de confirmação",
  CONFIRMED: "confirmado",
  COMPLETED: "concluído",
  NO_SHOW: "faltou",
};

/** 'segunda-feira, 7 de dezembro' -> '7 de dezembro' (+ ano quando pedido). */
const dayMonth = (date: string, withYear: boolean) =>
  `${formatClinicDate(date).split(", ")[1]}${withYear ? ` de ${date.slice(0, 4)}` : ""}`;

const rowOf = (item: PositionedItem) => ({
  gridRow: `${item.topSlot + 1} / span ${item.spanSlots}`,
});

/** Somente leitura: sem estado nem handlers, então é Server Component; a navegação são links. */
export function WeekView({ calendar, weekStart }: WeekViewProps) {
  const { bands, blocks, appointments } = layoutWeek(calendar, {
    firstMinute: FIRST_MINUTE,
    lastMinute: LAST_MINUTE,
  });
  const appointmentById = new Map(calendar.appointments.map((a) => [a.id, a]));
  const blockById = new Map(calendar.blocks.map((b) => [b.id, b]));
  const hours = Array.from(
    { length: (LAST_MINUTE - FIRST_MINUTE) / 60 },
    (_, i) => FIRST_MINUTE / 60 + i,
  );
  const linkClass = buttonVariants({ variant: "outline", size: "sm" });

  return (
    <section aria-label="Agenda semanal" className="flex flex-col gap-3">
      <nav aria-label="Semana" className="flex flex-wrap items-center gap-3">
        <Link href={`?semana=${addDays(weekStart, -7)}`} className={linkClass}>
          Semana anterior
        </Link>
        <span className="font-medium">
          {dayMonth(
            weekStart,
            weekStart.slice(0, 4) !== addDays(weekStart, 6).slice(0, 4),
          )}{" "}
          a {dayMonth(addDays(weekStart, 6), true)}
        </span>
        <Link href={`?semana=${addDays(weekStart, 7)}`} className={linkClass}>
          Próxima semana
        </Link>
      </nav>

      <div className="overflow-x-auto">
        <div className="grid min-w-[52rem] grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-x-1">
          <div />
          {calendar.days.map((day) => (
            <div key={day.date} className="flex flex-col gap-0.5 pb-2 text-sm">
              <span id={day.date} className="font-medium">
                {formatClinicDate(day.date)}
              </span>
              {day.holiday && (
                <span className="text-xs text-muted-foreground">
                  {`${day.holiday.name} — ${day.holiday.overridden ? "atendendo" : "fechado"}`}
                </span>
              )}
            </div>
          ))}

          <div className="grid" style={{ gridTemplateRows: ROWS }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="text-xs text-muted-foreground"
                style={{ gridRow: `${i * 4 + 1} / span 4` }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {calendar.days.map((day, dayIndex) => (
            <div
              key={day.date}
              role="list"
              aria-labelledby={day.date}
              className="grid rounded border bg-background"
              style={{ gridTemplateRows: ROWS }}
            >
              {bands
                .filter((b) => b.dayIndex === dayIndex)
                .map((b) => (
                  <div
                    key={b.id}
                    className="bg-sky-50"
                    style={rowOf(b)}
                    aria-hidden="true"
                  />
                ))}
              {blocks
                .filter((b) => b.dayIndex === dayIndex)
                .map((b, i) => {
                  const reason = blockById.get(b.id)?.reason;
                  return (
                    <div
                      key={`${b.id}-${i}`}
                      role="listitem"
                      className="overflow-hidden px-1 text-xs text-slate-700"
                      style={{ ...rowOf(b), backgroundImage: HATCH }}
                    >
                      Bloqueado{reason ? `: ${reason}` : ""}
                    </div>
                  );
                })}
              {appointments
                .filter((a) => a.dayIndex === dayIndex)
                .map((a, i) => {
                  const dto = appointmentById.get(a.id);
                  if (!dto) return null;
                  return (
                    <div
                      key={`${a.id}-${i}`}
                      role="listitem"
                      data-status={dto.status}
                      className={`z-10 m-px flex min-w-0 flex-col overflow-hidden rounded border px-1 text-xs leading-4 ${STATUS_STYLE[dto.status]}`}
                      style={rowOf(a)}
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 font-medium">
                          {formatClinicTime(dto.startAt)}
                        </span>
                        <span className="sr-only">
                          {STATUS_LABEL[dto.status]}
                        </span>
                        {dto.onHoliday && (
                          <span className="min-w-0 truncate font-semibold">
                            em feriado
                          </span>
                        )}
                        {dto.outsideWorkingHours && (
                          <span className="min-w-0 truncate font-semibold">
                            fora do horário
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 items-center gap-1">
                        <span
                          className="min-w-0 truncate font-medium"
                          title={dto.contactName}
                        >
                          {dto.contactName}
                        </span>
                        {dto.procedureName && (
                          <span
                            className="min-w-0 truncate"
                            title={dto.procedureName}
                          >
                            {dto.procedureName}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Horários de Brasília. Fundo azul: horário de atendimento. Hachurado:
        bloqueio. Borda tracejada: pendente de confirmação.
      </p>
    </section>
  );
}
