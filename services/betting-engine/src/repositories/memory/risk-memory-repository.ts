import type { IRiskRepository, RiskProfile } from '../interfaces.ts';

/**
 * In-memory implementation of IRiskRepository.
 * Exposes both async (interface) and sync (backward-compat) accessors.
 */
export class RiskMemoryRepository implements IRiskRepository {
  private selectionLiabilities: Map<string, number> = new Map();

  public snapshot(): Map<string, number> {
    return new Map(this.selectionLiabilities);
  }

  public restore(snapshot: Map<string, number>): void {
    this.selectionLiabilities = snapshot;
  }

  private defaultProfile: RiskProfile = {
    minStake: 0.10,
    maxStake: 5000.0,
    maxPotentialPayout: 100000.0,
    maxSelectionLiability: 50000.0,
  };

  // ---- Async interface (IRiskRepository) ----

  public async getLiability(selectionId: string): Promise<number> {
    return this.selectionLiabilities.get(selectionId) || 0;
  }

  public async setLiability(selectionId: string, amount: number): Promise<void> {
    this.selectionLiabilities.set(selectionId, amount);
  }

  public async getDefaultProfile(): Promise<RiskProfile> {
    return { ...this.defaultProfile };
  }

  // ---- Synchronous accessors (for backward-compatible callers) ----

  public getLiabilitySync(selectionId: string): number {
    return this.selectionLiabilities.get(selectionId) || 0;
  }

  public setLiabilitySync(selectionId: string, amount: number): void {
    this.selectionLiabilities.set(selectionId, amount);
  }

  public getDefaultProfileSync(): RiskProfile {
    return { ...this.defaultProfile };
  }
}
