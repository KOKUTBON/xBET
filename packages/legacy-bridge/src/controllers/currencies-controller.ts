/**
 * Converted CakePHP CurrenciesController
 * Handles 1:1 currency codes, exchange rates, and admin currency settings.
 */

import { AppController, type CakeResponse } from './AppController.ts';
import { Currency } from '../models/currency.ts';

export class CurrenciesController extends AppController {
  private currencyModel = new Currency();

  public index(): CakeResponse {
    return this.renderJson({ currencies: this.currencyModel.getList() });
  }

  public admin_index(): CakeResponse {
    if (!this.beforeFilter()) return this.response;
    return this.renderJson({
      currencies: this.currencyModel.getList(),
      codes: this.currencyModel.getCodesList(),
    });
  }

  public convert(amount: number, from: string, to: string): CakeResponse {
    const converted = this.currencyModel.convert(amount, from, to);
    return this.renderJson({
      from,
      to,
      originalAmount: amount,
      convertedAmount: converted,
    });
  }
}
