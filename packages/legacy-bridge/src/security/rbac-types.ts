/**
 * Staff RBAC Permissions & Tamper-Proof Audit Trail Types & Contracts
 */

export const Permission = {
  // User Management
  USERS_VIEW: 'USERS_VIEW',
  USERS_MANAGE: 'USERS_MANAGE',
  USERS_CHANGE_ROLE: 'USERS_CHANGE_ROLE',
  USERS_SUSPEND: 'USERS_SUSPEND',
  USERS_KYC_OVERRIDE: 'USERS_KYC_OVERRIDE',

  // Payments & Finance
  PAYMENTS_VIEW: 'PAYMENTS_VIEW',
  DEPOSIT_MANUAL_CREDIT: 'DEPOSIT_MANUAL_CREDIT',
  WITHDRAWAL_APPROVE: 'WITHDRAWAL_APPROVE',
  WITHDRAWAL_REJECT: 'WITHDRAWAL_REJECT',

  // Sportsbook & Trading
  TICKETS_VIEW: 'TICKETS_VIEW',
  TICKET_MANUAL_SETTLE: 'TICKET_MANUAL_SETTLE',
  TICKET_CANCEL: 'TICKET_CANCEL',
  TICKET_PAYOUT_OVERRIDE: 'TICKET_PAYOUT_OVERRIDE',
  ODDS_VIEW: 'ODDS_VIEW',
  ODDS_OVERRIDE_MARGIN: 'ODDS_OVERRIDE_MARGIN',
  ODDS_SUSPEND_MARKET: 'ODDS_SUSPEND_MARKET',

  // Risk & Compliance
  RISK_MANAGE_LIMITS: 'RISK_MANAGE_LIMITS',
  RISK_RESOLVE_ALERTS: 'RISK_RESOLVE_ALERTS',

  // Reports & Audits
  REPORTS_VIEW_FINANCIALS: 'REPORTS_VIEW_FINANCIALS',
  REPORTS_EXPORT_DATA: 'REPORTS_EXPORT_DATA',
  REPORTS_VIEW_AUDIT_LOGS: 'REPORTS_VIEW_AUDIT_LOGS',

  // CMS & Platform Settings
  CMS_MANAGE_CONTENT: 'CMS_MANAGE_CONTENT',
  SETTINGS_MANAGE: 'SETTINGS_MANAGE',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const StaffRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  RISK_COMPLIANCE_OFFICER: 'RISK_COMPLIANCE_OFFICER',
  PAYMENTS_FINANCE_OFFICER: 'PAYMENTS_FINANCE_OFFICER',
  SPORTSBOOK_TRADER: 'SPORTSBOOK_TRADER',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  SHOP_CASHIER: 'SHOP_CASHIER',
  CUSTOMER_SUPPORT: 'CUSTOMER_SUPPORT',
} as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

export interface StaffUserRecord {
  id: string;
  username: string;
  email: string;
  role: StaffRole;
  customPermissions: string[]; // Custom capability additions
  revokedPermissions: string[]; // Explicit capability revocations
  branchId?: string | null;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: Date | null;
}

export const AuditStatus = {
  SUCCESS: 'SUCCESS',
  DENIED: 'DENIED',
  FAILED: 'FAILED',
} as const;
export type AuditStatus = (typeof AuditStatus)[keyof typeof AuditStatus];

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorUsername: string;
  actorRole: StaffRole;
  action: string;
  resource: string;
  resourceId?: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
  status: AuditStatus;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface AuditQueryFilter {
  actorId?: string;
  action?: string;
  resource?: string;
  status?: AuditStatus;
  fromDate?: Date;
  toDate?: Date;
}
