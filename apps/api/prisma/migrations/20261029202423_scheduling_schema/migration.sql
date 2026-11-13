/*
  Warnings:

  - You are about to drop the `ScheduleException` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `contactName` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source` to the `Appointment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('PATIENT', 'DENTIST', 'BLOCK', 'APPROVAL_TIMEOUT');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('PUBLIC', 'DENTIST');

-- CreateEnum
CREATE TYPE "AppointmentEventType" AS ENUM ('REQUESTED', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'RESCHEDULED', 'CONTACT_UPDATED', 'COMPLETED', 'NO_SHOW');

-- DropForeignKey
ALTER TABLE "ScheduleException" DROP CONSTRAINT "ScheduleException_professionalId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "cancelReason" "CancelReason",
ADD COLUMN     "closedAt" TIMESTAMPTZ(3),
ADD COLUMN     "confirmedAt" TIMESTAMPTZ(3),
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT NOT NULL,
ADD COLUMN     "rejectionMessage" TEXT,
ADD COLUMN     "source" "AppointmentSource" NOT NULL,
ADD COLUMN     "suggestedStartAt" TIMESTAMPTZ(3),
ALTER COLUMN "serviceId" DROP NOT NULL,
ALTER COLUMN "cancellationToken" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "email" TEXT;

-- DropTable
DROP TABLE "ScheduleException";

-- DropEnum
DROP TYPE "ExceptionType";

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayOverride" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "type" "AppointmentEventType" NOT NULL,
    "actor" "CancelledBy" NOT NULL,
    "fromStatus" "AppointmentStatus",
    "toStatus" "AppointmentStatus" NOT NULL,
    "fromStartAt" TIMESTAMPTZ(3),
    "fromEndAt" TIMESTAMPTZ(3),
    "toStartAt" TIMESTAMPTZ(3),
    "toEndAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleBlock_professionalId_startAt_idx" ON "ScheduleBlock"("professionalId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayOverride_professionalId_date_key" ON "HolidayOverride"("professionalId", "date");

-- CreateIndex
CREATE INDEX "AppointmentEvent_appointmentId_idx" ON "AppointmentEvent"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Notification_appointmentId_kind_createdAt_idx" ON "Notification"("appointmentId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Appointment_status_startAt_idx" ON "Appointment"("status", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_status_closedAt_idx" ON "Appointment"("status", "closedAt");

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayOverride" ADD CONSTRAINT "HolidayOverride_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraint de sobreposição recriada: agora só CANCELLED, REJECTED e EXPIRED liberam o
-- horário (spec 6.3). Os valores novos do enum foram criados na migration anterior
-- (scheduling_enum_values), porque não podem ser usados na transação que os cria.
ALTER TABLE "Appointment" DROP CONSTRAINT no_overlapping_appointments;
ALTER TABLE "Appointment"
  ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (
    "professionalId" WITH =,
    tstzrange("startAt", "endAt") WITH &&
  )
  WHERE (status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED'));

-- CHECKs de intervalo: o Prisma não representa CHECK. Intervalo vazio ou invertido
-- nunca chega ao banco como 500 anônimo; a camada de aplicação valida antes (400).
ALTER TABLE "Appointment"   ADD CONSTRAINT appointment_start_before_end    CHECK ("startAt" < "endAt");
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT schedule_block_start_before_end CHECK ("startAt" < "endAt");

-- RN-45: faixa semanal válida (dia 0-6, minutos dentro do dia, início < fim).
ALTER TABLE "WorkingHours" ADD CONSTRAINT working_hours_valid_range
  CHECK ("dayOfWeek" BETWEEN 0 AND 6 AND "startMinute" >= 0
         AND "startMinute" < "endMinute" AND "endMinute" <= 1440);

-- RN-40: nome de procedimento ativo é único sem distinguir maiúsculas; inativos podem repetir.
CREATE UNIQUE INDEX service_active_name_ci_key ON "Service" (lower("name")) WHERE active;
