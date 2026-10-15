import { AuthTokenManager, UserRole } from '../../core-types/src/auth.ts';
const staffToken=AuthTokenManager.createSession({id:'test-staff',username:'test-staff',role:UserRole.ADMINISTRATOR});
import { LegacyBridgeHttpServer } from '../src/server.ts';
import { IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';

// Lightweight mock request/response helper
function mockHttp(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = path;
  req.headers = { host: 'localhost:4003', authorization:`Bearer ${staffToken}`, ...headers };

  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(status: number, headers: Record<string, string>) {
      this.statusCode = status;
      this.headers = {authorization:`Bearer ${staffToken}`,...headers};
    },
    end(chunk: string) {
      if (chunk) this.body = chunk;
    },
  } as any;

  return { req, res };
}

async function runTest() {
  console.log('===============================================================');
  console.log('  🏛️ Running Legacy Bridge HTTP REST API Test Suite            ');
  console.log('===============================================================');

  const server = new LegacyBridgeHttpServer();

  // Test 1: Health Check
  console.log('\n[Test 1] Testing Health Check Endpoint (/api/v1/health)...');
  {
    const { req, res } = mockHttp('GET', '/api/v1/health');
    await server.handleRequest(req, res);
    const data = JSON.parse(res.body);
    console.log('  Health response:', data);
    if (res.statusCode !== 200 || data.status !== 'HEALTHY') {
      throw new Error(`Health check failed: status ${res.statusCode}`);
    }
    console.log('  ✅ Test 1 Passed: Health check endpoint returned 200 HEALTHY.');
  }

  // Test 2: Auth Registration & Me
  console.log('\n[Test 2] Testing User Registration & Session Token (/api/v1/auth/*)...');
  let token = '';
  {
    const { req, res } = mockHttp('POST', '/api/v1/auth/register');
    const p = server.handleRequest(req, res);
    req.emit('data', JSON.stringify({
      username: 'test_punter_2026',
      email: 'punter2026@xbet.local',
      password: 'SecurePassword123!',
      currencyCode: 'EUR'
    }));
    req.emit('end');
    await p;

    const data = JSON.parse(res.body);
    console.log('  Registered user:', data.user.username, '| Role:', data.user.role);
    token = data.token;
    if (res.statusCode !== 201 || !token) {
      throw new Error('Registration failed');
    }
    console.log('  ✅ Test 2 Passed: User registered and JWT token generated.');
  }

  // Test 3: Auth Me (JWT Session Verification)
  console.log('\n[Test 3] Testing /api/v1/auth/me with Bearer Token...');
  {
    const { req, res } = mockHttp('GET', '/api/v1/auth/me', null, {
      authorization: `Bearer ${token}`
    });
    await server.handleRequest(req, res);
    const data = JSON.parse(res.body);
    console.log('  Session payload username:', data.session.username, '| Currency:', data.session.currencyCode);
    if (res.statusCode !== 200 || data.session.username !== 'test_punter_2026') {
      throw new Error('Auth me verification failed');
    }
    console.log('  ✅ Test 3 Passed: Authenticated session validated.');
  }

  // Test 4: Admin Backoffice Snapshot & Reports
  console.log('\n[Test 4] Testing Admin Backoffice KPI Snapshot (/api/v1/admin/dashboard)...');
  {
    const { req, res } = mockHttp('GET', '/api/v1/admin/dashboard');
    await server.handleRequest(req, res);
    const data = JSON.parse(res.body);
    console.log('  Admin metrics total turnover:', data.metrics.totalTurnover, '| Users:', data.metrics.totalUsersCount);
    if (res.statusCode !== 200 || !data.metrics) {
      throw new Error('Dashboard metrics failed');
    }
    console.log('  ✅ Test 4 Passed: Admin backoffice snapshot operational.');
  }

  // Test 5: Retail Reservation Ticket
  console.log('\n[Test 5] Testing Retail Reservation Booking (/api/v1/tickets/reservation)...');
  {
    const { req, res } = mockHttp('POST', '/api/v1/tickets/reservation');
    const p = server.handleRequest(req, res);
    req.emit('data', JSON.stringify({
      stake: 50,
      currencyCode: 'USD',
      legs: [{
        fixtureId: 'fix-1',
        fixtureName: 'Arsenal vs Chelsea',
        marketId: 'mkt-1',
        marketName: '1X2',
        selectionId: 'sel-1',
        selectionName: 'Arsenal',
        reservedOdds: 2.1,
        kickoffTime: new Date().toISOString()
      }]
    }));
    req.emit('end');
    await p;

    const data = JSON.parse(res.body);
    console.log('  Booking code:', data.reservation.bookingCode, '| Barcode:', data.reservation.barcode);
    if (res.statusCode !== 201 || !data.reservation.barcode) {
      throw new Error('Reservation creation failed');
    }
    console.log('  ✅ Test 5 Passed: Reservation ticket booking created.');
  }

  // Test 6: Legacy CakePHP 1:1 URL Dispatcher
  console.log('\n[Test 6] Testing Legacy URL Rewriting (/legacy/sports/getSportsMenu2)...');
  {
    const { req, res } = mockHttp('GET', '/legacy/sports/getSportsMenu2');
    await server.handleRequest(req, res);
    const data = JSON.parse(res.body);
    console.log('  Legacy sports menu count:', data.sports.length);
    if (res.statusCode !== 200 || !Array.isArray(data.sports)) {
      throw new Error('Legacy route dispatch failed');
    }
    console.log('  ✅ Test 6 Passed: Legacy CakePHP route dispatched with translated menu.');
  }

  console.log('\n===============================================================');
  console.log('  🎉 All Legacy Bridge HTTP API Server Tests Passed!          ');
  console.log('===============================================================');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
