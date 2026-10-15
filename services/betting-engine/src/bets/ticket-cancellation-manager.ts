/**
 * Ticket Cancellation Manager
 * Ported 1:1 from CakePHP Ticket.php isCancellable() and cancel() methods.
 * Handles grace-window verification, kickoff time validation, and double-entry ledger refunding.
 */

import { LedgerService } from '../wallet/ledger-service.ts';
import type { BetSlipRecord } from './bet-placement-service.ts';

export interface CancellationResult {
  success: boolean;
  ticketId: string;
  refundAmount: number;
  newBalance: number;
  reason?: string;
  error?: string;
  cancelledAt?: string;
}

export class TicketCancellationManager {
  private static instance: TicketCancellationManager;
  private ledger: LedgerService;

  private constructor() {
    this.ledger = LedgerService.getInstance();
  }

  public static getInstance(): TicketCancellationManager {
    if (!TicketCancellationManager.instance) {
      TicketCancellationManager.instance = new TicketCancellationManager();
    }
    return TicketCancellationManager.instance;
  }

  /**
   * Evaluates whether a ticket is eligible for cancellation
   */
  public isCancellable(
    ticket: BetSlipRecord,
    graceWindowMinutes: number = 5,
    currentTime: number = Date.now()
  ): { cancellable: boolean; reason?: string } {
    if (ticket.status !== 'ACCEPTED') {
      return { cancellable: false, reason: `Ticket is in '${ticket.status}' status (must be ACCEPTED)` };
    }

    const placedTime = new Date(ticket.placedAt).getTime();
    const graceWindowMs = graceWindowMinutes * 60 * 1000;
    if (currentTime > placedTime + graceWindowMs) {
      return {
        cancellable: false,
        reason: `Cancellation grace window expired (${graceWindowMinutes} min limit exceeded)`,
      };
    }

    // Check if any match leg has already started
    if (ticket.legs && ticket.legs.length > 0) {
      for (const leg of ticket.legs) {
        const fixtureStartTime = (leg as any).fixtureStartTime
          ? new Date((leg as any).fixtureStartTime).getTime()
          : null;

        if (fixtureStartTime && currentTime >= fixtureStartTime) {
          return {
            cancellable: false,
            reason: `Fixture '${leg.fixtureName}' has already kicked off. Cannot cancel ticket in-play.`,
          };
        }
      }
    }

    return { cancellable: true };
  }

  /**
   * Executes atomic ticket cancellation and refunds escrow stake to user balance
   */
  public cancelTicket(
    ticket: BetSlipRecord,
    graceWindowMinutes: number = 5,
    reason: string = 'User / Cashier requested cancellation within grace window'
  ): CancellationResult {
    const check = this.isCancellable(ticket, graceWindowMinutes);
    if (!check.cancellable) {
      return {
        success: false,
        ticketId: ticket.id,
        refundAmount: 0,
        newBalance: this.ledger.getBalance(ticket.userId),
        error: check.reason,
      };
    }

    // Mark ticket cancelled
    ticket.status = 'CANCELLED';

    // Refund escrow stake back to main wallet balance
    this.ledger.settleVoidBet(ticket.userId, ticket.id, ticket.stake);

    const newBalance = this.ledger.getBalance(ticket.userId);
    console.log(
      `[TicketCancellation] Ticket ${ticket.slipNumber} CANCELLED. Stake of $${ticket.stake} refunded to user ${ticket.userId}. New Balance: $${newBalance}`
    );

    return {
      success: true,
      ticketId: ticket.id,
      refundAmount: ticket.stake,
      newBalance,
      reason,
      cancelledAt: new Date().toISOString(),
    };
  }
}
