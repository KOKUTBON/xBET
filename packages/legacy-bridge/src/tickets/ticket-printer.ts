import { OddsFormatter } from './odds-formatter.ts';
import type { OddsFormat } from './odds-formatter.ts';

export interface PrintableTicketData {
  slipNumber: string;
  barcode: string;
  securityCode: string;
  branchName?: string;
  cashierName?: string;
  createdAt: Date;
  betType: string;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  currencyCode?: string;
  legs: Array<{
    fixtureName: string;
    marketName: string;
    selectionName: string;
    lockedOdds: number;
    eventDate?: string;
  }>;
}

export class TicketPrinter {
  /**
   * Generates clean HTML optimized for thermal receipt printers (80mm / 58mm)
   */
  public static generateThermalHtml(ticket: PrintableTicketData, oddsFormat: OddsFormat = 'DECIMAL'): string {
    const currency = ticket.currencyCode || 'USD';
    const formattedTotalOdds = OddsFormatter.format(ticket.totalOdds, oddsFormat);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bet Ticket - ${ticket.slipNumber}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 72mm;
      margin: 4mm auto;
      padding: 0;
      color: #000;
      background: #fff;
      font-size: 11px;
      line-height: 1.2;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 5px 0; }
    .double-divider { border-top: 2px solid #000; margin: 6px 0; }
    .header { font-size: 14px; font-weight: bold; text-transform: uppercase; }
    .barcode-container { text-align: center; margin: 8px 0; }
    .barcode-text { font-size: 14px; letter-spacing: 2px; font-weight: bold; }
    .leg-row { margin-bottom: 4px; }
    .flex-row { display: flex; justify-content: space-between; }
  </style>
</head>
<body onload="window.print()">
  <div class="text-center header">XBET SPORTSBOOK</div>
  <div class="text-center">${ticket.branchName || 'Retail Branch #01'}</div>
  <div class="text-center">Cashier: ${ticket.cashierName || 'Operator #12'}</div>
  <div class="text-center">${ticket.createdAt.toLocaleString()}</div>
  
  <div class="double-divider"></div>

  <div class="flex-row bold">
    <span>TICKET NO:</span>
    <span>${ticket.slipNumber}</span>
  </div>
  <div class="flex-row">
    <span>BET TYPE:</span>
    <span class="bold">${ticket.betType}</span>
  </div>

  <div class="divider"></div>

  <!-- Legs -->
  ${ticket.legs
    .map(
      (leg, idx) => `
    <div class="leg-row">
      <div class="bold">${idx + 1}. ${leg.fixtureName}</div>
      <div class="flex-row">
        <span>${leg.marketName}: ${leg.selectionName}</span>
        <span class="bold">@ ${OddsFormatter.format(leg.lockedOdds, oddsFormat)}</span>
      </div>
      ${leg.eventDate ? `<div style="font-size:9px; color:#555;">Kickoff: ${leg.eventDate}</div>` : ''}
    </div>
    <div class="divider"></div>
  `
    )
    .join('')}

  <!-- Financial Summary -->
  <div class="flex-row">
    <span>TOTAL ODDS:</span>
    <span class="bold">${formattedTotalOdds}</span>
  </div>
  <div class="flex-row">
    <span>TOTAL STAKE:</span>
    <span class="bold">${ticket.stake.toFixed(2)} ${currency}</span>
  </div>
  <div class="flex-row bold" style="font-size: 13px; margin-top: 4px;">
    <span>POTENTIAL PAYOUT:</span>
    <span>${ticket.potentialPayout.toFixed(2)} ${currency}</span>
  </div>

  <div class="double-divider"></div>

  <!-- Barcode & Verification -->
  <div class="barcode-container">
    <div class="barcode-text">*${ticket.barcode}*</div>
    <div style="font-size: 9px; margin-top: 2px;">SEC CODE: ${ticket.securityCode}</div>
  </div>

  <div class="text-center" style="font-size: 9px; margin-top: 6px;">
    Keep this ticket safe. Winnings are valid for 30 days from settlement.
  </div>
</body>
</html>
    `.trim();
  }
}
