/**
 * Converted CakePHP PaymentBonusesController
 * Handles 1:1 deposit bonuses, bonus groups, and bonus usage tracking.
 */

import { AppController, type CakeResponse } from './AppController.ts';
import { PaymentBonus, type PaymentBonusRecord } from '../models/payment-bonus.ts';

export class PaymentBonusesController extends AppController {
  private bonusModel = new PaymentBonus();

  public admin_index(): CakeResponse {
    if (!this.beforeFilter()) return this.response;
    return this.renderJson({
      bonuses: [
        this.bonusModel.getBonus(null, 'WELCOME100'),
        this.bonusModel.getBonus(null, 'CRYPTO50'),
      ].filter(Boolean),
    });
  }

  public admin_calculate(bonusCode: string, amount: number): CakeResponse {
    const bonus = this.bonusModel.getBonus(null, bonusCode);
    const result = this.bonusModel.calculateBonus(bonus, amount);
    return this.renderJson({ success: true, ...result });
  }

  public admin_edit(id: string | number): CakeResponse {
    if (!this.beforeFilter()) return this.response;
    return this.renderJson({ success: true, id });
  }
}

