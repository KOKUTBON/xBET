import type { IBetSlipRepository } from '../interfaces.ts';
import type { BetSlipRecord, BetSlipStatus } from '../../betting/bet-placement.ts';

/**
 * In-memory implementation of IBetSlipRepository.
 * Exposes both async (interface) and sync (backward-compat) accessors.
 */
export class BetSlipMemoryRepository implements IBetSlipRepository {
  private tickets: Map<string, BetSlipRecord> = new Map();
  private userTickets: Map<string, Set<string>> = new Map();

  public snapshot(): { tickets: Map<string, BetSlipRecord>; userTickets: Map<string, Set<string>> } {
    return {
      tickets: new Map(this.tickets),
      userTickets: new Map(Array.from(this.userTickets, ([id, ids]) => [id, new Set(ids)])),
    };
  }

  public restore(snapshot: ReturnType<BetSlipMemoryRepository['snapshot']>): void {
    this.tickets = snapshot.tickets;
    this.userTickets = snapshot.userTickets;
  }

  // ---- Async interface (IBetSlipRepository) ----

  public async save(slip: BetSlipRecord): Promise<void> {
    this.tickets.set(slip.id, slip);
  }

  public async findById(id: string): Promise<BetSlipRecord | undefined> {
    return this.tickets.get(id);
  }

  public async findByUserId(userId: string): Promise<BetSlipRecord[]> {
    const slipIds = this.userTickets.get(userId);
    if (!slipIds) return [];
    const userSlips: BetSlipRecord[] = [];
    for (const id of slipIds) {
      const slip = this.tickets.get(id);
      if (slip) userSlips.push(slip);
    }
    return userSlips;
  }

  public async findAll(): Promise<BetSlipRecord[]> {
    return Array.from(this.tickets.values());
  }

  public async findByStatus(status: BetSlipStatus): Promise<BetSlipRecord[]> {
    return Array.from(this.tickets.values()).filter(t => t.status === status);
  }

  public async addUserTicket(userId: string, slipId: string): Promise<void> {
    let slipIds = this.userTickets.get(userId);
    if (!slipIds) {
      slipIds = new Set<string>();
      this.userTickets.set(userId, slipIds);
    }
    slipIds.add(slipId);
  }

  // ---- Synchronous accessors (for backward-compatible callers) ----

  public saveSync(slip: BetSlipRecord): void {
    this.tickets.set(slip.id, slip);
  }

  public findByIdSync(id: string): BetSlipRecord | undefined {
    return this.tickets.get(id);
  }

  public findByUserIdSync(userId: string): BetSlipRecord[] {
    const slipIds = this.userTickets.get(userId);
    if (!slipIds) return [];
    const userSlips: BetSlipRecord[] = [];
    for (const id of slipIds) {
      const slip = this.tickets.get(id);
      if (slip) userSlips.push(slip);
    }
    return userSlips;
  }

  public findAllSync(): BetSlipRecord[] {
    return Array.from(this.tickets.values());
  }

  public findByStatusSync(status: BetSlipStatus): BetSlipRecord[] {
    return Array.from(this.tickets.values()).filter(t => t.status === status);
  }

  public addUserTicketSync(userId: string, slipId: string): void {
    let slipIds = this.userTickets.get(userId);
    if (!slipIds) {
      slipIds = new Set<string>();
      this.userTickets.set(userId, slipIds);
    }
    slipIds.add(slipId);
  }
}
