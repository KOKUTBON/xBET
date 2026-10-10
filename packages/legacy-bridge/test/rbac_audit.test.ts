/**
 * Staff RBAC Permissions & Tamper-Proof Audit Trail Test Suite
 * Tests role capability matrices, custom grants/revocations, action authorization guards,
 * state diff recording, and regulatory audit log query filters.
 */

import { RbacAuditManager } from '../src/security/rbac-audit-manager.ts';
import { Permission, StaffRole, AuditStatus } from '../src/security/rbac-types.ts';

async function runRbacAuditTests() {
  console.log('===============================================================');
  console.log('  🔐 Running Staff RBAC & Regulatory Audit Trail Test Suite    ');
  console.log('===============================================================');

  const rbac = RbacAuditManager.getInstance();

  // --------------------------------------------------------------------------
  // Setup Test Staff Accounts
  // --------------------------------------------------------------------------
  const superAdmin = rbac.getStaffUser('staff_super_admin') || rbac.registerStaffUser({
    id: 'staff_super_admin',
    username: 'chief_admin',
    email: 'admin@xbet.internal',
    role: StaffRole.SUPER_ADMIN,
  });

  const trader = rbac.registerStaffUser({
    id: 'staff_trader_01',
    username: 'marcus_trader',
    email: 'marcus@xbet.internal',
    role: StaffRole.SPORTSBOOK_TRADER,
  });

  const finance = rbac.registerStaffUser({
    id: 'staff_finance_01',
    username: 'elena_finance',
    email: 'elena@xbet.internal',
    role: StaffRole.PAYMENTS_FINANCE_OFFICER,
  });

  const support = rbac.registerStaffUser({
    id: 'staff_support_01',
    username: 'dave_support',
    email: 'dave@xbet.internal',
    role: StaffRole.CUSTOMER_SUPPORT,
  });

  // --------------------------------------------------------------------------
  // Test 1: Default Role Permission Capabilities
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Default Role Permission Capabilities...');

  // SuperAdmin has everything
  if (!rbac.hasPermission(superAdmin.id, Permission.SETTINGS_MANAGE) || !rbac.hasPermission(superAdmin.id, Permission.WITHDRAWAL_APPROVE)) {
    throw new Error('SuperAdmin missing root permissions');
  }

  // Trader has trading permissions but not finance
  if (!rbac.hasPermission(trader.id, Permission.ODDS_OVERRIDE_MARGIN) || !rbac.hasPermission(trader.id, Permission.TICKET_MANUAL_SETTLE)) {
    throw new Error('Trader missing core trading permissions');
  }
  if (rbac.hasPermission(trader.id, Permission.WITHDRAWAL_APPROVE)) {
    throw new Error('Trader should NOT have WITHDRAWAL_APPROVE capability');
  }

  // Finance has payments but not odds
  if (!rbac.hasPermission(finance.id, Permission.WITHDRAWAL_APPROVE) || !rbac.hasPermission(finance.id, Permission.REPORTS_VIEW_FINANCIALS)) {
    throw new Error('Finance missing payment approval permissions');
  }
  if (rbac.hasPermission(finance.id, Permission.ODDS_OVERRIDE_MARGIN)) {
    throw new Error('Finance should NOT have ODDS_OVERRIDE_MARGIN capability');
  }

  // Support has read-only
  if (!rbac.hasPermission(support.id, Permission.USERS_VIEW) || rbac.hasPermission(support.id, Permission.TICKET_MANUAL_SETTLE)) {
    throw new Error('Support permission matrix incorrect');
  }

  console.log('  ✅ Test 1 Passed: Role baseline permission matrices strictly isolated.');

  // --------------------------------------------------------------------------
  // Test 2: Custom Capability Grants and Revocations
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Granular Permission Grants & Revocations...');

  // Grant Trader capability to export reports
  rbac.grantCustomPermission(trader.id, Permission.REPORTS_EXPORT_DATA);
  if (!rbac.hasPermission(trader.id, Permission.REPORTS_EXPORT_DATA)) {
    throw new Error('Custom permission grant failed');
  }

  // Revoke Finance officer manual deposit credit capability
  rbac.revokePermission(finance.id, Permission.DEPOSIT_MANUAL_CREDIT);
  if (rbac.hasPermission(finance.id, Permission.DEPOSIT_MANUAL_CREDIT)) {
    throw new Error('Explicit permission revocation failed');
  }

  console.log('  ✅ Test 2 Passed: Custom capability overrides applied successfully.');

  // --------------------------------------------------------------------------
  // Test 3: Action Authorization Guard & Audit Recording (SUCCESS)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Authorizing Legitimate Operation (Finance Withdrawal Approval)...');

  const authSuccess = rbac.authorizeAction({
    staffId: finance.id,
    requiredPermission: Permission.WITHDRAWAL_APPROVE,
    action: 'WITHDRAWAL_APPROVE',
    resource: 'WithdrawalRequest',
    resourceId: 'WTH-9988-77',
    previousState: { status: 'PENDING_REVIEW', amount: 1500.0, userId: 'usr-101' },
    newState: { status: 'APPROVED', amount: 1500.0, approvedBy: finance.username },
    ipAddress: '10.0.5.12',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  });

  if (!authSuccess) throw new Error('Legitimate action was not authorized');
  console.log('  ✅ Test 3 Passed: Legitimate action authorized with audit trail.');

  // --------------------------------------------------------------------------
  // Test 4: Action Authorization Guard (DENIED & Logged)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Access Denied Guard (Support attempting Manual Settle)...');
  let threwAccessDenied = false;

  try {
    rbac.authorizeAction({
      staffId: support.id,
      requiredPermission: Permission.TICKET_MANUAL_SETTLE,
      action: 'TICKET_MANUAL_SETTLE',
      resource: 'Ticket',
      resourceId: 'SLIP-4455-66',
      ipAddress: '10.0.8.44',
    });
  } catch (err: any) {
    if (err.message.includes('ACCESS_DENIED')) {
      threwAccessDenied = true;
    }
  }

  if (!threwAccessDenied) throw new Error('Unauthorized action was not blocked');
  console.log('  ✅ Test 4 Passed: Unauthorized action blocked and flagged as DENIED in audit trail.');

  // --------------------------------------------------------------------------
  // Test 5: Regulatory Audit Log Query & Forensic State Inspection
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Querying Regulatory Audit Logs...');
  const allLogs = rbac.queryAuditLogs();
  console.log(`  Total Recorded Audit Entries: ${allLogs.length}`);

  const deniedLogs = rbac.queryAuditLogs({ status: AuditStatus.DENIED });
  console.log(`  Denied Attempts Count: ${deniedLogs.length} (Actor: ${deniedLogs[0]?.actorUsername}, Action: ${deniedLogs[0]?.action})`);

  const financeLogs = rbac.queryAuditLogs({ actorId: finance.id });
  console.log(`  Finance Logs Count: ${financeLogs.length} (Action: ${financeLogs[0]?.action}, Resource: ${financeLogs[0]?.resource})`);

  if (deniedLogs.length === 0 || financeLogs.length === 0) {
    throw new Error('Audit log queries returned incorrect result counts');
  }

  const withdrawalLog = financeLogs[0];
  console.log(`  Forensic Diff: ${JSON.stringify(withdrawalLog.previousState)} -> ${JSON.stringify(withdrawalLog.newState)}`);
  if (withdrawalLog.previousState?.status !== 'PENDING_REVIEW' || withdrawalLog.newState?.status !== 'APPROVED') {
    throw new Error('Audit log state diff mismatch');
  }

  console.log('  ✅ Test 5 Passed: Regulatory audit queries and state-diff tracking verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Staff RBAC & Regulatory Audit Tests Passed!           ');
  console.log('===============================================================');
  process.exit(0);
}

runRbacAuditTests().catch((err) => {
  console.error('❌ Staff RBAC & Audit Tests failed:', err);
  process.exit(1);
});
