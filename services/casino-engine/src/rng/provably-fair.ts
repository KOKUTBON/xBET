import { createHmac, randomBytes, createHash } from 'crypto';

export interface ProvablyFairSeedPair {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export class ProvablyFairRNG {
  public static readonly ALGORITHM_VERSION = 'hmac-sha256-rejection-v1';

  public static generateServerSeed(): string {
    return randomBytes(32).toString('hex');
  }

  public static hashServerSeed(serverSeed: string): string {
    return createHash('sha256').update(serverSeed).digest('hex');
  }

  public static verifyCommitment(serverSeed: string, serverSeedHash: string): boolean {
    return this.hashServerSeed(serverSeed) === serverSeedHash;
  }

  public static generateSeedPair(clientSeed?: string): ProvablyFairSeedPair {
    const serverSeed = this.generateServerSeed();
    const serverSeedHash = this.hashServerSeed(serverSeed);
    const cSeed = clientSeed || randomBytes(16).toString('hex');

    return {
      serverSeed,
      serverSeedHash,
      clientSeed: cSeed,
      nonce: 0,
    };
  }

  /**
   * Generates a cryptographically unbiased integer in [min, max] inclusive
   * using HMAC-SHA256 and rejection sampling to strictly eliminate modulo bias.
   */
  public static generateUnbiasedInt(
    min: number,
    max: number,
    serverSeed: string,
    clientSeed: string,
    nonce: number,
    cursor: number = 0
  ): { value: number; bytesConsumed: number } {
    if (min > max) throw new Error('INVALID_RANGE: min must be <= max');
    const range = max - min + 1;
    if (range === 1) return { value: min, bytesConsumed: 0 };

    // Largest multiple of range that fits in 32 bits
    const limit = 0x100000000 - (0x100000000 % range);
    let blockIndex = Math.floor(cursor / 32);
    let byteOffset = cursor % 32;

    while (true) {
      const hmac = createHmac('sha256', serverSeed);
      hmac.update(`${clientSeed}:${nonce}:${blockIndex}`);
      const buffer = hmac.digest();

      while (byteOffset + 4 <= 32) {
        const uint32 = buffer.readUInt32BE(byteOffset);
        byteOffset += 4;
        if (uint32 < limit) {
          const value = min + (uint32 % range);
          return { value, bytesConsumed: (blockIndex * 32) + byteOffset - cursor };
        }
      }
      blockIndex++;
      byteOffset = 0;
    }
  }

  /**
   * Generates a deterministic float in [0, 1) using 53-bit resolution (standard IEEE-754 double precision)
   */
  public static generateFloat(serverSeed: string, clientSeed: string, nonce: number, index: number = 0): number {
    const hmac = createHmac('sha256', serverSeed);
    hmac.update(`${clientSeed}:${nonce}:${index}`);
    const hash = hmac.digest();

    // Read 32 bits
    const intVal = hash.readUInt32BE(0);
    return intVal / 0x100000000;
  }

  /**
   * Generates an integer in [min, max] inclusive using rejection sampling
   */
  public static generateInt(min: number, max: number, serverSeed: string, clientSeed: string, nonce: number, index: number = 0): number {
    return this.generateUnbiasedInt(min, max, serverSeed, clientSeed, nonce, index * 4).value;
  }

  /**
   * Provably fair Fisher-Yates array shuffle using unbiased integer selection
   */
  public static shuffle<T>(array: T[], serverSeed: string, clientSeed: string, nonce: number): T[] {
    const cloned = [...array];
    let cursor = 0;
    for (let i = cloned.length - 1; i > 0; i--) {
      const { value: j, bytesConsumed } = this.generateUnbiasedInt(0, i, serverSeed, clientSeed, nonce, cursor);
      cursor += bytesConsumed;
      const temp = cloned[i];
      cloned[i] = cloned[j];
      cloned[j] = temp;
    }
    return cloned;
  }
}
