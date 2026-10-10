import { LedgerService } from '../wallet/ledger-service.ts';
import { RiskManager } from '../risk/risk-manager.ts';
import { BetPlacementService, BetSlipStatus, LegStatus } from '../betting/bet-placement.ts';
import type { BetSlipRecord } from '../betting/bet-placement.ts';
import { BetSlipType, BetValidator } from '../betting/bet-validator.ts';

export interface LegOutcomeResolution {
  selectionId: string;
  status: LegStatus; // WON, LOST, VOID, HALF_WON, HALF_LOST
}

export class SettlementEngine {
  private static instance: SettlementEngine;
  private ledger: LedgerService;
  private risk: RiskManager;
  private betService: BetPlacementService;

  private constructor() {
    this.ledger = LedgerService.getInstance();
    this.risk = RiskManager.getInstance();
    this.betService = BetPlacementService.getInstance();
  }

  public static getInstance(): SettlementEngine {
    if (!SettlementEngine.instance) {
      SettlementEngine.instance = new SettlementEngine();
    }
    return SettlementEngine.instance;
  }

  /**
   * Settles a specific bet slip against resolved leg outcomes
   */
  public settleBetSlip(slipId: string, resolutions: Map<string, LegStatus>): BetSlipRecord {
    const slip = this.betService.getTicket(slipId);
    if (!slip) throw new Error(`Bet slip ${slipId} not found`);

    if (slip.status !== BetSlipStatus.ACCEPTED) {
      throw new Error(`Bet slip ${slipId} already settled with status ${slip.status}`);
    }

    // 1. Update leg statuses
    for (const leg of slip.legs) {
      const res = resolutions.get(leg.selectionId);
      if (res) {
        leg.status = res;
      }
    }

    // Check if any legs are still pending
    const hasPendingLegs = slip.legs.some((l) => l.status === LegStatus.PENDING);
    if (hasPendingLegs) {
      console.log(`[Settlement] Slip ${slip.slipNumber} has pending legs, skipping final settlement.`);
      return slip;
    }

    // 2. Evaluate based on Bet Type
    let actualPayout = 0.0;
    let finalStatus: BetSlipStatus = BetSlipStatus.LOST;

    if (slip.betType === BetSlipType.SINGLE) {
      const singleLeg = slip.legs[0];
      if (singleLeg.status === LegStatus.WON) {
        actualPayout = parseFloat((slip.stake * singleLeg.lockedOdds).toFixed(2));
        finalStatus = BetSlipStatus.WON;
      } else if (singleLeg.status === LegStatus.HALF_WON) {
        const effectiveOdds = (singleLeg.lockedOdds + 1.0) / 2.0;
        actualPayout = parseFloat((slip.stake * effectiveOdds).toFixed(2));
        finalStatus = BetSlipStatus.HALF_WON;
      } else if (singleLeg.status === LegStatus.HALF_LOST) {
        actualPayout = parseFloat((slip.stake * 0.5).toFixed(2));
        finalStatus = BetSlipStatus.HALF_LOST;
      } else if (singleLeg.status === LegStatus.VOID) {
        actualPayout = slip.stake;
        finalStatus = BetSlipStatus.VOID;
      } else {
        actualPayout = 0.0;
        finalStatus = BetSlipStatus.LOST;
      }
    } else if (slip.betType === BetSlipType.COMBI) {
      const hasLostLeg = slip.legs.some((l) => l.status === LegStatus.LOST);

      if (hasLostLeg) {
        actualPayout = 0.0;
        finalStatus = BetSlipStatus.LOST;
      } else {
        let effectiveMultiplier = 1.0;
        let allVoid = true;

        for (const leg of slip.legs) {
          if (leg.status === LegStatus.WON) {
            effectiveMultiplier *= leg.lockedOdds;
            allVoid = false;
          } else if (leg.status === LegStatus.HALF_WON) {
            effectiveMultiplier *= (leg.lockedOdds + 1.0) / 2.0;
            allVoid = false;
          } else if (leg.status === LegStatus.HALF_LOST) {
            effectiveMultiplier *= 0.5;
            allVoid = false;
          } else if (leg.status === LegStatus.VOID) {
            effectiveMultiplier *= 1.0; // Void leg pays 1.00
          }
        }

        actualPayout = parseFloat((slip.stake * effectiveMultiplier).toFixed(2));
        finalStatus = allVoid ? BetSlipStatus.VOID : BetSlipStatus.WON;
      }
    } else if (slip.betType === BetSlipType.SYSTEM) {
      const k = slip.systemK || 2;
      const combinations = BetValidator.generateCombinations(slip.legs, k);
      const stakePerCombo = slip.stakePerCombination || slip.stake / combinations.length;

      let totalSystemPayout = 0.0;

      for (const combo of combinations) {
        const hasLostInCombo = combo.some((l) => l.status === LegStatus.LOST);
        if (!hasLostInCombo) {
          let comboMultiplier = 1.0;
          for (const leg of combo) {
            if (leg.status === LegStatus.WON) {
              comboMultiplier *= leg.lockedOdds;
            } else if (leg.status === LegStatus.HALF_WON) {
              comboMultiplier *= (leg.lockedOdds + 1.0) / 2.0;
            } else if (leg.status === LegStatus.HALF_LOST) {
              comboMultiplier *= 0.5;
            } else if (leg.status === LegStatus.VOID) {
              comboMultiplier *= 1.0;
            }
          }
          totalSystemPayout += stakePerCombo * comboMultiplier;
        }
      }

      actualPayout = parseFloat(totalSystemPayout.toFixed(2));
      finalStatus = actualPayout > 0 ? BetSlipStatus.WON : BetSlipStatus.LOST;
    }

    // 3. Execute Double-Entry Ledger Transactions
    slip.actualPayout = actualPayout;
    slip.status = finalStatus;
    slip.settledAt = new Date();
    slip.cashoutOffer = null; // Closed for cashout

    if (finalStatus === BetSlipStatus.WON || finalStatus === BetSlipStatus.HALF_WON) {
      this.ledger.settleWinningBet(slip.userId, slip.id, slip.stake, actualPayout, slip.currencyCode);
    } else if (finalStatus === BetSlipStatus.VOID) {
      this.ledger.settleVoidBet(slip.userId, slip.id, slip.stake, slip.currencyCode);
    } else if (finalStatus === BetSlipStatus.HALF_LOST) {
      // Partial loss return
      this.ledger.settleWinningBet(slip.userId, slip.id, slip.stake, actualPayout, slip.currencyCode);
    } else {
      this.ledger.settleLosingBet(slip.userId, slip.id, slip.stake, slip.currencyCode);
    }

    // 4. Release Risk Liabilities
    for (const leg of slip.legs) {
      this.risk.releaseLiability(leg.selectionId, slip.potentialPayout - slip.stake);
    }

    console.log(`[Settlement] Slip ${slip.slipNumber} settled as ${finalStatus} | Payout: $${actualPayout.toFixed(2)}`);
    return slip;
  }
}
