export enum Role {
  ADMIN = 'admin',
  USER = 'user',
}

export const ROLES = [Role.ADMIN, Role.USER] as const;
