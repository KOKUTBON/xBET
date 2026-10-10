import assert from 'node:assert';
import { OpenApiSpecBuilder } from '../src/index.ts';

console.log('===============================================================');
console.log('  📑 Running OpenAPI 3.1 & Interactive Swagger UI Tests       ');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: OpenAPI 3.1 Specification Structure
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing OpenAPI 3.1.0 Document Schema Generation...');
const spec = OpenApiSpecBuilder.generateSpec();

assert.strictEqual(spec.openapi, '3.1.0');
assert.strictEqual(spec.info.title, 'XBET Platform Enterprise API');
assert.strictEqual(spec.info.version, '2.0.0');

// Verify security schemes
assert.ok(spec.components?.securitySchemes?.BearerAuth);
assert.ok(spec.components?.securitySchemes?.ApiKeyAuth);

// Verify core paths
const pathKeys = Object.keys(spec.paths);
console.log(`  Generated ${pathKeys.length} API paths across tags: ${spec.tags.map((t: any) => t.name).join(', ')}`);

assert.ok(spec.paths['/api/v1/auth/login']);
assert.ok(spec.paths['/api/v1/sports/fixtures']);
assert.ok(spec.paths['/api/v1/tickets/place']);
assert.ok(spec.paths['/api/v1/tickets/{id}/cashout']);
assert.ok(spec.paths['/api/v1/casino/games']);
assert.ok(spec.paths['/api/v1/casino/roulette/spin']);
assert.ok(spec.paths['/api/v1/wallet/balance']);
assert.ok(spec.paths['/api/v1/compliance/reality-check']);

console.log('  ✅ Test 1 Passed: OpenAPI 3.1 document structure & security definitions verified.');

// ----------------------------------------------------------------------------
// Test 2: Swagger UI Standalone HTML Renderer
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing Swagger UI HTML Dashboard Generation...');
const html = OpenApiSpecBuilder.generateSwaggerHtml('/api/docs/openapi.json', 'XBET Enterprise Docs');

assert.ok(html.includes('<!DOCTYPE html>'));
assert.ok(html.includes('SwaggerUIBundle'));
assert.ok(html.includes('/api/docs/openapi.json'));
assert.ok(html.includes('XBET Enterprise Docs'));
assert.ok(html.includes('#00805c')); // xBET brand dark theme green

console.log(`  Rendered Swagger UI HTML bundle (${html.length} chars) with CDN scripts & dark theme.`);
console.log('  ✅ Test 2 Passed: Interactive Swagger UI renderer verified.');

console.log('\n===============================================================');
console.log('  🎉 All OpenAPI 3.1 & Swagger UI Tests Passed!                ');
console.log('===============================================================');
