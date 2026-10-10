/**
 * Fixture Resulting Service
 * Coordinates receiving official match results, grading affected selections,
 * and dispatching tickets to the background settlement worker.
 */

import { MarketGrader } from './market-grader.ts';
import type { FixtureScorecard, SelectionToGrade } from './market-grader.ts';
import { BetPlacementService, LegStatus } from '../betting/bet-placement.ts';
import { SettlementWorkerQueue } from './settlement-worker.ts';

export interface FixtureResultSubmission {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  status?: 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'ABANDONED' | 'INTERRUPTED';
  halfTimeScore?: { home: number; away: number };
  extraTimeScore?: { home: number; away: number };
  penaltyScore?: { home: number; away: number };
  isVoid?: boolean;
  homeTeam?: string;
  awayTeam?: string;
}

export interface ResultingSummary {
  fixtureId: string;
  status: string;
  score: string;
  affectedSlipsCount: number;
  enqueuedSlips: string[];
  resolvedSelectionsCount: number;
}

export class FixtureResultingService {
  private static instance: FixtureResultingService;
  private betService: BetPlacementService;
  private scorecards: Map<string, FixtureScorecard> = new Map();
  private selectionGrades: Map<string, LegStatus> = new Map();

  private constructor() {
    this.betService = BetPlacementService.getInstance();
  }

  public static getInstance(): FixtureResultingService {
    if (!FixtureResultingService.instance) {
      FixtureResultingService.instance = new FixtureResultingService();
    }
    return FixtureResultingService.instance;
  }

  /**
   * Submits an official fixture result and triggers automated settlement
   */
  public submitFixtureResult(submission: FixtureResultSubmission): ResultingSummary {
    const scorecard: FixtureScorecard = {
      fixtureId: submission.fixtureId,
      homeScore: submission.homeScore,
      awayScore: submission.awayScore,
      status: submission.status || 'FINISHED',
      halfTimeScore: submission.halfTimeScore,
      extraTimeScore: submission.extraTimeScore,
      penaltyScore: submission.penaltyScore,
      isVoid: submission.isVoid,
    };

    this.scorecards.set(submission.fixtureId, scorecard);

    // 1. Scan all active tickets in bet placement service for legs matching this fixtureId
    const allSlips = this.betService.getAllTickets ? this.betService.getAllTickets() : [];
    const affectedSlips: string[] = [];
    let resolvedSelectionsCount = 0;

    for (const slip of allSlips) {
      if (slip.status !== 'ACCEPTED') continue;

      let slipHasFixture = false;

      for (const leg of slip.legs) {
        if (leg.fixtureId === submission.fixtureId) {
          slipHasFixture = true;

          // Build selection to grade
          const selToGrade: SelectionToGrade = {
            selectionId: leg.selectionId,
            selectionName: leg.selectionName,
            marketType: this.inferMarketType(leg.marketName),
            marketName: leg.marketName,
            homeTeam: submission.homeTeam || this.extractTeam(leg.fixtureName, 'home'),
            awayTeam: submission.awayTeam || this.extractTeam(leg.fixtureName, 'away'),
          };

          const grade = MarketGrader.gradeSelection(scorecard, selToGrade);
          this.selectionGrades.set(leg.selectionId, grade);
          resolvedSelectionsCount++;
        }
      }

      if (slipHasFixture) {
        affectedSlips.push(slip.id);
      }
    }

    // 2. Enqueue all affected slips to the background settlement worker
    const workerQueue = SettlementWorkerQueue.getInstance();
    for (const slipId of affectedSlips) {
      workerQueue.enqueueSettlementJob({
        slipId,
        triggerFixtureId: submission.fixtureId,
        priority: 'NORMAL',
        enqueuedAt: new Date(),
      });
    }

    const summary: ResultingSummary = {
      fixtureId: submission.fixtureId,
      status: scorecard.status,
      score: `${scorecard.homeScore} - ${scorecard.awayScore}`,
      affectedSlipsCount: affectedSlips.length,
      enqueuedSlips: affectedSlips,
      resolvedSelectionsCount,
    };

    console.log(
      `[FixtureResulting] Fixture ${submission.fixtureId} resulted (${summary.score}). ` +
        `Enqueued ${affectedSlips.length} tickets for settlement.`
    );

    return summary;
  }

  /**
   * Helper to infer market type from leg market name if not explicitly set
   */
  private inferMarketType(marketName: string): string {
    const name = (marketName || '').toUpperCase();
    if (name.includes('1X2') || name.includes('MATCH WINNER') || name.includes('3WAY')) return '1X2';
    if (name.includes('OVER') || name.includes('UNDER') || name.includes('TOTAL')) return 'OVER_UNDER';
    if (name.includes('BTTS') || name.includes('BOTH TEAMS') || name.includes('GG')) return 'BTTS';
    if (name.includes('DOUBLE CHANCE') || name.includes('DC')) return 'DOUBLE_CHANCE';
    if (name.includes('DRAW NO BET') || name.includes('DNB')) return 'DRAW_NO_BET';
    if (name.includes('HANDICAP') || name.includes('ASIAN')) return 'ASIAN_HANDICAP';
    if (name.includes('CORRECT SCORE')) return 'CORRECT_SCORE';
    return '1X2';
  }

  private extractTeam(fixtureName: string, side: 'home' | 'away'): string {
    if (!fixtureName || !fixtureName.includes(' vs ')) return '';
    const parts = fixtureName.split(' vs ');
    return side === 'home' ? parts[0].trim() : parts[1].trim();
  }

  public getScorecard(fixtureId: string): FixtureScorecard | undefined {
    return this.scorecards.get(fixtureId);
  }

  public getSelectionGrade(selectionId: string): LegStatus | undefined {
    return this.selectionGrades.get(selectionId);
  }

  public getAllGrades(): Map<string, LegStatus> {
    return this.selectionGrades;
  }
}
