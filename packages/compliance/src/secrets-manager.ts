/**
 * Production Secrets & Key Rotation Manager
 * Manages database credentials, JWT private keys, payment gateway API secrets,
 * and key rotation lifecycle.
 */

import { randomBytes } from 'node:crypto';

export interface SecretEntry {
  key: string;
  value: string;
  version: number;
  updatedAt: Date;
}

export class SecretsManager {
  private static instance: SecretsManager;
  private secrets: Map<string, SecretEntry> = new Map();

  public static getInstance(): SecretsManager {
    if (!SecretsManager.instance) {
      SecretsManager.instance = new SecretsManager();
    }
    return SecretsManager.instance;
  }

  public getSecret(key: string, defaultValue: string = ''): string {
    const entry = this.secrets.get(key);
    if (entry) return entry.value;

    const envVal = process.env[key];
    if (envVal) return envVal;

    return defaultValue;
  }

  public setSecret(key: string, value: string): SecretEntry {
    const current = this.secrets.get(key);
    const version = current ? current.version + 1 : 1;

    const entry: SecretEntry = {
      key,
      value,
      version,
      updatedAt: new Date(),
    };
    this.secrets.set(key, entry);
    return entry;
  }

  /**
   * Rotate a cryptographic key or secret
   */
  public rotateKey(key: string, byteLength: number = 32): SecretEntry {
    const newSecret = randomBytes(byteLength).toString('hex');
    return this.setSecret(key, newSecret);
  }
}
