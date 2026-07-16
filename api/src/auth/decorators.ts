import {
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';

import type { Role } from '../generated/prisma/enums';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Opts a route out of the globally-applied JWT guard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to the listed roles. Enforced by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
