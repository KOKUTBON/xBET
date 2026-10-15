/**
 * Poker Lobby & Multi-Table Manager
 * Manages active cash game tables across stake levels and player seating.
 */

import { TexasHoldemTable } from './texas-holdem-table.ts';
import type { PokerTableConfig } from './poker-types.ts';

export class PokerTableManager {
  private static instance: PokerTableManager;
  private tables: Map<string, TexasHoldemTable> = new Map();

  private constructor() {
    this.seedDefaultTables();
  }

  public static getInstance(): PokerTableManager {
    if (!PokerTableManager.instance) {
      PokerTableManager.instance = new PokerTableManager();
    }
    return PokerTableManager.instance;
  }

  public createTable(config: PokerTableConfig): TexasHoldemTable {
    const table = new TexasHoldemTable(config);
    this.tables.set(table.id, table);
    console.log(`[PokerLobby] Created Table: ${table.name} ($${table.smallBlind}/$${table.bigBlind})`);
    return table;
  }

  public getTable(id: string): TexasHoldemTable | undefined {
    return this.tables.get(id);
  }

  public getAllTables(): TexasHoldemTable[] {
    return Array.from(this.tables.values());
  }

  public getLobbyList(): Array<{
    id: string;
    name: string;
    blinds: string;
    minBuyIn: number;
    maxBuyIn: number;
    occupiedSeats: number;
    maxSeats: number;
    stage: string;
    pot: number;
  }> {
    return Array.from(this.tables.values()).map((t) => {
      const state = t.getState();
      const occupied = state.seats.filter((s) => s !== null).length;
      return {
        id: t.id,
        name: t.name,
        blinds: `$${t.smallBlind}/$${t.bigBlind}`,
        minBuyIn: t.minBuyIn,
        maxBuyIn: t.maxBuyIn,
        occupiedSeats: occupied,
        maxSeats: t.maxSeats,
        stage: state.stage,
        pot: state.pot,
      };
    });
  }

  private seedDefaultTables(): void {
    this.createTable({
      id: 'table-micro-01',
      name: 'London Micro Cash ($0.50 / $1.00)',
      smallBlind: 0.50,
      bigBlind: 1.00,
      minBuyIn: 20.0,
      maxBuyIn: 100.0,
      maxSeats: 6,
    });

    this.createTable({
      id: 'table-medium-02',
      name: 'Vegas Strip 6-Max ($2.00 / $5.00)',
      smallBlind: 2.00,
      bigBlind: 5.00,
      minBuyIn: 100.0,
      maxBuyIn: 500.0,
      maxSeats: 6,
    });

    this.createTable({
      id: 'table-high-03',
      name: 'Monte Carlo High Roller ($25.00 / $50.00)',
      smallBlind: 25.00,
      bigBlind: 50.00,
      minBuyIn: 1000.0,
      maxBuyIn: 5000.0,
      maxSeats: 9,
    });
  }
}
