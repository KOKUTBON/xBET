/**
 * Converted CakePHP Currency Model
 * Handles 1:1 Currency codes, exchange rates, and multi-currency conversions.
 */

import { AppModel } from './AppModel.ts';

export interface CurrencyRecord {
  id: number;
  name: string;
  code: string;
  rate: number;
}

export class Currency extends AppModel {
  private currencies: Map<number, CurrencyRecord> = new Map();

  constructor() {
    super('Currency', 'currencies');
    this.displayField = 'name';
    this.seedDefaultCurrencies();
  }

  private seedDefaultCurrencies(): void {
    this.currencies.set(1, { id: 1, name: 'US Dollar', code: 'USD', rate: 1.0 });
    this.currencies.set(2, { id: 2, name: 'Euro', code: 'EUR', rate: 0.92 });
    this.currencies.set(3, { id: 3, name: 'British Pound', code: 'GBP', rate: 0.79 });
    this.currencies.set(4, { id: 4, name: 'Nigerian Naira', code: 'NGN', rate: 1500.0 });
    this.currencies.set(5, { id: 5, name: 'Kenyan Shilling', code: 'KES', rate: 130.0 });
    this.currencies.set(6, { id: 6, name: 'Ghanaian Cedi', code: 'GHS', rate: 14.5 });
  }

  /**
   * 1:1 Port of Currency::getCode($id)
   */
  public getCode(id: number): string | null {
    const cur = this.currencies.get(id);
    return cur ? cur.code : null;
  }

  /**
   * 1:1 Port of Currency::getList()
   */
  public getList(): Record<number, string> {
    const list: Record<number, string> = {};
    for (const [id, cur] of this.currencies.entries()) {
      list[id] = cur.name;
    }
    return list;
  }

  /**
   * 1:1 Port of Currency::getCodesList()
   */
  public getCodesList(): Record<number, string> {
    const list: Record<number, string> = {};
    for (const [id, cur] of this.currencies.entries()) {
      list[id] = cur.code;
    }
    return list;
  }

  /**
   * Converts amount between currencies
   */
  public convert(amount: number, fromCode: string, toCode: string): number {
    const all = Array.from(this.currencies.values());
    const from = all.find((c) => c.code.toUpperCase() === fromCode.toUpperCase()) || { rate: 1.0 };
    const to = all.find((c) => c.code.toUpperCase() === toCode.toUpperCase()) || { rate: 1.0 };

    // Convert from -> Base (USD) -> to
    const amountInBase = amount / from.rate;
    return Number((amountInBase * to.rate).toFixed(2));
  }
}
