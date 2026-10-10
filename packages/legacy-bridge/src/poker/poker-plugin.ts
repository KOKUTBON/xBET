/**
 * 1:1 Poker Plugin Layer (PokerTable, PokerLog, PokerSetting)
 * Manages poker table configurations, player seating limits, small/big blinds,
 * automatic rake calculation (e.g. 5% capped at $3), and hand audit logs.
 */

export interface PokerTableConfig {
  id: string;
  name: string;
  gameType: 'TEXAS_HOLDEM' | 'OMAHA';
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
  rakePercent: number;
  rakeCap: number;
  isActive: boolean;
}

export class PokerPluginManager {
  private tables: Map<string, PokerTableConfig> = new Map();
  private handLogs: Array<{ id: string; tableId: string; pot: number; rakeCollected: number; winnerUserId: string; timestamp: Date }> = [];

  constructor() {
    this.createTable({
      id: 'table-micro-101',
      name: 'London Micro Cash ($0.50 / $1.00)',
      gameType: 'TEXAS_HOLDEM',
      smallBlind: 0.50,
      bigBlind: 1.00,
      minBuyIn: 20.0,
      maxBuyIn: 100.0,
      maxSeats: 6,
      rakePercent: 5.0,
      rakeCap: 3.0,
      isActive: true,
    });

    this.createTable({
      id: 'table-high-202',
      name: 'Monte Carlo High Roller ($25 / $50)',
      gameType: 'TEXAS_HOLDEM',
      smallBlind: 25.0,
      bigBlind: 50.0,
      minBuyIn: 1000.0,
      maxBuyIn: 5000.0,
      maxSeats: 9,
      rakePercent: 4.0,
      rakeCap: 5.0,
      isActive: true,
    });
  }

  public createTable(config: PokerTableConfig): PokerTableConfig {
    this.tables.set(config.id, config);
    return config;
  }

  public getActiveTables(): PokerTableConfig[] {
    return Array.from(this.tables.values()).filter((t) => t.isActive);
  }

  public calculateRake(tableId: string, potAmount: number): { pot: number; rake: number; netPot: number } {
    const table = this.tables.get(tableId);
    if (!table) return { pot: potAmount, rake: 0, netPot: potAmount };

    const rawRake = (potAmount * table.rakePercent) / 100;
    const rake = Math.min(table.rakeCap, Number(rawRake.toFixed(2)));
    const netPot = Number((potAmount - rake).toFixed(2));
    return { pot: potAmount, rake, netPot };
  }

  public logHand(tableId: string, pot: number, rakeCollected: number, winnerUserId: string): void {
    this.handLogs.push({
      id: `hand-${Date.now()}`,
      tableId,
      pot,
      rakeCollected,
      winnerUserId,
      timestamp: new Date(),
    });
  }

  public getHandLogs(tableId?: string): any[] {
    if (tableId) return this.handLogs.filter((l) => l.tableId === tableId);
    return this.handLogs;
  }
}
