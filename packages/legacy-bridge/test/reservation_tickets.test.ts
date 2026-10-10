/**
 * Shop & Cashier Offline Reservation Ticket Flow Test Suite
 * Tests booking code generation, kiosk barcode scanning, kickoff protection,
 * live odds movement detection, cash acceptance, and official slip conversion.
 */

import {
  ReservationTicketManager,
  ReservationStatus,
} from '../src/tickets/reservation-ticket-manager.ts';
import { TicketManager } from '../src/tickets/ticket-manager.ts';

async function runReservationTicketTests() {
  console.log('===============================================================');
  console.log('  🎫 Running Shop & Cashier Reservation Ticket Test Suite      ');
  console.log('===============================================================');

  const reservationManager = ReservationTicketManager.getInstance();
  const ticketManager = TicketManager.getInstance();

  const futureKickoff1 = new Date(Date.now() + 4 * 60 * 60 * 1000); // In 4 hours
  const futureKickoff2 = new Date(Date.now() + 6 * 60 * 60 * 1000); // In 6 hours
  const pastKickoff = new Date(Date.now() - 30 * 60 * 1000); // 30 mins ago

  // --------------------------------------------------------------------------
  // Test 1: Create 2-Leg Combi Reservation Ticket
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Generating Offline Reservation Ticket (2-Leg Combi)...');
  const reservation = reservationManager.createReservation({
    stake: 50.0,
    serviceFee: 1.0,
    currencyCode: 'EUR',
    legs: [
      {
        fixtureId: 'fix-arsenal-chelsea',
        fixtureName: 'Arsenal vs Chelsea',
        marketId: 'mkt-1x2',
        marketName: '1X2',
        selectionId: 'sel-home',
        selectionName: 'Arsenal',
        reservedOdds: 2.10,
        kickoffTime: futureKickoff1,
      },
      {
        fixtureId: 'fix-madrid-barca',
        fixtureName: 'Real Madrid vs Barcelona',
        marketId: 'mkt-ou-25',
        marketName: 'Over/Under 2.5',
        selectionId: 'sel-over',
        selectionName: 'Over 2.5 Goals',
        reservedOdds: 1.85,
        kickoffTime: futureKickoff2,
      },
    ],
  });

  console.log(`  Booking Code: ${reservation.bookingCode} | Barcode: ${reservation.barcode}`);
  console.log(`  Stake: €${reservation.stake} + Fee: €${reservation.serviceFee} = Total €${reservation.totalStake}`);
  console.log(`  Total Odds: ${reservation.totalOdds} | Potential Return: €${reservation.potentialPayout}`);

  if (!reservation.bookingCode.startsWith('BKG-')) throw new Error('Invalid booking code format');
  if (!reservation.barcode.startsWith('RB')) throw new Error('Invalid barcode format');
  if (reservation.totalOdds !== 3.89 || reservation.potentialPayout !== 194.50) {
    throw new Error('Total odds or potential payout calculation incorrect');
  }
  if (reservation.status !== ReservationStatus.RESERVED) throw new Error('Initial status should be RESERVED');
  console.log('  ✅ Test 1 Passed: Reservation ticket created with valid code, barcode, and odds.');

  // --------------------------------------------------------------------------
  // Test 2: Fast POS Counter Lookup by Barcode & Booking Code
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing POS Counter Lookup (Scanner Barcode & Code Entry)...');
  const foundByBarcode = reservationManager.getReservation(`*${reservation.barcode}*`);
  const foundByCode = reservationManager.getReservation(reservation.bookingCode.toLowerCase());

  if (!foundByBarcode || foundByBarcode.id !== reservation.id) {
    throw new Error('Lookup by scanned barcode failed');
  }
  if (!foundByCode || foundByCode.id !== reservation.id) {
    throw new Error('Lookup by lowercase booking code failed');
  }
  console.log(`  Found reservation by barcode [${reservation.barcode}] and code [${reservation.bookingCode}]`);
  console.log('  ✅ Test 2 Passed: POS barcode scanning and case-insensitive code lookup verified.');

  // --------------------------------------------------------------------------
  // Test 3: Kickoff Guard (Rejection when Match Already Started)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Kickoff Guard for Past/In-Play Matches...');
  const startedReservation = reservationManager.createReservation({
    stake: 20.0,
    legs: [
      {
        fixtureId: 'fix-bayern-dortmund',
        fixtureName: 'Bayern Munich vs Borussia Dortmund',
        marketId: 'mkt-1x2',
        marketName: '1X2',
        selectionId: 'sel-home',
        selectionName: 'Bayern Munich',
        reservedOdds: 1.65,
        kickoffTime: pastKickoff, // Started 30 mins ago
      },
    ],
  });

  const revalResult = reservationManager.revalidateReservation(startedReservation.bookingCode);
  console.log(`  Revalidation valid: ${revalResult.valid} | Reasons:`, revalResult.reasons);
  const hasKickoffOrExpired = revalResult.reasons.some(
    (r) => r.includes('already kicked off') || r.includes('expired')
  );
  if (revalResult.valid !== false || !hasKickoffOrExpired) {
    throw new Error('Kickoff guard failed to reject started match');
  }

  // Ensure Cashier conversion throws error
  try {
    reservationManager.convertReservationToTicket({
      bookingCode: startedReservation.bookingCode,
      cashierId: 'CSH-07',
      cashReceived: 20.0,
    });
    throw new Error('Should have blocked conversion of started match');
  } catch (err: any) {
    console.log(`  Blocked conversion as expected: ${err.message}`);
    if (!err.message.includes('REVALIDATION_FAILED')) throw err;
  }
  console.log('  ✅ Test 3 Passed: Kickoff guard prevented placement on started match.');

  // --------------------------------------------------------------------------
  // Test 4: Live Odds Movement Detection
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Live Odds Shift Detection during Counter Check-in...');
  const oddsShiftReval = reservationManager.revalidateReservation(
    reservation.bookingCode,
    (fixtureId, selectionId) => {
      if (fixtureId === 'fix-arsenal-chelsea' && selectionId === 'sel-home') {
        return { currentOdds: 1.95, isStarted: false, isActive: true }; // Shifted 2.10 -> 1.95
      }
      return { currentOdds: 1.85, isStarted: false, isActive: true };
    }
  );

  console.log(`  Odds shift detected: ${oddsShiftReval.hasOddsChanges} | Deltas:`, oddsShiftReval.oddsDeltas);
  if (!oddsShiftReval.hasOddsChanges || oddsShiftReval.oddsDeltas.length !== 1) {
    throw new Error('Failed to detect odds movement');
  }
  if (oddsShiftReval.oddsDeltas[0].reservedOdds !== 2.10 || oddsShiftReval.oddsDeltas[0].currentOdds !== 1.95) {
    throw new Error('Odds delta values mismatch');
  }
  console.log('  ✅ Test 4 Passed: Live odds movement successfully flagged for cashier.');

  // --------------------------------------------------------------------------
  // Test 5: Cashier Cash Acceptance & Official Ticket Conversion
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Converting Reservation to Official Ticket at Counter...');
  const conversionResult = reservationManager.convertReservationToTicket({
    bookingCode: reservation.bookingCode,
    cashierId: 'CSH-104',
    branchId: 'BR-LONDON-01',
    cashReceived: 60.0, // Customer pays €60 for €51 total stake
    oddsFormat: 'DECIMAL',
  });

  const { ticket, reservation: updatedRes, thermalReceipt, changeDue } = conversionResult;
  console.log(`  Converted to Official Slip: ${ticket.slipNumber} (Barcode: ${ticket.barcode})`);
  console.log(`  Cash Received: €60.00 | Total Required: €${updatedRes.totalStake} | Change Due: €${changeDue.toFixed(2)}`);
  console.log(`  Thermal Receipt Markup Length: ${thermalReceipt.length} characters`);

  if (updatedRes.status !== ReservationStatus.CONVERTED || !updatedRes.convertedTicketId) {
    throw new Error('Reservation was not marked as CONVERTED');
  }
  if (changeDue !== 9.0) throw new Error('Change due calculation error');
  if (!thermalReceipt.includes(ticket.slipNumber)) {
    throw new Error('Thermal receipt does not contain official slip number');
  }

  const officialTicketInManager = ticketManager.getTicketById(ticket.id);
  if (!officialTicketInManager || officialTicketInManager.status !== 'PENDING') {
    throw new Error('Official ticket record missing from TicketManager');
  }
  console.log('  ✅ Test 5 Passed: Full POS counter conversion, change calculation, and receipt generation verified.');

  // --------------------------------------------------------------------------
  // Test 6: Prevention of Double Conversion (Idempotency)
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Double Conversion Prevention...');
  try {
    reservationManager.convertReservationToTicket({
      bookingCode: reservation.bookingCode,
      cashierId: 'CSH-104',
      cashReceived: 60.0,
    });
    throw new Error('Should have prevented double conversion');
  } catch (err: any) {
    console.log(`  Blocked as expected: ${err.message}`);
    if (!err.message.includes('CANNOT_CONVERT')) throw err;
  }
  console.log('  ✅ Test 6 Passed: Double conversion attempt rejected.');

  // --------------------------------------------------------------------------
  // Test 7: Reservation Cancellation
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing Customer Reservation Cancellation...');
  const cancelRes = reservationManager.createReservation({
    stake: 15.0,
    legs: [
      {
        fixtureId: 'fix-liverpool-city',
        fixtureName: 'Liverpool vs Man City',
        marketId: 'mkt-1x2',
        marketName: '1X2',
        selectionId: 'sel-home',
        selectionName: 'Liverpool',
        reservedOdds: 2.40,
        kickoffTime: futureKickoff1,
      },
    ],
  });

  const cancelled = reservationManager.cancelReservation(cancelRes.bookingCode, 'Customer changed mind');
  console.log(`  Reservation status after cancellation: ${cancelled.status}`);
  if (cancelled.status !== ReservationStatus.CANCELLED) {
    throw new Error('Cancellation failed to update status');
  }
  console.log('  ✅ Test 7 Passed: Reservation cancelled cleanly.');

  // --------------------------------------------------------------------------
  // Test 8: Reservation Expiration Sweeper
  // --------------------------------------------------------------------------
  console.log('\n[Test 8] Testing Automatic Expiration Sweeper...');
  const expiredRes = reservationManager.createReservation({
    stake: 10.0,
    ttlHours: -1, // Expired 1 hour ago
    legs: [
      {
        fixtureId: 'fix-juve-inter',
        fixtureName: 'Juventus vs Inter',
        marketId: 'mkt-1x2',
        marketName: '1X2',
        selectionId: 'sel-away',
        selectionName: 'Inter',
        reservedOdds: 2.25,
        kickoffTime: futureKickoff2,
      },
    ],
  });

  const sweptCount = reservationManager.sweepExpiredReservations();
  console.log(`  Sweeper processed ${sweptCount} expired reservations`);
  const sweptRes = reservationManager.getReservation(expiredRes.bookingCode);
  if (sweptRes?.status !== ReservationStatus.EXPIRED) {
    throw new Error('Sweeper failed to mark expired reservation');
  }
  console.log('  ✅ Test 8 Passed: Expiration sweeper operated successfully.');

  console.log('\n===============================================================');
  console.log('  🎉 All Shop & Cashier Reservation Ticket Tests Passed!       ');
  console.log('===============================================================');
  process.exit(0);
}

runReservationTicketTests().catch((err) => {
  console.error('❌ Reservation Ticket Tests failed:', err);
  process.exit(1);
});
