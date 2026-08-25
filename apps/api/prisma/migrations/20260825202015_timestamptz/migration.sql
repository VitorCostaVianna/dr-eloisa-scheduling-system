-- DropExclusionConstraint: precisa cair antes do ALTER COLUMN abaixo, porque a
-- constraint depende de uma expressão (tsrange) sobre startAt/endAt no tipo antigo.
ALTER TABLE "Appointment" DROP CONSTRAINT no_overlapping_appointments;

-- AlterTable
ALTER TABLE "Appointment" ALTER COLUMN "startAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "endAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "cancelledAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AddExclusionConstraint: recriada com tstzrange (não tsrange) porque startAt/endAt
-- agora são timestamptz — tsrange() não aceita argumentos com timezone.
ALTER TABLE "Appointment"
  ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (
    "professionalId" WITH =,
    tstzrange("startAt", "endAt") WITH &&
  )
  WHERE (status <> 'CANCELLED');

-- AlterTable
ALTER TABLE "Patient" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Professional" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ScheduleException" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Service" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "refreshTokenExpiresAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "WorkingHours" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);
