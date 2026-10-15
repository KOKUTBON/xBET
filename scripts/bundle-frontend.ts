/**
 * Frontend Bundler
 *
 * Compiles the modular TypeScript sources in `apps/web/src/` into the single
 * `apps/web/public/app.bundle.js` served by the SPA, and publishes the design
 * system stylesheet to `apps/web/public/main.css`.
 *
 * Type annotations are removed with Node's built-in `stripTypeScriptTypes`
 * (a real parser, not regex), then module syntax is flattened so every file
 * shares one IIFE scope in dependency order.
 *
 *   node scripts/bundle-frontend.ts
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { stripTypeScriptTypes } from 'module';

const webDir = join(import.meta.dirname, '..', 'apps', 'web');
const srcDir = join(webDir, 'src');
const outputFile = join(webDir, 'public', 'app.bundle.js');

const filesInOrder = [
  'ui/icons.ts',
  'state/app-state.ts',
  'state/ws-client.ts',
  'demo/demo-sports.ts',
  'demo/demo-casino.ts',
  'demo/demo-state.ts',
  'demo/demo-panels.ts',
  'components/game-frame.ts',
  'components/casino-lobby.ts',
  'components/live-match-list.ts',
  'components/match-details.ts',
  'components/betslip.ts',
  'components/pages/legal-modal.ts',
  'components/pages/trader-console.ts',
  'components/live-tracker-visualizer.ts',
  'components/modals/cashier-modal.ts',
  'components/modals/kpi-modal.ts',
  'components/modals/ticket-modal.ts',
  'components/modals/login-modal.ts',
  'components/modals/provably-fair-modal.ts',
  'app.ts',
];

function flattenModule(code: string): string {
  return code
    .replace(/^\s*import\s[\s\S]*?from\s*['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^(\s*)export\s+(?=(?:async\s+)?(?:class|function|const|let|var)\b)/gm, '$1');
}

let bundle = `/**
 * xBET Web Platform — compiled from apps/web/src (do not edit by hand).
 * Rebuild with: node scripts/bundle-frontend.ts
 */
(function () {
'use strict';
`;

let bundledCount = 0;
for (const file of filesInOrder) {
  const filePath = join(srcDir, file);
  if (!existsSync(filePath)) continue;
  const source = readFileSync(filePath, 'utf8');
  const js = stripTypeScriptTypes(source, { mode: 'strip' });
  bundle += `\n// ---- ${file} ----\n${flattenModule(js)}\n`;
  bundledCount++;
}

bundle += '\n})();\n';

writeFileSync(outputFile, bundle, 'utf8');
copyFileSync(join(srcDir, 'styles', 'main.css'), join(webDir, 'public', 'main.css'));

console.log(`Bundled ${bundledCount} modules -> ${outputFile}`);
console.log('Published src/styles/main.css -> public/main.css');
