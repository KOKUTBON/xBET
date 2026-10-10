/**
 * Converted CakePHP PaymentBonus Model
 * Handles 1:1 deposit bonus code lookups, multiplier bonus calculations,
 * and maximum bonus caps.
 */

import { AppModel } from './AppModel.ts';

export interface PaymentBonusRecord {
  id: number;
  bonus_code: string;
  bonus_multiplier: number;
  max_used_count?: number;
  min_amount?: number;
  max_amount?: number;
  max_bonus: number;
  valid_after?: Date;
  valid_before?: Date;
  payment_bonus_group_id?: number;
}

export class PaymentBonus extends AppModel {
  private bonusCodes: Map<string, PaymentBonusRecord> = new Map();

  constructor() {
    super('PaymentBonus', 'payment_bonuses');
    this.displayField = 'bonus_code';
    this.seedDefaultBonuses();
  }

  private seedDefaultBonuses(): void {
    const now = new Date();
    const future = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
    const past = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    this.bonusCodes.set('WELCOME100', {
      id: 1,
      bonus_code: 'WELCOME100',
      bonus_multiplier: 2.0, // 100% matched deposit bonus
      max_bonus: 200.0,
      min_amount: 10.0,
      max_amount: 500.0,
      valid_after: past,
      valid_before: future,
    });

    this.bonusCodes.set('CRYPTO50', {
      id: 2,
      bonus_code: 'CRYPTO50',
      bonus_multiplier: 1.5, // 50% crypto deposit reload bonus
      max_bonus: 500.0,
      min_amount: 20.0,
      valid_after: past,
      valid_before: future,
    });
  }

  /**
   * 1:1 Port of PaymentBonus::getBonus($bonusGroup, $bonusCode)
   */
  public getBonus(bonusGroup: number | null, bonusCode: string): PaymentBonusRecord | null {
    const bonus = this.bonusCodes.get(bonusCode.toUpperCase());
    if (!bonus) return null;

    const now = new Date();
    if (bonus.valid_after && bonus.valid_after > now) return null;
    if (bonus.valid_before && bonus.valid_before < now) return null;

    return bonus;
  }

  /**
   * 1:1 Port of PaymentBonus::calculateBonus($bonuscodeObject, $amount)
   * Exact math: $bonus = round($amount * $bonus_multiplier - $amount, 2);
   * Capped at max_bonus.
   */
  public calculateBonus(bonusCodeObj: PaymentBonusRecord | null, amount: number): { totalAmount: number; bonusAmount: number } {
    if (!bonusCodeObj) {
      return { totalAmount: amount, bonusAmount: 0 };
    }

    let bonus = Number((amount * bonusCodeObj.bonus_multiplier - amount).toFixed(2));
    if (bonusCodeObj.max_bonus > 0 && bonus > bonusCodeObj.max_bonus) {
      bonus = bonusCodeObj.max_bonus;
    }

    return {
      totalAmount: Number((amount + bonus).toFixed(2)),
      bonusAmount: bonus,
    };
  }
}
