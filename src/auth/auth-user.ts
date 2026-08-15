export type AuthenticatedUser = {
  userId: string;
  email?: string;
};

export const AUTH_USER_KEY = 'user' as const;
