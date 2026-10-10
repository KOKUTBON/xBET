import { TicketManager, LegacyTicketStatus } from '../tickets/ticket-manager.ts';
import type { LegacyTicketRecord } from '../tickets/ticket-manager.ts';

export class TicketMonitor {
  private static instance: TicketMonitor;
  private ticketManager: TicketManager;

  private constructor() {
    this.ticketManager = TicketManager.getInstance();
  }

  public static getInstance(): TicketMonitor {
    if (!TicketMonitor.instance) {
      TicketMonitor.instance = new TicketMonitor();
    }
    return TicketMonitor.instance;
  }

  public getTicketsByStatus(statusFilter: string = 'ALL'): LegacyTicketRecord[] {
    const dummyTickets: LegacyTicketRecord[] = [
      {
        id: 't-101',
        slipNumber: 'SLIP-841920-101',
        barcode: 'BC84192011',
        securityCode: 'AB94Z1',
        userId: 'user-01',
        betType: 'COMBI',
        status: LegacyTicketStatus.PENDING,
        currencyCode: 'USD',
        stake: 100.0,
        totalOdds: 3.50,
        potentialPayout: 350.0,
        actualPayout: 0,
        cashoutOffer: 95.0,
        createdAt: new Date(),
        paidAt: null,
        cancelledAt: null,
        legs: [
          { selectionId: 's1', selectionName: 'Arsenal', marketName: '1X2', fixtureName: 'Arsenal vs Chelsea', lockedOdds: 1.75, status: 'PENDING' },
          { selectionId: 's2', selectionName: 'Real Madrid', marketName: '1X2', fixtureName: 'Real Madrid vs City', lockedOdds: 2.00, status: 'PENDING' },
        ],
      },
      {
        id: 't-102',
        slipNumber: 'SLIP-332910-202',
        barcode: 'BC33291022',
        securityCode: 'ZX88K2',
        userId: 'user-02',
        betType: 'SINGLE',
        status: LegacyTicketStatus.WON,
        currencyCode: 'USD',
        stake: 50.0,
        totalOdds: 2.50,
        potentialPayout: 125.0,
        actualPayout: 125.0,
        cashoutOffer: null,
        createdAt: new Date(),
        paidAt: null,
        cancelledAt: null,
        legs: [{ selectionId: 's3', selectionName: 'Bayern', marketName: '1X2', fixtureName: 'Bayern vs PSG', lockedOdds: 2.50, status: 'WON' }],
      },
    ];

    if (statusFilter === 'ALL') return dummyTickets;
    return dummyTickets.filter((t) => t.status === statusFilter);
  }

  public manualVoidTicket(ticketId: string, adminUserId: string, reason: string): void {
    console.log(`[TicketMonitor] Ticket ${ticketId} manually VOIDED by Admin ${adminUserId}. Reason: ${reason}`);
  }
}
