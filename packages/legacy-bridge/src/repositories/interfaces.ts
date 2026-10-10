import type { UserRecord } from '../users/user-manager.ts';
import type { DepositTransaction } from '../payments/deposit-manager.ts';

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | undefined>;
  findByUsername(username: string): Promise<UserRecord | undefined>;
  findByEmail(email: string): Promise<UserRecord | undefined>;
  save(user: UserRecord): Promise<void>;
  findAll(): Promise<UserRecord[]>;
}

export interface IPaymentRepository {
  saveDeposit(deposit: DepositTransaction): Promise<void>;
  findDepositById(id: string): Promise<DepositTransaction | undefined>;
  findDepositsByUserId(userId: string): Promise<DepositTransaction[]>;
}
