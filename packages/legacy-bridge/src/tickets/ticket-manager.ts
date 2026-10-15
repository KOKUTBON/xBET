import { randomUUID } from 'crypto';
import { TicketPrinter } from './ticket-printer.ts';
import type { PrintableTicketData } from './ticket-printer.ts';
import { OddsFormatter } from './odds-formatter.ts';
import type { OddsFormat } from './odds-formatter.ts';

export const LegacyTicketStatus = {
  PENDING: 'PENDING',
  WON: 'WON',
  LOST: 'LOST',
  VOID: 'VOID',
  PAID_OUT: 'PAID_OUT',
  CANCELLED: 'CANCELLED',
  CASHED_OUT: 'CASHED_OUT',
} as const;
export type LegacyTicketStatus = (typeof LegacyTicketStatus)[keyof typeof LegacyTicketStatus];

export interface LegacyTicketRecord {
  id: string;
  slipNumber: string;
  barcode: string;
  securityCode: string;
  userId: string;
  branchId?: string;
  cashierId?: string;
  betType: 'SINGLE' | 'COMBI' | 'SYSTEM';
  status: LegacyTicketStatus;
  currencyCode: string;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  actualPayout: number;
  cashoutOffer: number | null;
  createdAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  legs: Array<{
    selectionId: string;
    selectionName: string;
    marketName: string;
    fixtureName: string;
    lockedOdds: number;
    status: string;
  }>;
}

export class TicketManager {
  private static instance: TicketManager;
  private tickets: Map<string, LegacyTicketRecord> = new Map();
  // Map of barcode / security code -> ticketId
  private barcodeIndex: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): TicketManager {
    if (!TicketManager.instance) {
      TicketManager.instance = new TicketManager();
    }
    return TicketManager.instance;
  }

  public placeTicket(params: {
    userId: string;
    branchId?: string;
    cashierId?: string;
    betType: 'SINGLE' | 'COMBI' | 'SYSTEM';
    stake: number;
    currencyCode?: string;
    legs: Array<{
      selectionId: string;
      selectionName: string;
      marketName: string;
      fixtureName: string;
      lockedOdds: number;
    }>;
  }): LegacyTicketRecord {
    const id = randomUUID();
    const randNum = Math.floor(100000 + Math.random() * 900000);
    const slipNumber = `SLIP-${randNum}-${Math.floor(100 + Math.random() * 900)}`;
    const barcode = `BC${randNum}${Date.now().toString().slice(-4)}`;
    const securityCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const totalOdds = params.legs.reduce((acc, l) => acc * l.lockedOdds, 1.0);
    const potentialPayout = parseFloat((params.stake * totalOdds).toFixed(2));

    const ticket: LegacyTicketRecord = {
      id,
      slipNumber,
      barcode,
      securityCode,
      userId: params.userId,
      branchId: params.branchId || 'BR-01',
      cashierId: params.cashierId || 'CSH-10',
      betType: params.betType,
      status: LegacyTicketStatus.PENDING,
      currencyCode: params.currencyCode || 'USD',
      stake: params.stake,
      totalOdds: parseFloat(totalOdds.toFixed(2)),
      potentialPayout,
      actualPayout: 0,
      cashoutOffer: parseFloat((params.stake * 0.95).toFixed(2)),
      createdAt: new Date(),
      paidAt: null,
      cancelledAt: null,
      legs: params.legs.map((l) => ({ ...l, status: 'PENDING' })),
    };

    this.tickets.set(id, ticket);
    this.barcodeIndex.set(barcode, id);
    this.barcodeIndex.set(slipNumber, id);

    return ticket;
  }

  public getTicketById(id: string): LegacyTicketRecord | undefined {
    return this.tickets.get(id);
  }

  /**
   * Fast lookup for barcode scanners and slip number checkers
   */
  public checkTicket(queryCode: string): LegacyTicketRecord | undefined {
    const cleanCode = queryCode.replace(/[* ]/g, '').toUpperCase();
    const id = this.barcodeIndex.get(cleanCode);
    if (id) {
      return this.tickets.get(id);
    }
    return undefined;
  }

  /**
   * Generates printable thermal receipt
   */
  public printThermalReceipt(ticketId: string, oddsFormat: OddsFormat = 'DECIMAL'): string {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const printableData: PrintableTicketData = {
      slipNumber: ticket.slipNumber,
      barcode: ticket.barcode,
      securityCode: ticket.securityCode,
      branchName: `Shop Branch ${ticket.branchId}`,
      cashierName: `Operator ${ticket.cashierId}`,
      createdAt: ticket.createdAt,
      betType: ticket.betType,
      stake: ticket.stake,
      totalOdds: ticket.totalOdds,
      potentialPayout: ticket.potentialPayout,
      currencyCode: ticket.currencyCode,
      legs: ticket.legs.map((l) => ({
        fixtureName: l.fixtureName,
        marketName: l.marketName,
        selectionName: l.selectionName,
        lockedOdds: l.lockedOdds,
      })),
    };

    return TicketPrinter.generateThermalHtml(printableData, oddsFormat);
  }

  /**
   * Cashier OTC payout
   */
  public payTicketByCashier(ticketId: string, cashierId: string): LegacyTicketRecord {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    if (ticket.status !== LegacyTicketStatus.WON) {
      throw new Error(`CANNOT_PAY: Ticket status is ${ticket.status}. Must be WON to cash out at counter.`);
    }

    ticket.status = LegacyTicketStatus.PAID_OUT;
    ticket.paidAt = new Date();
    ticket.cashierId = cashierId;

    console.log(`[Cashier OTC] Ticket ${ticket.slipNumber} paid out $${ticket.actualPayout} by Cashier ${cashierId}`);
    return ticket;
  }

  /**
   * Cashier 5-minute cancellation window
   */
  public cancelTicket(ticketId: string, _cashierId: string): LegacyTicketRecord {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    if (ticket.status !== LegacyTicketStatus.PENDING) {
      throw new Error(`CANNOT_CANCEL: Ticket status is ${ticket.status}`);
    }

    const elapsedMinutes = (Date.now() - ticket.createdAt.getTime()) / (1000 * 60);
    if (elapsedMinutes > 5.0) {
      throw new Error(`CANCEL_WINDOW_EXPIRED: Tickets can only be cancelled within 5 minutes of placement (elapsed: ${elapsedMinutes.toFixed(1)} mins)`);
    }

    ticket.status = LegacyTicketStatus.CANCELLED;
    ticket.cancelledAt = new Date();
    console.log(`[Cashier OTC] Ticket ${ticket.slipNumber} cancelled and refunded within 5-minute safety window.`);
    return ticket;
  }
}
