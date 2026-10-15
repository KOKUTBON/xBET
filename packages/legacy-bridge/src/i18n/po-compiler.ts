/**
 * High-Performance Gettext .po File Parser and Compiler
 * Extracts msgid, msgstr, plural forms, and metadata from GNU Gettext .po files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PoEntry {
  msgid: string;
  msgstr: string[];
  msgctxt?: string;
  comments?: string[];
}

export interface PoCatalog {
  language: string;
  pluralFormsHeader?: string;
  headers: Record<string, string>;
  translations: Record<string, string | string[]>;
}

export class PoCompiler {
  /**
   * Parses raw .po content string into a structured PoCatalog
   */
  public static parse(content: string, defaultLang: string = 'en'): PoCatalog {
    const lines = content.split(/\r?\n/);
    const headers: Record<string, string> = {};
    const translations: Record<string, string | string[]> = {};

    let currentMsgCtxt: string | null = null;
    let currentMsgId: string | null = null;
    let currentMsgIdPlural: string | null = null;
    let currentMsgStr: string[] = [];
    let currentMode: 'none' | 'msgctxt' | 'msgid' | 'msgid_plural' | 'msgstr' = 'none';
    let currentMsgStrIndex = 0;

    const commitEntry = () => {
      if (currentMsgId !== null) {
        if (currentMsgId === '') {
          // Header entry
          const headerText = currentMsgStr[0] || '';
          headerText.split('\n').forEach((hLine) => {
            const idx = hLine.indexOf(':');
            if (idx > 0) {
              const key = hLine.slice(0, idx).trim().toLowerCase();
              const val = hLine.slice(idx + 1).trim();
              headers[key] = val;
            }
          });
        } else {
          // Translation entry
          const key = currentMsgCtxt ? `${currentMsgCtxt}\u0004${currentMsgId}` : currentMsgId;
          const validStr = currentMsgStr.filter((s) => s.length > 0);
          if (validStr.length > 0) {
            translations[key] = validStr.length === 1 ? validStr[0] : validStr;
          }
        }
      }
      currentMsgCtxt = null;
      currentMsgId = null;
      currentMsgIdPlural = null;
      currentMsgStr = [];
      currentMode = 'none';
      currentMsgStrIndex = 0;
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith('#') || line === '') {
        if (line === '' && currentMsgId !== null) {
          commitEntry();
        }
        continue;
      }

      if (line.startsWith('msgctxt ')) {
        commitEntry();
        currentMode = 'msgctxt';
        currentMsgCtxt = PoCompiler.extractQuotedString(line.slice(8));
      } else if (line.startsWith('msgid ')) {
        if (currentMode !== 'msgctxt') {
          commitEntry();
        }
        currentMode = 'msgid';
        currentMsgId = PoCompiler.extractQuotedString(line.slice(6));
      } else if (line.startsWith('msgid_plural ')) {
        currentMode = 'msgid_plural';
        currentMsgIdPlural = PoCompiler.extractQuotedString(line.slice(13));
      } else if (line.startsWith('msgstr ') || line.startsWith('msgstr[')) {
        currentMode = 'msgstr';
        const bracketMatch = line.match(/^msgstr\[(\d+)\]\s+(.*)$/);
        if (bracketMatch) {
          currentMsgStrIndex = parseInt(bracketMatch[1], 10);
          currentMsgStr[currentMsgStrIndex] = PoCompiler.extractQuotedString(bracketMatch[2]);
        } else {
          currentMsgStrIndex = 0;
          currentMsgStr[0] = PoCompiler.extractQuotedString(line.slice(7));
        }
      } else if (line.startsWith('"') && line.endsWith('"')) {
        // Continuation string line
        const appendText = PoCompiler.extractQuotedString(line);
        if (currentMode === 'msgid' && currentMsgId !== null) {
          currentMsgId += appendText;
        } else if (currentMode === 'msgid_plural' && currentMsgIdPlural !== null) {
          currentMsgIdPlural += appendText;
        } else if (currentMode === 'msgctxt' && currentMsgCtxt !== null) {
          currentMsgCtxt += appendText;
        } else if (currentMode === 'msgstr') {
          currentMsgStr[currentMsgStrIndex] = (currentMsgStr[currentMsgStrIndex] || '') + appendText;
        }
      }
    }

    commitEntry();

    const detectedLang = headers['language'] || defaultLang;
    return {
      language: detectedLang,
      pluralFormsHeader: headers['plural-forms'],
      headers,
      translations,
    };
  }

  /**
   * Reads and compiles a .po file from disk
   */
  public static compileFile(filePath: string, defaultLang: string = 'en'): PoCatalog {
    if (!fs.existsSync(filePath)) {
      throw new Error(`PO file not found at path: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return PoCompiler.parse(content, defaultLang);
  }

  /**
   * Compiles all .po files within a directory tree into a multi-locale dictionary map
   */
  public static compileLocaleDirectory(localeDirPath: string): Record<string, PoCatalog> {
    const result: Record<string, PoCatalog> = {};
    if (!fs.existsSync(localeDirPath)) return result;

    const entries = fs.readdirSync(localeDirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const localeCode = entry.name;
        // Standard CakePHP path: app/Locale/{locale}/LC_MESSAGES/default.po or app/Locale/{locale}/default.po
        const standardPo = path.join(localeDirPath, localeCode, 'LC_MESSAGES', 'default.po');
        const fallbackPo = path.join(localeDirPath, localeCode, 'default.po');

        const targetPo = fs.existsSync(standardPo) ? standardPo : fs.existsSync(fallbackPo) ? fallbackPo : null;
        if (targetPo) {
          result[localeCode] = PoCompiler.compileFile(targetPo, localeCode);
        }
      }
    }

    return result;
  }

  private static extractQuotedString(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      const inner = trimmed.slice(1, -1);
      return inner
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
    }
    return trimmed;
  }
}
