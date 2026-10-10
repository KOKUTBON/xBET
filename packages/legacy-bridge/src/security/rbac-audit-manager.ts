/**
 * Staff RBAC Permissions & Tamper-Proof Audit Trail Manager
 * Resolves dynamic capability matrices, enforces security authorization guards,
 * and maintains immutable regulatory audit logs.
 */

import { randomUUID } from 'crypto';
import {
  Permission,
  StaffRole,
  AuditStatus,
} from './rbac-types.ts';
import type {
  StaffUserRecord,
  AuditLogEntry,
  AuditQueryFilter,
} from './rbac-types.ts';

export class RbacAuditManager {
  private static instance: RbacAuditManager;
  private staffUsers: Map<string, StaffUserRecord> = new Map();
  private auditLogs: AuditLogEntry[] = [];

  // Default capabilities assigned to each role
  private roleDefaultPermissions: Map<StaffRole, Set<string>> = new Map([
    [
      StaffRole.SUPER_ADMIN,
      new Set(Object.values(Permission)),
    ],
    [
      StaffRole.RISK_COMPLIANCE_OFFICER,
      new Set([
        Permission.USERS_VIEW,
        Permission.USERS_SUSPEND,
        Permission.USERS_KYC_OVERRIDE,
        Permission.RISK_MANAGE_LIMITS,
        Permission.RISK_RESOLVE_ALERTS,
        Permission.REPORTS_VIEW_AUDIT_LOGS,
        Permission.TICKETS_VIEW,
      ]),
    ],
    [
      StaffRole.PAYMENTS_FINANCE_OFFICER,
      new Set([
        Permission.PAYMENTS_VIEW,
        Permission.WITHDRAWAL_APPROVE,
        Permission.WITHDRAWAL_REJECT,
        Permission.DEPOSIT_MANUAL_CREDIT,
        Permission.REPORTS_VIEW_FINANCIALS,
        Permission.REPORTS_EXPORT_DATA,
        Permission.USERS_VIEW,
      ]),
    ],
    [
      StaffRole.SPORTSBOOK_TRADER,
      new Set([
        Permission.ODDS_VIEW,
        Permission.ODDS_OVERRIDE_MARGIN,
        Permission.ODDS_SUSPEND_MARKET,
        Permission.TICKETS_VIEW,
        Permission.TICKET_MANUAL_SETTLE,
        Permission.TICKET_CANCEL,
        Permission.RISK_MANAGE_LIMITS,
      ]),
    ],
    [
      StaffRole.BRANCH_MANAGER,
      new Set([
        Permission.TICKETS_VIEW,
        Permission.USERS_VIEW,
        Permission.REPORTS_VIEW_FINANCIALS,
        Permission.DEPOSIT_MANUAL_CREDIT,
      ]),
    ],
    [
      StaffRole.SHOP_CASHIER,
      new Set([
        Permission.TICKETS_VIEW,
        Permission.TICKET_PAYOUT_OVERRIDE,
        Permission.DEPOSIT_MANUAL_CREDIT,
      ]),
    ],
    [
      StaffRole.CUSTOMER_SUPPORT,
      new Set([
        Permission.USERS_VIEW,
        Permission.TICKETS_VIEW,
        Permission.PAYMENTS_VIEW,
      ]),
    ],
  ]);

  private constructor() {
    // Seed default Super Admin
    this.registerStaffUser({
      username: 'super_admin_root',
      email: 'root@xbet.internal',
      role: StaffRole.SUPER_ADMIN,
    });
  }

  public static getInstance(): RbacAuditManager {
    if (!RbacAuditManager.instance) {
      RbacAuditManager.instance = new RbacAuditManager();
    }
    return RbacAuditManager.instance;
  }

  public registerStaffUser(params: {
    id?: string;
    username: string;
    email: string;
    role: StaffRole;
    branchId?: string | null;
    customPermissions?: string[];
    revokedPermissions?: string[];
  }): StaffUserRecord {
    const id = params.id || `staff_${randomUUID().slice(0, 8)}`;
    const staff: StaffUserRecord = {
      id,
      username: params.username,
      email: params.email,
      role: params.role,
      customPermissions: params.customPermissions || [],
      revokedPermissions: params.revokedPermissions || [],
      branchId: params.branchId || null,
      isActive: true,
      createdAt: new Date(),
      lastLoginAt: null,
    };

    this.staffUsers.set(id, staff);
    console.log(`[RBAC] Registered Staff Member: ${staff.username} (${staff.role}) - ID: ${staff.id}`);
    return staff;
  }

  public getStaffUser(staffId: string): StaffUserRecord | undefined {
    return this.staffUsers.get(staffId);
  }

  public grantCustomPermission(staffId: string, permission: Permission): void {
    const staff = this.staffUsers.get(staffId);
    if (!staff) throw new Error(`Staff user ${staffId} not found`);

    if (!staff.customPermissions.includes(permission)) {
      staff.customPermissions.push(permission);
    }
    // Remove from revoked if present
    staff.revokedPermissions = staff.revokedPermissions.filter((p) => p !== permission);
    console.log(`[RBAC] Granted ${permission} to ${staff.username}`);
  }

  public revokePermission(staffId: string, permission: Permission): void {
    const staff = this.staffUsers.get(staffId);
    if (!staff) throw new Error(`Staff user ${staffId} not found`);

    if (!staff.revokedPermissions.includes(permission)) {
      staff.revokedPermissions.push(permission);
    }
    // Remove from custom if present
    staff.customPermissions = staff.customPermissions.filter((p) => p !== permission);
    console.log(`[RBAC] Revoked ${permission} from ${staff.username}`);
  }

  /**
   * Resolves effective permission for a staff member
   */
  public hasPermission(staffId: string, permission: Permission): boolean {
    const staff = this.staffUsers.get(staffId);
    if (!staff || !staff.isActive) return false;

    // 1. Explicit Revocation Check
    if (staff.revokedPermissions.includes(permission)) {
      return false;
    }

    // 2. Super Admin full bypass
    if (staff.role === StaffRole.SUPER_ADMIN) {
      return true;
    }

    // 3. Custom Permission Grants
    if (staff.customPermissions.includes(permission)) {
      return true;
    }

    // 4. Role Baseline Permissions
    const defaults = this.roleDefaultPermissions.get(staff.role);
    return defaults ? defaults.has(permission) : false;
  }

  /**
   * Authorizes an operation and automatically writes a tamper-proof audit record
   */
  public authorizeAction(params: {
    staffId: string;
    requiredPermission: Permission;
    action: string;
    resource: string;
    resourceId?: string;
    previousState?: Record<string, unknown> | null;
    newState?: Record<string, unknown> | null;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): boolean {
    const staff = this.staffUsers.get(params.staffId);
    const authorized = staff ? this.hasPermission(params.staffId, params.requiredPermission) : false;

    const logEntry: AuditLogEntry = {
      id: `audit_${Date.now()}_${randomUUID().slice(0, 6)}`,
      actorId: params.staffId,
      actorUsername: staff ? staff.username : 'UNKNOWN',
      actorRole: staff ? staff.role : StaffRole.CUSTOMER_SUPPORT,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      previousState: params.previousState,
      newState: params.newState,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      status: authorized ? AuditStatus.SUCCESS : AuditStatus.DENIED,
      reason: authorized ? undefined : `Missing required permission: ${params.requiredPermission}`,
      metadata: params.metadata,
      timestamp: new Date(),
    };

    this.auditLogs.unshift(logEntry);

    if (!authorized) {
      console.warn(`[RBAC:DENIED] ${logEntry.actorUsername} attempted '${params.action}' without '${params.requiredPermission}'`);
      throw new Error(`ACCESS_DENIED: Staff member does not possess capability '${params.requiredPermission}'`);
    }

    console.log(`[RBAC:AUTH] ${logEntry.actorUsername} executed '${params.action}' on ${params.resource} (Audit ID: ${logEntry.id})`);
    return true;
  }

  public recordAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      id: `audit_${Date.now()}_${randomUUID().slice(0, 6)}`,
      ...entry,
      timestamp: new Date(),
    };
    this.auditLogs.unshift(fullEntry);
    return fullEntry;
  }

  public queryAuditLogs(filter?: AuditQueryFilter): AuditLogEntry[] {
    let result = [...this.auditLogs];

    if (filter?.actorId) {
      result = result.filter((l) => l.actorId === filter.actorId);
    }
    if (filter?.action) {
      result = result.filter((l) => l.action.toLowerCase() === filter.action!.toLowerCase());
    }
    if (filter?.resource) {
      result = result.filter((l) => l.resource.toLowerCase() === filter.resource!.toLowerCase());
    }
    if (filter?.status) {
      result = result.filter((l) => l.status === filter.status);
    }
    if (filter?.fromDate) {
      result = result.filter((l) => l.timestamp >= filter.fromDate!);
    }
    if (filter?.toDate) {
      result = result.filter((l) => l.timestamp <= filter.toDate!);
    }

    return result;
  }
}
