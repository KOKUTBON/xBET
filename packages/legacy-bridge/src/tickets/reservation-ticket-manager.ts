/**
 * Offline Betting Shop & POS Cashier Reservation Ticket Manager
 * Handles pre-match booking codes, kiosk thermal barcode scanning,
 * live odds re-validation, cashier counter cash acceptance, and official slip conversion.
 */

import { randomUUID } from 'crypto';
import { TicketManager } from './ticket-manager.ts';
import type { LegacyTicketRecord } from './ticket-manager.ts';
import type { OddsFormat } from './odds-formatter.ts';

export const ReservationStatus = {
  RESERVED: 'RESERVED',
  CONVERTED: 'CONVERTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

export interface ReservationLeg {
  fixtureId: string;
  fixtureName: string;
  marketId: string;
  marketName: string;
  selectionId: string;
  selectionName: string;
  reservedOdds: number;
  kickoffTime: Date;
}

export interface ReservationTicket {
  id: string;
  bookingCode: string;
  barcode: string;
  userId?: string;
  type: 'SINGLE' | 'COMBI' | 'SYSTEM';
  stake: number;
  serviceFee: number;
  totalStake: number;
  totalOdds: number;
  potentialPayout: number;
  currencyCode: string;
  status: ReservationStatus;
  createdAt: Date;
  expiresAt: Date;
  convertedTicketId?: string;
  convertedAt?: Date | null;
  convertedByCashierId?: string | null;
  legs: ReservationLeg[];
}

export interface RevalidationResult {
  valid: boolean;
  bookingCode: string;
  reasons: string[];
  hasOddsChanges: boolean;
  oddsDeltas: Array<{
    fixtureName: string;
    selectionName: string;
    reservedOdds: number;
    currentOdds: number;
  }>;
  earliestKickoff: Date;
  isExpired: boolean;
}

export interface LiveLookupData {
  currentOdds: number;
  isStarted: boolean;
  isActive: boolean;
}

export class ReservationTicketManager {
  private static instance: ReservationTicketManager;
  private reservations: Map<string, ReservationTicket> = new Map();
  private codeIndex: Map<string, string> = new Map(); // bookingCode / barcode -> id
  private ticketManager: TicketManager;

  private constructor() {
    this.ticketManager = TicketManager.getInstance();
  }

  public static getInstance(): ReservationTicketManager {
    if (!ReservationTicketManager.instance) {
      ReservationTicketManager.instance = new ReservationTicketManager();
    }
    return ReservationTicketManager.instance;
  }

  /**
   * Generates a new offline reservation ticket with unique booking code and barcode
   */
  public createReservation(params: {
    userId?: string;
    type?: 'SINGLE' | 'COMBI' | 'SYSTEM';
    stake: number;
    serviceFee?: number;
    currencyCode?: string;
    ttlHours?: number;
    legs: ReservationLeg[];
  }): ReservationTicket {
    if (!params.legs || params.legs.length === 0) {
      throw new Error('INVALID_RESERVATION: At least one selection leg is required');
    }
    if (params.stake <= 0) {
      throw new Error('INVALID_STAKE: Stake amount must be greater than 0');
    }

    const id = randomUUID();
    const randAlpha = Math.random().toString(36).substring(2, 8).toUpperCase();
    const randDigits = Math.floor(1000 + Math.random() * 9000);
    const bookingCode = `BKG-${randAlpha}`;
    const barcode = `RB${randDigits}${Date.now().toString().slice(-4)}`;

    const serviceFee = params.serviceFee || 0.0;
    const totalStake = parseFloat((params.stake + serviceFee).toFixed(2));
    const totalOdds = parseFloat(params.legs.reduce((acc, l) => acc * l.reservedOdds, 1.0).toFixed(2));
    const potentialPayout = parseFloat((params.stake * totalOdds).toFixed(2));

    const createdAt = new Date();
    const defaultTtlMs = (params.ttlHours || 24) * 60 * 60 * 1000;
    const ttlExpiration = new Date(createdAt.getTime() + defaultTtlMs);

    // SLIP expires whenever the earliest match kicks off or TTL elapses
    const earliestKickoff = params.legs.reduce((earliest, l) => {
      const kTime = new Date(l.kickoffTime);
      return kTime < earliest ? kTime : earliest;
    }, ttlExpiration);

    const expiresAt = earliestKickoff < ttlExpiration ? earliestKickoff : ttlExpiration;

    const reservation: ReservationTicket = {
      id,
      bookingCode,
      barcode,
      userId: params.userId,
      type: params.type || (params.legs.length > 1 ? 'COMBI' : 'SINGLE'),
      stake: params.stake,
      serviceFee,
      totalStake,
      totalOdds,
      potentialPayout,
      currencyCode: params.currencyCode || 'USD',
      status: ReservationStatus.RESERVED,
      createdAt,
      expiresAt,
      legs: params.legs,
    };

    this.reservations.set(id, reservation);
    this.codeIndex.set(bookingCode.toUpperCase(), id);
    this.codeIndex.set(barcode.toUpperCase(), id);

    console.log(
      `[Reservation] Created Booking ${bookingCode} (Barcode: ${barcode}) | Stake: $${totalStake} | Legs: ${params.legs.length} | Expires: ${expiresAt.toISOString()}`
    );
    return reservation;
  }

  /**
   * Fast lookup for POS barcode scanners and manual booking code entry
   */
  public getReservation(query: string): ReservationTicket | undefined {
    const cleanQuery = query.replace(/[* ]/g, '').toUpperCase();
    const id = this.codeIndex.get(cleanQuery);
    if (id) return this.reservations.get(id);
    return Array.from(this.reservations.values()).find(
      (r) => r.bookingCode.toUpperCase() === cleanQuery || r.barcode.toUpperCase() === cleanQuery || r.id === query
    );
  }

  /**
   * Revalidates reservation events, kickoff times, and live odds movements
   */
  public revalidateReservation(
    queryCode: string,
    liveOddsLookup?: (fixtureId: string, selectionId: string) => LiveLookupData | undefined
  ): RevalidationResult {
    const reservation = this.getReservation(queryCode);
    if (!reservation) {
      return {
        valid: false,
        bookingCode: queryCode,
        reasons: [`Booking code '${queryCode}' not found`],
        hasOddsChanges: false,
        oddsDeltas: [],
        earliestKickoff: new Date(),
        isExpired: true,
      };
    }

    const reasons: string[] = [];
    const now = new Date();
    const isExpired = reservation.status === ReservationStatus.EXPIRED || now >= reservation.expiresAt;

    if (reservation.status === ReservationStatus.CONVERTED) {
      reasons.push(`Reservation already converted to official Ticket #${reservation.convertedTicketId}`);
    } else if (reservation.status === ReservationStatus.CANCELLED) {
      reasons.push('Reservation was cancelled');
    } else if (isExpired) {
      reasons.push(`Reservation expired at ${reservation.expiresAt.toISOString()}`);
    }

    const oddsDeltas: Array<{
      fixtureName: string;
      selectionName: string;
      reservedOdds: number;
      currentOdds: number;
    }> = [];

    for (const leg of reservation.legs) {
      const legKickoff = new Date(leg.kickoffTime);
      if (now >= legKickoff) {
        reasons.push(`Event '${leg.fixtureName}' already kicked off at ${legKickoff.toISOString()}`);
      }

      if (liveOddsLookup) {
        const live = liveOddsLookup(leg.fixtureId, leg.selectionId);
        if (live) {
          if (live.isStarted) {
            reasons.push(`Event '${leg.fixtureName}' has started (In-Play)`);
          }
          if (!live.isActive) {
            reasons.push(`Market for '${leg.fixtureName} - ${leg.selectionName}' is currently suspended`);
          }
          if (Math.abs(live.currentOdds - leg.reservedOdds) > 0.001) {
            oddsDeltas.push({
              fixtureName: leg.fixtureName,
              selectionName: leg.selectionName,
              reservedOdds: leg.reservedOdds,
              currentOdds: live.currentOdds,
            });
          }
        }
      }
    }

    return {
      valid: reasons.length === 0,
      bookingCode: reservation.bookingCode,
      reasons,
      hasOddsChanges: oddsDeltas.length > 0,
      oddsDeltas,
      earliestKickoff: reservation.expiresAt,
      isExpired,
    };
  }

  /**
   * Cashier converts reservation into official immutable bet ticket upon cash acceptance
   */
  public convertReservationToTicket(params: {
    bookingCode: string;
    cashierId: string;
    branchId?: string;
    cashReceived: number;
    oddsFormat?: OddsFormat;
    liveOddsLookup?: (fixtureId: string, selectionId: string) => LiveLookupData | undefined;
  }): {
    ticket: LegacyTicketRecord;
    reservation: ReservationTicket;
    thermalReceipt: string;
    changeDue: number;
  } {
    const reservation = this.getReservation(params.bookingCode);
    if (!reservation) {
      throw new Error(`RESERVATION_NOT_FOUND: Booking code '${params.bookingCode}' not found`);
    }

    if (reservation.status !== ReservationStatus.RESERVED) {
      throw new Error(`CANNOT_CONVERT: Reservation is already in status '${reservation.status}'`);
    }

    // 1. Run revalidation
    const validation = this.revalidateReservation(params.bookingCode, params.liveOddsLookup);
    if (!validation.valid) {
      throw new Error(`REVALIDATION_FAILED: ${validation.reasons.join('; ')}`);
    }

    // 2. Validate cash tender
    if (params.cashReceived < reservation.totalStake) {
      throw new Error(
        `INSUFFICIENT_CASH: Total required is $${reservation.totalStake.toFixed(2)}, received $${params.cashReceived.toFixed(2)}`
      );
    }
    const changeDue = parseFloat((params.cashReceived - reservation.totalStake).toFixed(2));

    // 3. Place official ticket in TicketManager
    const officialTicket = this.ticketManager.placeTicket({
      userId: reservation.userId || `pos-guest-${params.cashierId}`,
      branchId: params.branchId || 'BR-01',
      cashierId: params.cashierId,
      betType: reservation.type,
      stake: reservation.stake,
      currencyCode: reservation.currencyCode,
      legs: reservation.legs.map((l) => ({
        selectionId: l.selectionId,
        selectionName: l.selectionName,
        marketName: l.marketName,
        fixtureName: l.fixtureName,
        lockedOdds: l.reservedOdds,
      })),
    });

    // 4. Mark reservation as CONVERTED
    reservation.status = ReservationStatus.CONVERTED;
    reservation.convertedTicketId = officialTicket.id;
    reservation.convertedAt = new Date();
    reservation.convertedByCashierId = params.cashierId;

    // 5. Generate official thermal receipt
    const thermalReceipt = this.ticketManager.printThermalReceipt(officialTicket.id, params.oddsFormat || 'DECIMAL');

    console.log(
      `[POS Counter] Booking ${reservation.bookingCode} CONVERTED -> Ticket #${officialTicket.slipNumber} by Cashier ${params.cashierId} (Cash: $${params.cashReceived}, Change: $${changeDue})`
    );

    return {
      ticket: officialTicket,
      reservation,
      thermalReceipt,
      changeDue,
    };
  }

  /**
   * Cancels a pending reservation
   */
  public cancelReservation(queryCode: string, reason?: string): ReservationTicket {
    const reservation = this.getReservation(queryCode);
    if (!reservation) throw new Error(`Reservation '${queryCode}' not found`);

    if (reservation.status !== ReservationStatus.RESERVED) {
      throw new Error(`CANNOT_CANCEL: Reservation is in status '${reservation.status}'`);
    }

    reservation.status = ReservationStatus.CANCELLED;
    console.log(`[Reservation] Booking ${reservation.bookingCode} CANCELLED: ${reason || 'User cancelled'}`);
    return reservation;
  }

  /**
   * Sweeps and expires outdated reservations
   */
  public sweepExpiredReservations(): number {
    const now = new Date();
    let expiredCount = 0;

    for (const res of this.reservations.values()) {
      if (res.status === ReservationStatus.RESERVED && now >= res.expiresAt) {
        res.status = ReservationStatus.EXPIRED;
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`[Reservation] Swept ${expiredCount} expired reservations`);
    }
    return expiredCount;
  }

  public getAllReservations(): ReservationTicket[] {
    return Array.from(this.reservations.values());
  }
}
