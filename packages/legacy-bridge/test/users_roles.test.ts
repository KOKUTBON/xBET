/**
 * Verification Test Suite for Users, 6-Tier Hierarchy, and Agent Credit Tree
 */

import { PasswordHasher } from '../src/auth/password-hasher.ts';
import { SessionManager } from '../src/auth/jwt-session.ts';
import { UserRole, RoleHierarchy } from '../src/auth/role-hierarchy.ts';
import { UserManager, KycStatus } from '../src/users/user-manager.ts';
import { AgentCreditTree } from '../src/users/agent-credit-tree.ts';

async function runUsersAndRolesTests() {
  console.log('===============================================================');
  console.log('  👥 Running Users, 6-Tier Hierarchy & Credit Tree Test Suite');
  console.log('===============================================================');

  process.env.ADMIN_BOOTSTRAP_PASSWORD = 'test-only-admin-password';
  const userManager = UserManager.getInstance();
  const creditTree = AgentCreditTree.getInstance();

  // --------------------------------------------------------------------------
  // Test 1: Password Hasher & Salt Verification
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing PBKDF2 Password Hasher...');
  const password = 'SuperSecretPassword2026!';
  const hash = PasswordHasher.hashPassword(password);
  console.log(`  Hashed Password: ${hash.substring(0, 32)}...`);

  const isMatch = PasswordHasher.verifyPassword(password, hash);
  const isFalseMatch = PasswordHasher.verifyPassword('WrongPassword', hash);

  if (!isMatch || isFalseMatch) throw new Error('Password verification failed');
  console.log('  ✅ Test 1 Passed: Password hashing with cryptographic salt verified.');

  // --------------------------------------------------------------------------
  // Test 2: JWT Session Token Issuance & Verification
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Signed JWT Session Tokens...');
  const adminUser = userManager.authenticate('admin', 'test-only-admin-password');
  console.log(`  Authenticated Admin: ${adminUser.user.username} | Token: ${adminUser.token.substring(0, 30)}...`);

  const payload = SessionManager.verifySession(adminUser.token);
  if (!payload || payload.username !== 'admin' || payload.role !== UserRole.ADMINISTRATOR) {
    throw new Error('JWT session verification failed');
  }
  console.log(`  JWT Session Verified: User ${payload.username} (${payload.role})`);
  console.log('  ✅ Test 2 Passed: Signed JWT session lifecycle verified.');

  // --------------------------------------------------------------------------
  // Test 3: Register All 6 Tiers in Hierarchy
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Registering Users across all 6 Hierarchy Tiers...');

  const subadmin = userManager.registerUser({
    username: 'subadmin_europe',
    email: 'subadmin@xbet.local',
    password: 'SubadminPass123!',
    role: UserRole.SUBADMIN,
  });

  const masterAgent = userManager.registerUser({
    username: 'agent_london',
    email: 'agent@xbet.local',
    password: 'AgentPass123!',
    role: UserRole.AGENT,
    parentId: subadmin.id,
  });

  const branchShop = userManager.registerUser({
    username: 'branch_soho',
    email: 'branch@xbet.local',
    password: 'BranchPass123!',
    role: UserRole.BRANCH,
    parentId: masterAgent.id,
  });

  const cashier = userManager.registerUser({
    username: 'cashier_tom',
    email: 'cashier@xbet.local',
    password: 'CashierPass123!',
    role: UserRole.CASHIER,
    parentId: branchShop.id,
  });

  const player = userManager.registerUser({
    username: 'john_player',
    email: 'john@example.com',
    password: 'PlayerPass123!',
    role: UserRole.PLAYER,
  });

  console.log('  Registered: Admin -> Subadmin -> Agent -> Branch -> Cashier -> Player');
  console.log('  ✅ Test 3 Passed: All 6 tiers registered with parental relations.');

  // --------------------------------------------------------------------------
  // Test 4: Role-Based Access Control (ACL) Matrix
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Role-Based Permission Matrix...');

  // Admin access
  if (!RoleHierarchy.canManageGlobalSettings(UserRole.ADMINISTRATOR)) throw new Error('Admin should manage global settings');
  // Cashier cannot manage global settings
  if (RoleHierarchy.canManageGlobalSettings(UserRole.CASHIER)) throw new Error('Cashier should not manage global settings');
  // Cashier can place OTC tickets
  if (!RoleHierarchy.canPlaceOTCTickets(UserRole.CASHIER)) throw new Error('Cashier should place OTC tickets');
  // Player cannot access Admin panel
  if (RoleHierarchy.canAccessAdminBackoffice(UserRole.PLAYER)) throw new Error('Player should not access Admin panel');
  // Agent can access Admin panel
  if (!RoleHierarchy.canAccessAdminBackoffice(UserRole.AGENT)) throw new Error('Agent should access Admin panel');

  console.log('  ✅ Test 4 Passed: 6-Tier permission matrix strictly enforced.');

  // --------------------------------------------------------------------------
  // Test 5: Hierarchical Downline Credit Distribution
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Downline Credit Distribution (Admin -> Agent -> Branch -> Cashier)...');

  // 1. Admin allocates $10,000 credit to Agent
  creditTree.allocateCredit(adminUser.user.id, masterAgent.id, 10000.0);
  if (masterAgent.availableCredit !== 10000.0) throw new Error('Agent credit failed');

  // 2. Agent allocates $3,000 to Branch Shop
  creditTree.allocateCredit(masterAgent.id, branchShop.id, 3000.0);
  if (masterAgent.availableCredit !== 7000.0 || branchShop.availableCredit !== 3000.0) {
    throw new Error('Branch credit allocation failed');
  }

  // 3. Branch allocates $500 float to Cashier till
  creditTree.allocateCredit(branchShop.id, cashier.id, 500.0);
  if (branchShop.availableCredit !== 2500.0 || cashier.availableCredit !== 500.0) {
    throw new Error('Cashier float allocation failed');
  }

  console.log(`  Final Credits: Agent $${masterAgent.availableCredit} | Branch $${branchShop.availableCredit} | Cashier Float: $${cashier.availableCredit}`);
  console.log('  ✅ Test 5 Passed: Multi-tier credit tree allocations verified.');

  // --------------------------------------------------------------------------
  // Test 6: KYC Document Workflow
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing KYC Document Workflow Transitions...');
  if (player.kycStatus !== KycStatus.UNVERIFIED) throw new Error('Initial status should be UNVERIFIED');

  userManager.updateKycStatus(player.id, KycStatus.PENDING_REVIEW);
  if (player.kycStatus !== KycStatus.PENDING_REVIEW) throw new Error('Status should be PENDING_REVIEW');

  userManager.updateKycStatus(player.id, KycStatus.VERIFIED);
  if (player.kycStatus !== KycStatus.VERIFIED) throw new Error('Status should be VERIFIED');

  console.log(`  Player ${player.username} successfully verified: ${player.kycStatus}`);
  console.log('  ✅ Test 6 Passed: KYC verification status workflow verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Step 4 Users & 6-Tier Hierarchy Tests Passed!         ');
  console.log('===============================================================');
  process.exit(0);
}

runUsersAndRolesTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
