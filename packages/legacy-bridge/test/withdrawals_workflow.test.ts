import { AuthTokenManager, UserRole } from '../../core-types/src/auth.ts';
const staffToken=AuthTokenManager.createSession({id:'test-staff',username:'test-staff',role:UserRole.ADMINISTRATOR});
/**
 * Test Suite for Withdrawal Lifecycle, KYC Enforcement, and Admin Approval Queue
 */

import { UserManager, KycStatus } from '../src/users/user-manager.ts';
import { WithdrawManager } from '../src/payments/withdraw-manager.ts';
import { PaymentMethod } from '../src/payments/payment-gateway.ts';
import { LegacyBridgeHttpServer } from '../src/server.ts';
import { EventEmitter } from 'events';
import { IncomingMessage, ServerResponse } from 'http';

class MockRequest extends EventEmitter {
  public method: string;
  public url: string;
  public headers: Record<string, string>;

  constructor(method: string, url: string, headers: Record<string, string> = {}, body?: any) {
    super();
    this.method = method;
    this.url = url;
    this.headers = {authorization:`Bearer ${staffToken}`,...headers};

    if (body) {
      setImmediate(() => {
        this.emit('data', JSON.stringify(body));
        this.emit('end');
      });
    } else {
      setImmediate(() => {
        this.emit('end');
      });
    }
  }
}

class MockResponse extends EventEmitter {
  public statusCode: number = 200;
  public headers: Record<string, string> = {};
  public body: string = '';

  public setHeader(key: string, value: string): void {
    this.headers[key.toLowerCase()] = value;
  }

  public writeHead(status: number, headers?: Record<string, string>): void {
    this.statusCode = status;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this.setHeader(k, v);
      }
    }
  }

  public end(data?: string): void {
    if (data) this.body = data;
    this.emit('finish');
  }
}

async function runWithdrawalTests() {
  console.log('===============================================================');
  console.log('  💸 Running Player Withdrawal & Admin Approval Workflow Suite');
  console.log('===============================================================');

  const userManager = UserManager.getInstance();
  const withdrawManager = WithdrawManager.getInstance();
  const server = new LegacyBridgeHttpServer();

  const executeRequest = (method: string, path: string, body?: any): Promise<{ status: number; body: any }> => {
    return new Promise((resolve) => {
      const req = new MockRequest(method, path, { 'content-type': 'application/json' }, body) as unknown as IncomingMessage;
      const res = new MockResponse() as unknown as ServerResponse;

      (res as any).on('finish', () => {
        let parsedBody = (res as any).body;
        try {
          parsedBody = JSON.parse(parsedBody);
        } catch {}
        resolve({ status: (res as any).statusCode, body: parsedBody });
      });

      server.handleRequest(req, res);
    });
  };

  // Register a test player
  const punter = userManager.registerUser({
    username: 'rich_punter',
    email: 'rich@xbet.local',
    password: 'Password123!',
  });

  // --------------------------------------------------------------------------
  // Test 1: Withdrawal Rejected when KYC is Unverified
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing KYC Verification Gate on Withdrawal Request...');
  try {
    withdrawManager.requestWithdrawal({
      userId: punter.id,
      method: PaymentMethod.BANK_TRANSFER,
      amount: 250.0,
      payoutDetails: 'IBAN: GB99BARC20202012345678',
    });
    throw new Error('Unverified user should not be able to request withdrawal');
  } catch (err: any) {
    if (!err.message.includes('KYC_REQUIRED')) throw err;
    console.log(`  Expected KYC Block: ${err.message}`);
  }
  console.log('  ✅ Test 1 Passed: Unverified KYC correctly blocked withdrawal.');

  // --------------------------------------------------------------------------
  // Test 2: Successful Withdrawal Submission after KYC Verification
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Withdrawal Submission after KYC Verification...');
  userManager.updateKycStatus(punter.id, KycStatus.VERIFIED);

  const withdrawRes = await executeRequest('POST', '/api/v1/payments/withdraw', {
    userId: punter.id,
    method: PaymentMethod.BANK_TRANSFER,
    amount: 300.0,
    payoutDetails: 'IBAN: GB99BARC20202012345678',
    currencyCode: 'USD',
  });

  console.log(`  Withdrawal Creation Status: ${withdrawRes.status}`);
  if (withdrawRes.status !== 201) throw new Error(`Expected 201 Created, got ${withdrawRes.status}`);
  const withdrawId = withdrawRes.body.withdrawal.id;
  console.log(`  Created Withdrawal Ref: ${withdrawRes.body.withdrawal.transactionRef} (Status: ${withdrawRes.body.withdrawal.status})`);
  console.log('  ✅ Test 2 Passed: Verified player created pending withdrawal request.');

  // --------------------------------------------------------------------------
  // Test 3: Admin Review Queue & Approval Workflow
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Admin Pending Queue & Approval Action...');
  const pendingRes = await executeRequest('GET', '/api/v1/admin/withdrawals/pending');
  console.log(`  Pending Withdrawals Count: ${pendingRes.body.count}`);
  if (pendingRes.body.count < 1) throw new Error('Pending queue should contain at least 1 record');

  const approveRes = await executeRequest('POST', `/api/v1/admin/withdrawals/${withdrawId}/approve`, {
    adminUserId: 'admin-auditor-1',
  });
  console.log(`  Approval Action Status: ${approveRes.status} | Final Status: ${approveRes.body.withdrawal.status}`);
  if (approveRes.body.withdrawal.status !== 'APPROVED') throw new Error('Status should be APPROVED');
  console.log('  ✅ Test 3 Passed: Admin successfully approved withdrawal from pending queue.');

  // --------------------------------------------------------------------------
  // Test 4: User Withdrawal History
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing User Withdrawal History Endpoint...');
  const userHistoryRes = await executeRequest('GET', `/api/v1/payments/withdraw/user/${punter.id}`);
  console.log(`  User Withdrawal Records: ${userHistoryRes.body.count}`);
  if (userHistoryRes.body.count !== 1) throw new Error('Expected exactly 1 withdrawal in history');
  console.log('  ✅ Test 4 Passed: User withdrawal history retrieved.');

  console.log('\n===============================================================');
  console.log('  🎉 All Withdrawal Lifecycle & Admin Workflow Tests Passed!   ');
  console.log('===============================================================');
}

runWithdrawalTests().catch((err) => {
  console.error('❌ Withdrawal test failed:', err);
  process.exit(1);
});
