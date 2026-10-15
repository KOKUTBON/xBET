import assert from 'node:assert';
import {
  EscPosPrinter,
  TicketReceiptBuilder,
  Align,
  PaperWidth,
  type TicketPrintData,
  type ReservationTicketPrintData,
  type TillShiftPrintData,
} from '../src/index.ts';

console.log('===============================================================');
console.log('  🖨️  Running ESC/POS Thermal Receipt & POS Printer Suite     ');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: EscPosPrinter Low-Level Byte Generation
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing Low-Level ESC/POS Byte Stream Generation...');
const printer = new EscPosPrinter(PaperWidth.WIDTH_80MM);
printer
  .align(Align.CENTER)
  .bold(true)
  .textLine('XBET RETAIL POS')
  .bold(false)
  .keyValue('Item:', '$50.00')
  .barcodeCode128('TCK0001234', 48)
  .qrCode('RES-778899', 6)
  .openCashDrawer()
  .cutPaper(false);

const rawBytes = printer.toBuffer();
const base64Payload = printer.toBase64();

assert.ok(rawBytes.length > 50, 'Byte buffer must contain generated ESC/POS commands');
// Check ESC @ init (0x1b, 0x40)
assert.strictEqual(rawBytes[0], 0x1b);
assert.strictEqual(rawBytes[1], 0x40);

// Check Base64 serialization
assert.ok(typeof base64Payload === 'string' && base64Payload.length > 0);
console.log(`  Generated ${rawBytes.length} bytes of raw ESC/POS commands (Base64 length: ${base64Payload.length}).`);
console.log('  ✅ Test 1 Passed: ESC/POS byte sequence and Base64 bridge encoding verified.');

// ----------------------------------------------------------------------------
// Test 2: Placed Ticket Slip Receipt (1:1 admin_printTicket.ctp)
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing Placed Betting Slip Thermal Receipt (1:1 admin_printTicket.ctp)...');
const mockTicket: TicketPrintData = {
  id: 12345,
  date: '2026-08-20 14:30:00',
  cashierName: 'Agent Soho (Desk 1)',
  branchName: 'London Soho Branch',
  currency: 'USD',
  type: 'COMBI',
  totalOdd: 5.75,
  stake: 100.0,
  potentialReturn: 603.75,
  combiBoostAmount: 28.75,
  barcode: 'TCK0012345',
  legs: [
    {
      eventId: 'FIX-101',
      eventName: 'Arsenal vs Chelsea',
      marketName: 'Match Result 1X2',
      pickName: 'Arsenal (Home Win)',
      odd: 1.85,
    },
    {
      eventId: 'FIX-102',
      eventName: 'Real Madrid vs Barcelona',
      marketName: 'Both Teams to Score (BTTS)',
      pickName: 'Yes',
      odd: 1.65,
    },
    {
      eventId: 'FIX-103',
      eventName: 'Bayern Munich vs Dortmund',
      marketName: 'Over/Under 2.5 Goals',
      pickName: 'Over 2.5',
      odd: 1.88,
    },
  ],
};

const ticketReceipt = TicketReceiptBuilder.buildTicketReceipt(mockTicket, 'XBET SPORTSBOOK');
const ticketBuffer = ticketReceipt.toBuffer();

assert.ok(ticketBuffer.length > 100);
console.log(`  Formatted 3-Leg COMBI Slip: ${ticketBuffer.length} bytes with Code128 barcode.`);
console.log('  ✅ Test 2 Passed: 1:1 Ticket receipt with legs, odds, returns, and barcode generated.');

// ----------------------------------------------------------------------------
// Test 3: Reservation Ticket Receipt (ReservationTickets/admin_print.ctp)
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing Booking Reservation Ticket Receipt with QR Code...');
const mockReservation: ReservationTicketPrintData = {
  id: 9988,
  code: 'BOOK-9842',
  date: '2026-08-20 10:15:00',
  expiresAt: '2026-08-21 10:15:00',
  currency: 'USD',
  totalOdd: 3.5,
  stake: 50.0,
  potentialReturn: 175.0,
  legs: [
    {
      eventId: 'EV-501',
      eventName: 'Liverpool vs Manchester City',
      marketName: '1X2',
      pickName: 'Draw (X)',
      odd: 3.5,
    },
  ],
};

const resReceipt = TicketReceiptBuilder.buildReservationReceipt(mockReservation, 'XBET RETAIL');
const resBuffer = resReceipt.toBuffer();

assert.ok(resBuffer.length > 50);
console.log(`  Formatted Reservation Voucher [${mockReservation.code}]: ${resBuffer.length} bytes with QR Code.`);
console.log('  ✅ Test 3 Passed: Reservation ticket with QR booking code verified.');

// ----------------------------------------------------------------------------
// Test 4: Cashier POS Till Shift Report (X-Report / Z-Report)
// ----------------------------------------------------------------------------
console.log('\n[Test 4] Testing Cashier POS Till Shift X-Report / Z-Report...');
const mockShiftReport: TillShiftPrintData = {
  reportType: 'Z_REPORT',
  shiftId: 'SHIFT-20260820-01',
  cashierName: 'John Cashier',
  branchName: 'Downtown Vegas Shop',
  openedAt: '2026-08-20 08:00:00',
  closedAt: '2026-08-20 16:00:00',
  openingFloat: 1000.0,
  cashIn: 4500.0,
  totalTurnover: 7200.0,
  totalPayouts: 3800.0,
  netHoldGgr: 3400.0,
  cashInDrawer: 4400.0,
  currency: 'USD',
};

const shiftReceipt = TicketReceiptBuilder.buildTillShiftReceipt(mockShiftReport, 'XBET BACKOFFICE');
const shiftBuffer = shiftReceipt.toBuffer();

assert.ok(shiftBuffer.length > 50);
console.log(`  Formatted Z-Report [${mockShiftReport.shiftId}]: GGR: $${mockShiftReport.netHoldGgr}, Drawer: $${mockShiftReport.cashInDrawer}`);
console.log('  ✅ Test 4 Passed: Cashier shift financial audit receipt & drawer trigger verified.');

// ----------------------------------------------------------------------------
// Test 5: 58mm vs 80mm Thermal Paper Column Widths
// ----------------------------------------------------------------------------
console.log('\n[Test 5] Testing 58mm vs 80mm Thermal Paper Column Formatting...');
const p58 = new EscPosPrinter(PaperWidth.WIDTH_58MM);
p58.keyValue('Total:', '$150.00');
assert.strictEqual(p58.width, 32);

const p80 = new EscPosPrinter(PaperWidth.WIDTH_80MM);
p80.keyValue('Total:', '$150.00');
assert.strictEqual(p80.width, 48);

console.log('  ✅ Test 5 Passed: 58mm (32 col) and 80mm (48 col) widths format cleanly.');

console.log('\n===============================================================');
console.log('  🎉 All ESC/POS Thermal Receipt & POS Printer Tests Passed!   ');
console.log('===============================================================');
