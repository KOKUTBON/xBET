import { randomUUID } from 'crypto';
import { PasswordHasher } from '../auth/password-hasher.ts';
import { SessionManager } from '../auth/jwt-session.ts';
import { UserRole } from '../auth/role-hierarchy.ts';

export const KycStatus = {
  UNVERIFIED: 'UNVERIFIED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  parentId?: string | null; // e.g. Agent ID for Branch, Branch ID for Cashier
  currencyCode: string;
  kycStatus: KycStatus;
  creditLimit: number;
  availableCredit: number;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export class UserManager {
  private static instance: UserManager;
  private users: Map<string, UserRecord> = new Map();
  private usernameIndex: Map<string, string> = new Map();
  private emailIndex: Map<string, string> = new Map();

  private constructor() {
    // Explicit local bootstrap only; a published build must never ship a known administrator password.
    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (bootstrapPassword) {
      if (bootstrapPassword.length < 16) throw new Error('ADMIN_BOOTSTRAP_PASSWORD must contain at least 16 characters');
      this.registerUser({
        username: process.env.ADMIN_BOOTSTRAP_USERNAME || 'admin',
        email: process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@localhost.invalid',
        password: bootstrapPassword,
        role: UserRole.ADMINISTRATOR,
        currencyCode: 'USD',
      });
    }
  }

  public static getInstance(): UserManager {
    if (!UserManager.instance) {
      UserManager.instance = new UserManager();
    }
    return UserManager.instance;
  }

  public registerUser(params: {
    username: string;
    email: string;
    password: string;
    role?: UserRole;
    parentId?: string | null;
    currencyCode?: string;
  }): UserRecord {
    const cleanUsername = params.username.trim().toLowerCase();
    const cleanEmail = params.email.trim().toLowerCase();

    if (this.usernameIndex.has(cleanUsername)) {
      throw new Error(`USERNAME_TAKEN: Username ${params.username} already exists`);
    }
    if (this.emailIndex.has(cleanEmail)) {
      throw new Error(`EMAIL_TAKEN: Email ${params.email} already exists`);
    }

    const id = randomUUID();
    const passwordHash = PasswordHasher.hashPassword(params.password);
    const role = params.role || UserRole.PLAYER;

    const user: UserRecord = {
      id,
      username: params.username.trim(),
      email: cleanEmail,
      passwordHash,
      role,
      parentId: params.parentId || null,
      currencyCode: params.currencyCode || 'USD',
      kycStatus: role === UserRole.ADMINISTRATOR ? KycStatus.VERIFIED : KycStatus.UNVERIFIED,
      creditLimit: 0,
      availableCredit: 0,
      isActive: true,
      createdAt: new Date(),
      lastLoginAt: null,
    };

    this.users.set(id, user);
    this.usernameIndex.set(cleanUsername, id);
    this.emailIndex.set(cleanEmail, id);

    console.log(`[UserManager] Registered ${role}: ${user.username} (${user.id})`);
    return user;
  }

  public authenticate(usernameOrEmail: string, password: string): { user: UserRecord; token: string } {
    const cleanQuery = usernameOrEmail.trim().toLowerCase();
    const userId = this.usernameIndex.get(cleanQuery) || this.emailIndex.get(cleanQuery);

    if (!userId) {
      throw new Error('INVALID_CREDENTIALS: User not found');
    }

    const user = this.users.get(userId)!;
    if (!user.isActive) {
      throw new Error('ACCOUNT_SUSPENDED: Account is deactivated');
    }

    const isValid = PasswordHasher.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new Error('INVALID_CREDENTIALS: Incorrect password');
    }

    // Transparently upgrade legacy CakePHP password hash to PBKDF2
    if (PasswordHasher.needsRehash(user.passwordHash)) {
      const upgradedHash = PasswordHasher.hashPassword(password);
      user.passwordHash = upgradedHash;
      console.log(`[UserManager:Security] Transparently upgraded password hash to PBKDF2 for user ${user.username}`);
    }

    user.lastLoginAt = new Date();
    const token = SessionManager.createSession(user);

    return { user, token };
  }

  public importMigratedUser(params: {
    id?: string;
    username: string;
    email: string;
    passwordHash: string;
    role?: UserRole;
    parentId?: string | null;
    currencyCode?: string;
    isActive?: boolean;
    createdAt?: Date;
  }): UserRecord {
    const cleanUsername = params.username.trim().toLowerCase();
    const cleanEmail = params.email.trim().toLowerCase();

    if (this.usernameIndex.has(cleanUsername)) {
      throw new Error(`USERNAME_TAKEN: Username ${params.username} already exists`);
    }

    const id = params.id || randomUUID();
    const role = params.role || UserRole.PLAYER;

    const user: UserRecord = {
      id,
      username: params.username.trim(),
      email: cleanEmail,
      passwordHash: params.passwordHash,
      role,
      parentId: params.parentId || null,
      currencyCode: params.currencyCode || 'USD',
      kycStatus: KycStatus.VERIFIED,
      creditLimit: 0,
      availableCredit: 0,
      isActive: params.isActive !== undefined ? params.isActive : true,
      createdAt: params.createdAt || new Date(),
      lastLoginAt: null,
    };

    this.users.set(id, user);
    this.usernameIndex.set(cleanUsername, id);
    this.emailIndex.set(cleanEmail, id);

    console.log(`[UserManager:Migration] Imported legacy user: ${user.username} (${user.id})`);
    return user;
  }

  public getUserById(id: string): UserRecord | undefined {
    return this.users.get(id);
  }

  public getAllUsers(): UserRecord[] {
    return Array.from(this.users.values());
  }

  public updateKycStatus(userId: string, status: KycStatus): UserRecord {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    user.kycStatus = status;
    console.log(`[UserManager] User ${user.username} KYC updated to: ${status}`);
    return user;
  }
}
