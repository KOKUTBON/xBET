import { createHash, pbkdf2Sync, randomBytes } from 'crypto';

export class PasswordHasher {
  private static readonly ITERATIONS = 10000;
  private static readonly KEY_LEN = 64;
  private static readonly DIGEST = 'sha512';
  public static readonly CAKEPHP_DEFAULT_SALT = 'ajksdf6asdKSDF23rkjsdfksdjfSDKFJ345345fd';

  /**
   * Hashes a plaintext password with a random cryptographic salt (PBKDF2-SHA512)
   */
  public static hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, this.ITERATIONS, this.KEY_LEN, this.DIGEST).toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Computes a legacy CakePHP 2.x SHA1 hash: sha1(Security.salt . password)
   */
  public static hashCakePhpLegacy(password: string, salt: string = this.CAKEPHP_DEFAULT_SALT): string {
    return createHash('sha1').update(salt + password).digest('hex');
  }

  /**
   * Checks whether a stored hash is using legacy CakePHP algorithm and requires rehashing
   */
  public static needsRehash(storedHash: string): boolean {
    if (storedHash.startsWith('cakephp_sha1:')) return true;
    // Pure 40-char SHA1 hex string from legacy MySQL dump
    if (/^[a-f0-9]{40}$/i.test(storedHash)) return true;
    // Any hash that is not modern salt:hash
    const parts = storedHash.split(':');
    return parts.length !== 2 || parts[0].length !== 32;
  }

  /**
   * Verifies a plaintext password against either a modern PBKDF2 salt:hash
   * or a legacy CakePHP 2.x SHA1 hash (cakephp_sha1:<hash> or raw 40-char hex)
   */
  public static verifyPassword(password: string, storedHash: string): boolean {
    if (!storedHash) return false;

    // Check for explicit legacy prefix or raw 40-character SHA1 hex
    if (storedHash.startsWith('cakephp_sha1:')) {
      const targetHash = storedHash.slice('cakephp_sha1:'.length).trim().toLowerCase();
      const legacyHash = this.hashCakePhpLegacy(password).toLowerCase();
      return targetHash === legacyHash;
    }

    if (/^[a-f0-9]{40}$/i.test(storedHash)) {
      const legacyHash = this.hashCakePhpLegacy(password).toLowerCase();
      return storedHash.toLowerCase() === legacyHash;
    }

    // Modern PBKDF2 verification
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;

    const [salt, originalHash] = parts;
    const computedHash = pbkdf2Sync(password, salt, this.ITERATIONS, this.KEY_LEN, this.DIGEST).toString('hex');
    return computedHash === originalHash;
  }
}
