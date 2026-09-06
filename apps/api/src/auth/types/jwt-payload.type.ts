import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string; // User.id
  role: Role;
}
