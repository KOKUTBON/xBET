import { DatabaseClient } from '../../../database/src/client.ts';
import type { IUserRepository } from '../interfaces.ts';
import type { UserRecord, KycStatus } from '../../users/user-manager.ts';
import type { UserRole } from '../../auth/role-hierarchy.ts';

export class UserPrismaRepository implements IUserRepository {
  public async findById(id: string): Promise<UserRecord | undefined> {
    const prisma = await DatabaseClient.getClient();
    const user = await prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!user) return undefined;
    return this.mapToRecord(user);
  }

  public async findByUsername(username: string): Promise<UserRecord | undefined> {
    const prisma = await DatabaseClient.getClient();
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      include: { profile: true },
    });
    if (!user) return undefined;
    return this.mapToRecord(user);
  }

  public async findByEmail(email: string): Promise<UserRecord | undefined> {
    const prisma = await DatabaseClient.getClient();
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { profile: true },
    });
    if (!user) return undefined;
    return this.mapToRecord(user);
  }

  public async save(user: UserRecord): Promise<void> {
    const prisma = await DatabaseClient.getClient();
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role as any,
        preferredCurrencyCode: user.currencyCode,
        status: user.isActive ? 'ACTIVE' : 'SUSPENDED',
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
      update: {
        passwordHash: user.passwordHash,
        role: user.role as any,
        status: user.isActive ? 'ACTIVE' : 'SUSPENDED',
        lastLoginAt: user.lastLoginAt,
      },
    });
  }

  public async findAll(): Promise<UserRecord[]> {
    const prisma = await DatabaseClient.getClient();
    const users = await prisma.user.findMany({
      include: { profile: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(this.mapToRecord);
  }

  private mapToRecord(u: any): UserRecord {
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      passwordHash: u.passwordHash,
      role: u.role as UserRole,
      parentId: u.referralUserId,
      currencyCode: u.preferredCurrencyCode || 'USD',
      kycStatus: (u.profile?.kycVerified ? 'VERIFIED' : 'UNVERIFIED') as KycStatus,
      creditLimit: 0,
      availableCredit: 0,
      isActive: u.status === 'ACTIVE',
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    };
  }
}
