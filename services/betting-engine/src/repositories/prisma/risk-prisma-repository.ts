import { DatabaseClient } from '../../../../packages/database/src/client.ts';
import type { IRiskRepository, RiskProfile } from '../interfaces.ts';

export class RiskPrismaRepository implements IRiskRepository {
  private selectionLiabilities: Map<string, number> = new Map();

  public async getLiability(selectionId: string): Promise<number> {
    return this.selectionLiabilities.get(selectionId) || 0;
  }

  public async setLiability(selectionId: string, amount: number): Promise<void> {
    this.selectionLiabilities.set(selectionId, amount);
  }

  public async getDefaultProfile(): Promise<RiskProfile> {
    try {
      const prisma = await DatabaseClient.getClient();
      const limit = await prisma.riskLimit.findFirst();
      if (limit) {
        return {
          minStake: 0.10,
          maxStake: Number(limit.maxStakePerBet || 5000),
          maxPotentialPayout: Number(limit.maxPayoutPerBet || 100000),
          maxSelectionLiability: Number(limit.maxMarketLiability || 50000),
        };
      }
    } catch {
      // Fallback
    }

    return {
      minStake: 0.10,
      maxStake: 5000.0,
      maxPotentialPayout: 100000.0,
      maxSelectionLiability: 50000.0,
    };
  }
}
