import { randomUUID } from 'node:crypto';
import {
  BetBuilderCopulaModel,
  type BuilderSelection,
  type CopulaPriceResult,
} from '../../../odds-engine/src/domain/bet-builder-copula-model.ts';
import type { MatchContext } from '../../../odds-engine/src/domain/bivariate-poisson-model.ts';
import { BetPlacementService, type BetSlipRecord } from './bet-placement.ts';
import { BetSlipType } from './bet-validator.ts';
import { LedgerService } from '../wallet/ledger-service.ts';
import { DistributedLockService } from '../distributed/distributed-lock-service.ts';

export interface BuilderQuoteToken {
  quoteTokenId: string;
  userId: string;
  fixtureId: string;
  selections: BuilderSelection[];
  pricing: CopulaPriceResult;
  expiresAt: number;
}

export class BetBuilderService {
  private static instance: BetBuilderService | null = null;
  private betPlacement: BetPlacementService;
  private ledger: LedgerService;
  private lockService: DistributedLockService;
  private activeQuotes = new Map<string, BuilderQuoteToken>();

  constructor() {
    this.betPlacement = BetPlacementService.getInstance();
    this.ledger = LedgerService.getInstance();
    this.lockService = DistributedLockService.getInstance();
  }

  public static getInstance(): BetBuilderService {
    if (!this.instance) {
      this.instance = new BetBuilderService();
    }
    return this.instance;
  }

  /**
   * Quotes a multi-selection Same-Game Parlay using Copula modeling.
   */
  public quoteBuilder(
    matchCtx: MatchContext,
    selections: BuilderSelection[],
    targetMargin: number = 1.08
  ): CopulaPriceResult {
    return BetBuilderCopulaModel.priceSelections(matchCtx, selections, targetMargin);
  }

  /**
   * Issues a time-limited Bet Builder quote token for a punter.
   */
  public issueBuilderQuote(
    userId: string,
    matchCtx: MatchContext,
    selections: BuilderSelection[],
    ttlMs: number = 30000
  ): BuilderQuoteToken {
    const pricing = this.quoteBuilder(matchCtx, selections);
    if (!pricing.isCompatible) {
      throw new Error(`BET_BUILDER_REJECTED: ${pricing.rejectionReason || 'Selections are mutually exclusive'}`);
    }

    const quoteTokenId = `sgp_quote_${randomUUID()}`;
    const token: BuilderQuoteToken = {
      quoteTokenId,
      userId,
      fixtureId: matchCtx.fixtureId,
      selections,
      pricing,
      expiresAt: Date.now() + ttlMs,
    };

    this.activeQuotes.set(quoteTokenId, token);
    return token;
  }

  /**
   * Places an authenticated Bet Builder ticket against an active quote token.
   */
  public async placeBuilderBet(params: {
    userId: string;
    quoteTokenId: string;
    stake: number;
    currencyCode?: string;
  }): Promise<BetSlipRecord> {
    const quote = this.activeQuotes.get(params.quoteTokenId);
    if (!quote) {
      throw new Error('QUOTE_NOT_FOUND: The Bet Builder quote has expired or does not exist.');
    }

    if (quote.userId !== params.userId) {
      throw new Error('QUOTE_FORBIDDEN: Quote does not belong to the authenticated user.');
    }

    if (Date.now() > quote.expiresAt) {
      this.activeQuotes.delete(params.quoteTokenId);
      throw new Error('QUOTE_EXPIRED: The live market has moved. Please request a new quote.');
    }

    const currencyCode = params.currencyCode || 'USD';

    return this.lockService.lockUser(params.userId, async () => {
      const balance = this.ledger.getBalance(params.userId, currencyCode);
      if (balance < params.stake) {
        throw new Error(`INSUFFICIENT_FUNDS: Available ${balance.toFixed(2)}, required ${params.stake.toFixed(2)}`);
      }

      // Format legs for BetPlacementService
      const legs = quote.selections.map((s) => ({
        fixtureId: quote.fixtureId,
        fixtureName: 'Same-Game Parlay Match',
        marketId: `mkt-${s.marketType.toLowerCase()}`,
        marketName: s.marketType,
        marketType: s.marketType,
        selectionId: s.id,
        selectionName: s.selectionName,
        submittedOdds: s.individualOdds || 1.90,
      }));

      const correlatedOdds = quote.pricing.finalBuilderOdds;

      const ticket = this.betPlacement.placeBet(
        {
          userId: params.userId,
          betType: BetSlipType.BET_BUILDER,
          currencyCode,
          stake: params.stake,
          legs,
        },
        (selId) => {
          if (selId === '__builder_correlated_odds__') {
            return correlatedOdds;
          }
          const found = quote.selections.find((s) => s.id === selId);
          return found?.individualOdds || 1.90;
        }
      );

      // Invalidate consumed quote token
      this.activeQuotes.delete(params.quoteTokenId);

      return ticket;
    });
  }

  public getQuote(quoteTokenId: string): BuilderQuoteToken | undefined {
    return this.activeQuotes.get(quoteTokenId);
  }
}
