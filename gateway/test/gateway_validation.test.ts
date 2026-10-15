/**
 * Test Suite for NGINX API Gateway Configuration & Route Mapping Validation
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

async function runGatewayValidationTests() {
  console.log('===============================================================');
  console.log('  🌐 Running API Gateway & Reverse Proxy Validation Suite');
  console.log('===============================================================');

  const configPath = existsSync(resolve(process.cwd(), 'gateway/nginx.conf'))
    ? resolve(process.cwd(), 'gateway/nginx.conf')
    : existsSync(resolve(process.cwd(), 'nginx.conf'))
    ? resolve(process.cwd(), 'nginx.conf')
    : resolve(import.meta.dirname || '.', '../nginx.conf');
  console.log(`[Test 1] Checking NGINX configuration file existence...`);
  if (!existsSync(configPath)) {
    throw new Error(`NGINX config not found at: ${configPath}`);
  }
  const config = readFileSync(configPath, 'utf-8');
  console.log(`  Config file loaded (${config.length} bytes).`);
  console.log('  ✅ Test 1 Passed: nginx.conf found.');

  // --------------------------------------------------------------------------
  // Test 2: Upstream Definitions
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Validating Upstream Cluster Definitions...');
  const expectedUpstreams = [
    'upstream odds_engine',
    'upstream betting_engine',
    'upstream casino_engine',
    'upstream legacy_bridge',
    'upstream web_frontend',
  ];

  for (const upstream of expectedUpstreams) {
    if (!config.includes(upstream)) {
      throw new Error(`Missing required upstream: ${upstream}`);
    }
  }
  console.log('  ✅ Test 2 Passed: All 5 microservice upstreams defined.');

  // --------------------------------------------------------------------------
  // Test 3: WebSocket Upgrade Header Validation
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Validating WebSocket Protocol Upgrade Configuration...');
  if (!config.includes('location /ws') || !config.includes('proxy_set_header Upgrade $http_upgrade')) {
    throw new Error('WebSocket location /ws missing Upgrade header');
  }
  console.log('  ✅ Test 3 Passed: WebSocket streaming proxy configured for real-time odds.');

  // --------------------------------------------------------------------------
  // Test 4: Path Mapping Coverage
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Validating REST API Path Mappings...');
  const expectedLocations = [
    'location /api/v1/odds/',
    'location /api/v1/bets/',
    'location /api/v1/wallet/',
    'location /api/v1/settlement/',
    'location /api/v1/casino/',
    'location /api/v1/virtual-sports/',
    'location /api/v1/users/',
    'location /api/v1/payments/',
    'location /api/v1/admin/',
    'location /api/v1/notifications/',
    'location /api/v1/cms/',
    'location /api/v1/support/',
    'location / {',
  ];

  for (const loc of expectedLocations) {
    if (!config.includes(loc)) {
      throw new Error(`Missing route location: ${loc}`);
    }
  }
  console.log('  ✅ Test 4 Passed: 100% path coverage for all microservice APIs and PWA.');

  console.log('\n===============================================================');
  console.log('  🎉 All API Gateway Validation Checks Passed!                 ');
  console.log('===============================================================');
}

runGatewayValidationTests().catch((err) => {
  console.error('❌ Gateway validation failed:', err);
  process.exit(1);
});
