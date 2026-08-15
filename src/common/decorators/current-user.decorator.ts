import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AUTH_USER_KEY, AuthenticatedUser } from '../../auth/auth-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    return request.user ?? { userId: '' };
  },
);

export { AUTH_USER_KEY };
export type { AuthenticatedUser };
