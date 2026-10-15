/**
 * Batch Compiler for 14 CakePHP Locale .po Dictionaries
 * Compiles all .po files from app/Locale/ into JSON dictionaries.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { PoCompiler, type PoCatalog } from './po-compiler.ts';

export function compileAllLegacyLocales(appLocalePath?: string): Record<string, PoCatalog> {
  const candidates = [
    appLocalePath,
    path.resolve(process.cwd(), 'locales'),
    path.resolve(process.cwd(), '../../locales'),
    path.resolve(process.cwd(), 'app/Locale'),
    path.resolve(process.cwd(), '../../app/Locale'),
  ].filter(Boolean) as string[];

  const rootLocaleDir = candidates.find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), 'locales');
  return PoCompiler.compileLocaleDirectory(rootLocaleDir);
}
