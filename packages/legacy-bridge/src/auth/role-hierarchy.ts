export const UserRole = {
  ADMINISTRATOR: 'ADMINISTRATOR', // Tier 1: Super Admin
  SUBADMIN: 'SUBADMIN',           // Tier 2: Regional Admin
  AGENT: 'AGENT',                 // Tier 3: Master Agent / Affiliate
  BRANCH: 'BRANCH',               // Tier 4: Betting Shop Branch
  CASHIER: 'CASHIER',             // Tier 5: Counter Operator
  PLAYER: 'PLAYER',               // Tier 6: Online End-User
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ROLE_HIERARCHY_LEVELS: Record<UserRole, number> = {
  ADMINISTRATOR: 1,
  SUBADMIN: 2,
  AGENT: 3,
  BRANCH: 4,
  CASHIER: 5,
  PLAYER: 6,
};

export class RoleHierarchy {
  public static isAuthorized(userRole: UserRole, requiredRole: UserRole): boolean {
    const userLevel = ROLE_HIERARCHY_LEVELS[userRole] ?? 99;
    const requiredLevel = ROLE_HIERARCHY_LEVELS[requiredRole] ?? 99;
    return userLevel <= requiredLevel;
  }

  public static canAccessAdminBackoffice(role: UserRole): boolean {
    return role !== UserRole.PLAYER;
  }

  public static canManageGlobalSettings(role: UserRole): boolean {
    return role === UserRole.ADMINISTRATOR;
  }

  public static canManageAgents(role: UserRole): boolean {
    return role === UserRole.ADMINISTRATOR || role === UserRole.SUBADMIN;
  }

  public static canManageBranches(role: UserRole): boolean {
    return role === UserRole.ADMINISTRATOR || role === UserRole.SUBADMIN || role === UserRole.AGENT;
  }

  public static canPlaceOTCTickets(role: UserRole): boolean {
    return role === UserRole.CASHIER || role === UserRole.BRANCH;
  }
}
