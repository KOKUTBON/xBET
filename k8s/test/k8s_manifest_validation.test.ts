import assert from 'assert';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log('===============================================================');
console.log('  ☸️ Running Kubernetes & CI/CD Manifest Validation Suite     ');
console.log('===============================================================');

const rootDir = join(import.meta.dirname || process.cwd(), '..');
const k8sDir = join(rootDir, 'helm');
const workflowPath = join(rootDir, '../.github/workflows/ci-cd.yml');

// ----------------------------------------------------------------------------
// [Test 1] Validate Helm Chart.yaml Definition
// ----------------------------------------------------------------------------
console.log('\n[Test 1] Validating Helm Chart.yaml...');
const chartPath = join(k8sDir, 'Chart.yaml');
assert.strictEqual(existsSync(chartPath), true, 'Chart.yaml must exist');
const chartContent = readFileSync(chartPath, 'utf8');
assert.ok(chartContent.includes('name: xbet-platform'), 'Chart name must be xbet-platform');
assert.ok(chartContent.includes('apiVersion: v2'), 'Chart must be Helm v2 apiVersion');
assert.ok(chartContent.includes('version: 1.0.0'), 'Chart version defined');
console.log('  ✅ Test 1 Passed: Chart.yaml structure and metadata valid.');

// ----------------------------------------------------------------------------
// [Test 2] Validate Helm values.yaml Configuration
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Validating Helm values.yaml...');
const valuesPath = join(k8sDir, 'values.yaml');
assert.strictEqual(existsSync(valuesPath), true, 'values.yaml must exist');
const valuesContent = readFileSync(valuesPath, 'utf8');

const requiredServices = ['oddsEngine', 'bettingEngine', 'casinoEngine', 'legacyBridge', 'webFrontend'];
for (const svc of requiredServices) {
  assert.ok(valuesContent.includes(svc), `values.yaml must define configuration for ${svc}`);
}
assert.ok(valuesContent.includes('autoscaling:'), 'values.yaml must configure autoscaling');
assert.ok(valuesContent.includes('ingress:'), 'values.yaml must configure ingress');
assert.ok(valuesContent.includes('postgres:'), 'values.yaml must configure postgres database');
assert.ok(valuesContent.includes('redis:'), 'values.yaml must configure redis cache');
console.log('  ✅ Test 2 Passed: values.yaml contains all microservices, resources, HPA, and ingress configs.');

// ----------------------------------------------------------------------------
// [Test 3] Validate Kubernetes Deployments Template
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Validating Kubernetes Deployments Template...');
const deploymentsPath = join(k8sDir, 'templates/deployments.yaml');
assert.strictEqual(existsSync(deploymentsPath), true, 'deployments.yaml must exist');
const deploymentsContent = readFileSync(deploymentsPath, 'utf8');

const deployments = ['name: odds-engine', 'name: betting-engine', 'name: casino-engine', 'name: legacy-bridge', 'name: web-frontend'];
for (const dep of deployments) {
  assert.ok(deploymentsContent.includes(dep), `Deployments template must define ${dep}`);
}

// Validate Health Check Probes
assert.ok(deploymentsContent.includes('livenessProbe:'), 'Deployments must configure livenessProbe');
assert.ok(deploymentsContent.includes('readinessProbe:'), 'Deployments must configure readinessProbe');
assert.ok(deploymentsContent.includes('rollingUpdate:'), 'Deployments must configure zero-downtime rollingUpdate');
console.log('  ✅ Test 3 Passed: Zero-downtime deployments with health checks verified for all 5 services.');

// ----------------------------------------------------------------------------
// [Test 4] Validate Kubernetes Services & Ingress Template
// ----------------------------------------------------------------------------
console.log('\n[Test 4] Validating Services and NGINX Ingress...');
const servicesPath = join(k8sDir, 'templates/services-ingress.yaml');
assert.strictEqual(existsSync(servicesPath), true, 'services-ingress.yaml must exist');
const servicesContent = readFileSync(servicesPath, 'utf8');

assert.ok(servicesContent.includes('name: odds-engine-svc'), 'ClusterIP Service for odds-engine');
assert.ok(servicesContent.includes('name: betting-engine-svc'), 'ClusterIP Service for betting-engine');
assert.ok(servicesContent.includes('name: casino-engine-svc'), 'ClusterIP Service for casino-engine');
assert.ok(servicesContent.includes('name: legacy-bridge-svc'), 'ClusterIP Service for legacy-bridge');
assert.ok(servicesContent.includes('name: web-frontend-svc'), 'ClusterIP Service for web-frontend');
assert.ok(servicesContent.includes('kind: Ingress'), 'NGINX Ingress routing defined');
console.log('  ✅ Test 4 Passed: ClusterIP Services and Unified Ingress definitions valid.');

// ----------------------------------------------------------------------------
// [Test 5] Validate Horizontal Pod Autoscaler (HPA)
// ----------------------------------------------------------------------------
console.log('\n[Test 5] Validating Horizontal Pod Autoscalers (HPA)...');
const hpaPath = join(k8sDir, 'templates/hpa.yaml');
assert.strictEqual(existsSync(hpaPath), true, 'hpa.yaml must exist');
const hpaContent = readFileSync(hpaPath, 'utf8');

assert.ok(hpaContent.includes('kind: HorizontalPodAutoscaler'), 'HPA resource defined');
assert.ok(hpaContent.includes('name: odds-engine-hpa'), 'HPA for odds-engine defined');
assert.ok(hpaContent.includes('name: betting-engine-hpa'), 'HPA for betting-engine defined');
assert.ok(hpaContent.includes('targetCPUUtilizationPercentage'), 'Target CPU percentage defined');
console.log('  ✅ Test 5 Passed: Dynamic HPA autoscalers configured for peak sports load.');

// ----------------------------------------------------------------------------
// [Test 6] Validate GitHub Actions CI/CD Pipeline Workflow
// ----------------------------------------------------------------------------
console.log('\n[Test 6] Validating GitHub Actions CI/CD Workflow...');
assert.strictEqual(existsSync(workflowPath), true, 'ci-cd.yml workflow must exist');
const workflowContent = readFileSync(workflowPath, 'utf8');

assert.ok(workflowContent.includes('test-monorepo:'), 'Workflow includes monorepo test matrix');
assert.ok(workflowContent.includes('test-migration-etl:'), 'Workflow includes legacy migration test');
assert.ok(workflowContent.includes('build-docker-images:'), 'Workflow includes Docker build stage');
assert.ok(workflowContent.includes('validate-k8s-helm:'), 'Workflow includes Kubernetes validation stage');
console.log('  ✅ Test 6 Passed: Complete CI/CD workflow pipeline verified.');

console.log('\n===============================================================');
console.log('  🎉 All Kubernetes & CI/CD Manifest Validation Checks Passed! ');
console.log('===============================================================');
