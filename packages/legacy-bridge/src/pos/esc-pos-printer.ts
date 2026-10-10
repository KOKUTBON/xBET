/**
 * ESC/POS Thermal Receipt Printer Command Generator
 * Generates raw ESC/POS byte buffers for 80mm and 58mm thermal printers,
 * including cash drawer kick, barcode Code128, QR codes, and paper cuts.
 */

export const Align = {
  LEFT: 0,
  CENTER: 1,
  RIGHT: 2,
} as const;
export type Align = (typeof Align)[keyof typeof Align];

export const PaperWidth = {
  WIDTH_80MM: 48, // 48 columns
  WIDTH_58MM: 32, // 32 columns
} as const;
export type PaperWidth = (typeof PaperWidth)[keyof typeof PaperWidth];

export class EscPosPrinter {
  private buffer: number[] = [];
  public readonly width: PaperWidth;

  constructor(width: PaperWidth = PaperWidth.WIDTH_80MM) {
    this.width = width;
    this.init();
  }

  /**
   * ESC @ - Initialize printer
   */
  public init(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  /**
   * ESC a n - Select alignment (0=Left, 1=Center, 2=Right)
   */
  public align(alignment: Align): this {
    this.buffer.push(0x1b, 0x61, alignment);
    return this;
  }

  /**
   * ESC E n - Bold font toggle (1=on, 0=off)
   */
  public bold(enabled: boolean = true): this {
    this.buffer.push(0x1b, 0x45, enabled ? 1 : 0);
    return this;
  }

  /**
   * GS ! n - Select character size (double width / double height)
   */
  public setTextSize(doubleWidth: boolean = false, doubleHeight: boolean = false): this {
    let n = 0;
    if (doubleWidth) n |= 0x20;
    if (doubleHeight) n |= 0x01;
    this.buffer.push(0x1d, 0x21, n);
    return this;
  }

  /**
   * GS B n - Turn white/black reverse print mode on/off
   */
  public invert(enabled: boolean = true): this {
    this.buffer.push(0x1d, 0x42, enabled ? 1 : 0);
    return this;
  }

  /**
   * Text output
   */
  public text(str: string): this {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      this.buffer.push(code < 128 ? code : 0x3f); // ASCII or '?'
    }
    return this;
  }

  /**
   * Text line with automatic newline (LF)
   */
  public textLine(str: string = ''): this {
    this.text(str);
    this.buffer.push(0x0a);
    return this;
  }

  /**
   * Two-column key-value row formatted to paper width
   */
  public keyValue(left: string, right: string): this {
    const totalCols = this.width;
    const spaceCount = Math.max(1, totalCols - left.length - right.length);
    const line = left + ' '.repeat(spaceCount) + right;
    this.textLine(line.slice(0, totalCols));
    return this;
  }

  /**
   * Horizontal divider line
   */
  public hr(char: string = '-'): this {
    this.textLine(char.repeat(this.width));
    return this;
  }

  /**
   * Empty feed lines
   */
  public feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  /**
   * Code128 Barcode Generation (GS k 73 len data)
   */
  public barcodeCode128(data: string, height: number = 64): this {
    // Set barcode height
    this.buffer.push(0x1d, 0x68, height);
    // Set barcode width (2)
    this.buffer.push(0x1d, 0x77, 2);
    // HRI characters below barcode
    this.buffer.push(0x1d, 0x48, 2);

    // GS k 73 (Code128)
    this.buffer.push(0x1d, 0x6b, 73, data.length);
    for (let i = 0; i < data.length; i++) {
      this.buffer.push(data.charCodeAt(i));
    }
    this.buffer.push(0x0a);
    return this;
  }

  /**
   * QR Code Generation (GS ( k)
   */
  public qrCode(data: string, size: number = 6): this {
    // Model 2
    this.buffer.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Size
    this.buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size);
    // Error correction Level M
    this.buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    // Store data
    const len = data.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);
    this.buffer.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
    for (let i = 0; i < data.length; i++) {
      this.buffer.push(data.charCodeAt(i));
    }
    // Print QR
    this.buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    this.buffer.push(0x0a);
    return this;
  }

  /**
   * ESC p 0 25 250 - Kick Cash Drawer pulse on pin 2
   */
  public openCashDrawer(): this {
    this.buffer.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  /**
   * GS V 0 - Partial or Full Paper Cut
   */
  public cutPaper(fullCut: boolean = false): this {
    this.feed(3);
    this.buffer.push(0x1d, 0x56, fullCut ? 0x00 : 0x01);
    return this;
  }

  /**
   * Returns Uint8Array of raw ESC/POS byte commands
   */
  public toBuffer(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Returns Base64 encoded payload for WebSocket / Web Serial printer bridges
   */
  public toBase64(): string {
    return Buffer.from(this.toBuffer()).toString('base64');
  }
}
