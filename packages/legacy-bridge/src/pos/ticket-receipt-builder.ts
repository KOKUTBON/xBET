/**
 * 1:1 CakePHP Ticket & Cashier Receipt Builder
 * Formats betting slips, reservation tickets, and cashier shift reports into ESC/POS thermal printer streams.
 */

import { EscPosPrinter, Align, PaperWidth } from './esc-pos-printer.ts';

export interface TicketLegPrintData {
  eventId: number | string;
  eventDate?: string;
  eventName: string;
  marketName: string;
  pickName: string;
  odd: number;
}

export interface TicketPrintData {
  id: number | string;
  date: string | Date;
  userId?: number | string;
  userName?: string;
  cashierName?: string;
  branchName?: string;
  currency: string;
  type: 'SINGLE' | 'COMBI' | 'SYSTEM';
  legs: TicketLegPrintData[];
  totalOdd: number;
  stake: number;
  potentialReturn: number;
  combiBoostAmount?: number;
  barcode?: string;
}

export interface ReservationTicketPrintData {
  id: number | string;
  code: string;
  date: string | Date;
  expiresAt: string | Date;
  currency: string;
  legs: TicketLegPrintData[];
  totalOdd: number;
  stake: number;
  potentialReturn: number;
}

export interface TillShiftPrintData {
  reportType: 'X_REPORT' | 'Z_REPORT';
  shiftId: string | number;
  cashierName: string;
  branchName: string;
  openedAt: string | Date;
  closedAt?: string | Date;
  openingFloat: number;
  cashIn: number;
  totalTurnover: number;
  totalPayouts: number;
  netHoldGgr: number;
  cashInDrawer: number;
  currency: string;
}

export class TicketReceiptBuilder {
  /**
   * 1:1 Port of CakePHP admin_printTicket.ctp & print_ticket.ctp
   */
  public static buildTicketReceipt(
    data: TicketPrintData,
    websiteName: string = 'XBET',
    paperWidth: PaperWidth = PaperWidth.WIDTH_80MM
  ): EscPosPrinter {
    const printer = new EscPosPrinter(paperWidth);

    // 1. Header
    printer
      .align(Align.CENTER)
      .setTextSize(true, true)
      .bold(true)
      .textLine(websiteName)
      .setTextSize(false, false)
      .bold(false)
      .textLine(data.branchName ? `Branch: ${data.branchName}` : 'SPORTSBOOK BETTING SLIP')
      .hr('=');

    // 2. Ticket Metadata
    const formattedId = String(data.id).padStart(7, '0');
    const dateStr = typeof data.date === 'string' ? data.date : data.date.toISOString().replace('T', ' ').slice(0, 19);

    printer
      .align(Align.LEFT)
      .keyValue('Ticket ID:', `#${formattedId}`)
      .keyValue('Date/Time:', dateStr);

    if (data.cashierName) {
      printer.keyValue('Cashier:', data.cashierName);
    }
    printer.keyValue('Bet Type:', data.type).hr('-');

    // 3. Bet Legs Table
    for (let i = 0; i < data.legs.length; i++) {
      const leg = data.legs[i];
      printer.bold(true).textLine(`${i + 1}. ${leg.eventName}`).bold(false);
      printer.keyValue(`   Market: ${leg.marketName}`, `Pick: ${leg.pickName}`);
      printer.keyValue(`   Event ID: ${leg.eventId}`, `Odd: ${leg.odd.toFixed(2)}`);
      if (i < data.legs.length - 1) {
        printer.hr('.');
      }
    }
    printer.hr('-');

    // 4. Financial Totals
    printer
      .keyValue('Total Odds:', data.totalOdd.toFixed(2))
      .keyValue('Stake Amount:', `${data.stake.toFixed(2)} ${data.currency}`);

    if (data.combiBoostAmount && data.combiBoostAmount > 0) {
      printer.keyValue('Combi Boost (+):', `+${data.combiBoostAmount.toFixed(2)} ${data.currency}`);
    }

    printer
      .bold(true)
      .setTextSize(false, true)
      .keyValue('Max Payout:', `${data.potentialReturn.toFixed(2)} ${data.currency}`)
      .setTextSize(false, false)
      .bold(false)
      .hr('=');

    // 5. Optical Barcode & QR Code for Cashier Counter Scanning
    const barcodeVal = data.barcode || `TCK${formattedId}`;
    printer
      .align(Align.CENTER)
      .textLine('Scan Barcode to Redeem / Settle')
      .barcodeCode128(barcodeVal, 48)
      .textLine(`* ${barcodeVal} *`)
      .feed(1)
      .textLine('Thank you for playing! Check results at xbet.com')
      .textLine('Terms & conditions apply. 18+ only.')
      .cutPaper(false);

    return printer;
  }

  /**
   * 1:1 Port of CakePHP ReservationTickets/admin_print.ctp
   */
  public static buildReservationReceipt(
    data: ReservationTicketPrintData,
    websiteName: string = 'XBET',
    paperWidth: PaperWidth = PaperWidth.WIDTH_80MM
  ): EscPosPrinter {
    const printer = new EscPosPrinter(paperWidth);
    const dateStr = typeof data.date === 'string' ? data.date : data.date.toISOString().replace('T', ' ').slice(0, 19);
    const expStr = typeof data.expiresAt === 'string' ? data.expiresAt : data.expiresAt.toISOString().replace('T', ' ').slice(0, 19);

    printer
      .align(Align.CENTER)
      .setTextSize(true, true)
      .bold(true)
      .textLine(websiteName)
      .setTextSize(false, false)
      .bold(false)
      .textLine('BOOKED RESERVATION TICKET')
      .hr('=')
      .align(Align.CENTER)
      .setTextSize(true, true)
      .bold(true)
      .textLine(`CODE: ${data.code}`)
      .setTextSize(false, false)
      .bold(false)
      .hr('-')
      .align(Align.LEFT)
      .keyValue('Created At:', dateStr)
      .keyValue('Valid Until:', expStr)
      .hr('-');

    for (let i = 0; i < data.legs.length; i++) {
      const leg = data.legs[i];
      printer.bold(true).textLine(`${i + 1}. ${leg.eventName}`).bold(false);
      printer.keyValue(`   Pick: ${leg.pickName}`, `Odd: ${leg.odd.toFixed(2)}`);
    }

    printer
      .hr('-')
      .keyValue('Total Odds:', data.totalOdd.toFixed(2))
      .keyValue('Reserved Stake:', `${data.stake.toFixed(2)} ${data.currency}`)
      .bold(true)
      .keyValue('Est. Return:', `${data.potentialReturn.toFixed(2)} ${data.currency}`)
      .bold(false)
      .hr('=')
      .align(Align.CENTER)
      .qrCode(data.code, 6)
      .textLine('Present this code to cashier counter to place bet.')
      .textLine('Odds are subject to change until confirmed by counter.')
      .cutPaper(false);

    return printer;
  }

  /**
   * Cashier POS Shift X-Report / Z-Report Receipt
   */
  public static buildTillShiftReceipt(
    data: TillShiftPrintData,
    websiteName: string = 'XBET',
    paperWidth: PaperWidth = PaperWidth.WIDTH_80MM
  ): EscPosPrinter {
    const printer = new EscPosPrinter(paperWidth);
    const title = data.reportType === 'Z_REPORT' ? 'DAILY TILL CLOSE (Z-REPORT)' : 'SHIFT AUDIT (X-REPORT)';

    printer
      .align(Align.CENTER)
      .bold(true)
      .textLine(websiteName)
      .textLine(title)
      .bold(false)
      .hr('=')
      .align(Align.LEFT)
      .keyValue('Branch:', data.branchName)
      .keyValue('Cashier:', data.cashierName)
      .keyValue('Shift ID:', String(data.shiftId))
      .keyValue('Opened:', String(data.openedAt).slice(0, 19));

    if (data.closedAt) {
      printer.keyValue('Closed:', String(data.closedAt).slice(0, 19));
    }
    printer.hr('-');

    printer
      .keyValue('Opening Float:', `${data.openingFloat.toFixed(2)} ${data.currency}`)
      .keyValue('Gross Turnover (Stakes):', `${data.totalTurnover.toFixed(2)} ${data.currency}`)
      .keyValue('Total Payouts Won:', `-${data.totalPayouts.toFixed(2)} ${data.currency}`)
      .hr('-')
      .bold(true)
      .keyValue('Gross Gaming Rev (GGR):', `${data.netHoldGgr.toFixed(2)} ${data.currency}`)
      .keyValue('Cash Expected in Drawer:', `${data.cashInDrawer.toFixed(2)} ${data.currency}`)
      .bold(false)
      .hr('=')
      .align(Align.CENTER)
      .textLine('--- END OF REPORT ---')
      .openCashDrawer()
      .cutPaper(true);

    return printer;
  }
}
