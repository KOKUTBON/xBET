import { randomUUID } from 'crypto';
import type { BonusCodeConfig } from './bonus-codes.ts';

export interface ActiveUserBonus {
  id: string;
  userId: string;
  bonusCode: string;
  bonusAmount: number;
  targetWagerAmount: number;
  currentWageredAmount: number;
  minOdds: number;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'FORFEITED';
  createdAt: Date;
  completedAt: Date | null;
}

export class RolloverTracker {
  private static instance: RolloverTracker;
  private userBonuses: Map<string, ActiveUserBonus[]> = new Map();

  private constructor() {}

  public static getInstance(): RolloverTracker {
    if (!RolloverTracker.instance) {
      RolloverTracker.instance = new RolloverTracker();
    }
    return RolloverTracker.instance;
  }

  public grantBonus(userId: string, bonusAmount: number, config: BonusCodeConfig): ActiveUserBonus {
    const id = randomUUID();
    const targetWagerAmount = parseFloat((bonusAmount * config.rolloverMultiplier).toFixed(2));

    const bonus: ActiveUserBonus = {
      id,
      userId,
      bonusCode: config.code,
      bonusAmount,
      targetWagerAmount,
      currentWageredAmount: 0.0,
      minOdds: config.minOdds,
      status: 'ACTIVE',
      createdAt: new Date(),
      completedAt: null,
    };

    if (!this.userBonuses.has(userId)) {
      this.userBonuses.set(userId, []);
    }
    this.userBonuses.get(userId)!.push(bonus);

    console.log(`[RolloverTracker] Granted $${bonusAmount} bonus (${config.code}) to User ${userId}. Target rollover: $${targetWagerAmount}`);
    return bonus;
  }

  public getActiveBonuses(userId: string): ActiveUserBonus[] {
    const list = this.userBonuses.get(userId) || [];
    return list.filter((b) => b.status === 'ACTIVE');
  }

  public hasUnfinishedWagering(userId: string): boolean {
    return this.getActiveBonuses(userId).length > 0;
  }

  /**
   * Records a settled bet towards active bonus rollovers
   */
  public recordSettledBet(userId: string, stake: number, totalOdds: number): { releasedBonusAmount: number } {
    const activeList = this.getActiveBonuses(userId);
    if (activeList.length === 0) return { releasedBonusAmount: 0 };

    let releasedBonusAmount = 0;

    for (const bonus of activeList) {
      if (totalOdds < bonus.minOdds) {
        // Bet does not qualify for bonus rollover (odds below minimum)
        continue;
      }

      bonus.currentWageredAmount = parseFloat((bonus.currentWageredAmount + stake).toFixed(2));

      if (bonus.currentWageredAmount >= bonus.targetWagerAmount) {
        bonus.status = 'COMPLETED';
        bonus.completedAt = new Date();
        releasedBonusAmount += bonus.bonusAmount;
        console.log(`[RolloverTracker] Bonus ${bonus.bonusCode} for User ${userId} COMPLETED! Releasing $${bonus.bonusAmount} to real balance.`);
      }
    }

    return { releasedBonusAmount };
  }
}
