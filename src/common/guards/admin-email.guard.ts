import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { AUTH_USER_KEY, AuthenticatedUser } from '../../auth/auth-user';

export const ADMIN_EMAILS = [
  'carlos87jaramillo@gmail.com',
  'zeus6281@gmail.com',
  'lotoiacaro@gmail.com',
] as const;

@Injectable()
export class AdminEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ [AUTH_USER_KEY]?: AuthenticatedUser }>();
    const user = request[AUTH_USER_KEY];
    const email = user?.email?.trim().toLowerCase();

    if (!email || !(ADMIN_EMAILS as readonly string[]).includes(email)) {
      throw new ForbiddenException('Acceso restringido a administradores');
    }

    return true;
  }
}
