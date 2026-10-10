/**
 * Market Outcome Grader
 * Evaluates sports market selections against official match scorecards
 */

import { LegStatus } from '../betting/bet-placement.ts';

export interface FixtureScorecard {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  status: 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'ABANDONED' | 'INTERRUPTED';
  halfTimeScore?: { home: number; away: number };
  extraTimeScore?: { home: number; away: number };
  penaltyScore?: { home: number; away: number };
  isVoid?: boolean;
}

export interface SelectionToGrade {
  selectionId: string;
  selectionName: string;
  marketType: string; // e.g. '1X2', 'OVER_UNDER', 'BTTS', 'DOUBLE_CHANCE', 'DRAW_NO_BET', 'ASIAN_HANDICAP', 'CORRECT_SCORE'
  marketName?: string;
  line?: string | number; // e.g. '2.5', '+0.5', '-1.25'
  homeTeam?: string;
  awayTeam?: string;
}

export class MarketGrader {
  /**
   * Grades a single selection against the scorecard
   */
  public static gradeSelection(scorecard: FixtureScorecard, selection: SelectionToGrade): LegStatus {
    // 1. If fixture was voided / cancelled / postponed without reschedule
    if (
      scorecard.isVoid ||
      scorecard.status === 'CANCELLED' ||
      scorecard.status === 'POSTPONED' ||
      scorecard.status === 'ABANDONED'
    ) {
      return LegStatus.VOID;
    }

    const home = scorecard.homeScore;
    const away = scorecard.awayScore;
    const totalGoals = home + away;
    const marketType = (selection.marketType || '').toUpperCase().trim();
    const selName = selection.selectionName.trim();

    // 2. 1X2 / Match Winner / 3-Way Result
    if (marketType === '1X2' || marketType === 'MATCH_WINNER' || marketType === '3WAY') {
      const isHomeWin = home > away;
      const isDraw = home === away;
      const isAwayWin = away > home;

      if (selName === '1' || selName === 'Home' || (selection.homeTeam && selName.toLowerCase().includes(selection.homeTeam.toLowerCase()))) {
        return isHomeWin ? LegStatus.WON : LegStatus.LOST;
      }
      if (selName === 'X' || selName === 'Draw' || selName.toLowerCase() === 'tie') {
        return isDraw ? LegStatus.WON : LegStatus.LOST;
      }
      if (selName === '2' || selName === 'Away' || (selection.awayTeam && selName.toLowerCase().includes(selection.awayTeam.toLowerCase()))) {
        return isAwayWin ? LegStatus.WON : LegStatus.LOST;
      }
    }

    // 3. Over / Under (Totals)
    if (marketType === 'OVER_UNDER' || marketType === 'TOTALS' || marketType.startsWith('OU_')) {
      const line = typeof selection.line === 'number' ? selection.line : parseFloat(String(selection.line || selName.replace(/[^0-9.]/g, '')));
      if (isNaN(line)) return LegStatus.VOID;

      const isOver = selName.toLowerCase().startsWith('over') || selName.toLowerCase().startsWith('o ');
      const isUnder = selName.toLowerCase().startsWith('under') || selName.toLowerCase().startsWith('u ');

      // Integer line (e.g. 2.0, 3.0) -> push/void if exact
      if (Number.isInteger(line)) {
        if (totalGoals === line) return LegStatus.VOID;
        if (isOver) return totalGoals > line ? LegStatus.WON : LegStatus.LOST;
        if (isUnder) return totalGoals < line ? LegStatus.WON : LegStatus.LOST;
      }

      // Half lines (e.g. 0.5, 1.5, 2.5, 3.5)
      if (line % 1 === 0.5) {
        if (isOver) return totalGoals > line ? LegStatus.WON : LegStatus.LOST;
        if (isUnder) return totalGoals < line ? LegStatus.WON : LegStatus.LOST;
      }

      // Quarter lines (Asian Totals e.g. 2.25, 2.75)
      if (line % 1 === 0.25) {
        // e.g. Over 2.25 is half Over 2.0 (Push if 2) + half Over 2.5 (Loss if 2) -> Half Lost if 2
        const lower = line - 0.25;
        const upper = line + 0.25;
        if (isOver) {
          if (totalGoals > upper) return LegStatus.WON;
          if (totalGoals === lower) return LegStatus.HALF_LOST;
          return LegStatus.LOST;
        }
        if (isUnder) {
          if (totalGoals < lower) return LegStatus.WON;
          if (totalGoals === lower) return LegStatus.HALF_WON;
          return LegStatus.LOST;
        }
      }

      if (line % 1 === 0.75) {
        // e.g. Over 2.75 is half Over 2.5 (Won if 3) + half Over 3.0 (Push if 3) -> Half Won if 3
        const lower = line - 0.25;
        const upper = line + 0.25;
        if (isOver) {
          if (totalGoals > upper) return LegStatus.WON;
          if (totalGoals === upper) return LegStatus.HALF_WON;
          return LegStatus.LOST;
        }
        if (isUnder) {
          if (totalGoals < lower) return LegStatus.WON;
          if (totalGoals === upper) return LegStatus.HALF_LOST;
          return LegStatus.LOST;
        }
      }
    }

    // 4. Both Teams To Score (BTTS)
    if (marketType === 'BTTS' || marketType === 'BOTH_TEAMS_TO_SCORE' || marketType === 'GG_NG') {
      const bttsHappened = home > 0 && away > 0;
      if (selName.toLowerCase() === 'yes' || selName.toLowerCase() === 'gg') {
        return bttsHappened ? LegStatus.WON : LegStatus.LOST;
      }
      if (selName.toLowerCase() === 'no' || selName.toLowerCase() === 'ng') {
        return !bttsHappened ? LegStatus.WON : LegStatus.LOST;
      }
    }

    // 5. Double Chance (1X, 12, X2)
    if (marketType === 'DOUBLE_CHANCE' || marketType === 'DC') {
      const norm = selName.toUpperCase().replace(/\s+/g, '');
      if (norm === '1X' || norm === 'HOME/DRAW' || norm === '1ORX') {
        return home >= away ? LegStatus.WON : LegStatus.LOST;
      }
      if (norm === '12' || norm === 'HOME/AWAY' || norm === '1OR2') {
        return home !== away ? LegStatus.WON : LegStatus.LOST;
      }
      if (norm === 'X2' || norm === 'DRAW/AWAY' || norm === 'XOR2') {
        return away >= home ? LegStatus.WON : LegStatus.LOST;
      }
    }

    // 6. Draw No Bet (DNB)
    if (marketType === 'DRAW_NO_BET' || marketType === 'DNB') {
      if (home === away) return LegStatus.VOID;
      if (selName === '1' || selName === 'Home' || (selection.homeTeam && selName.toLowerCase().includes(selection.homeTeam.toLowerCase()))) {
        return home > away ? LegStatus.WON : LegStatus.LOST;
      }
      if (selName === '2' || selName === 'Away' || (selection.awayTeam && selName.toLowerCase().includes(selection.awayTeam.toLowerCase()))) {
        return away > home ? LegStatus.WON : LegStatus.LOST;
      }
    }

    // 7. Asian Handicap (AH) / European Handicap (EH)
    if (marketType === 'ASIAN_HANDICAP' || marketType === 'HANDICAP' || marketType === 'AH') {
      const handicap = typeof selection.line === 'number' ? selection.line : parseFloat(String(selection.line || '0'));
      const isHome = selName.startsWith('1') || selName.toLowerCase().startsWith('home') || (selection.homeTeam && selName.toLowerCase().includes(selection.homeTeam.toLowerCase()));
      const diff = isHome ? home - away : away - home;
      const adjustedDiff = diff + handicap;

      if (adjustedDiff === 0) return LegStatus.VOID;
      if (adjustedDiff > 0.25) return LegStatus.WON;
      if (adjustedDiff === 0.25) return LegStatus.HALF_WON;
      if (adjustedDiff === -0.25) return LegStatus.HALF_LOST;
      if (adjustedDiff < -0.25) return LegStatus.LOST;
    }

    // 8. Correct Score
    if (marketType === 'CORRECT_SCORE' || marketType === 'CS') {
      const expectedScore = `${home}-${away}`;
      const normSel = selName.replace(/\s+/g, '').replace(':', '-');
      return normSel === expectedScore ? LegStatus.WON : LegStatus.LOST;
    }

    // 9. Half-Time 1X2 & 1st/2nd Period Winner
    if (marketType === 'HALF_TIME_1X2' || marketType === 'HT_1X2' || marketType === '1ST-PERIOD-WINNER' || marketType === '1ST_PERIOD_WINNER') {
      if (!scorecard.halfTimeScore) return LegStatus.VOID;
      const htHome = scorecard.halfTimeScore.home;
      const htAway = scorecard.halfTimeScore.away;
      if (selName === '1' || selName === 'Home') return htHome > htAway ? LegStatus.WON : LegStatus.LOST;
      if (selName === 'X' || selName === 'Draw') return htHome === htAway ? LegStatus.WON : LegStatus.LOST;
      if (selName === '2' || selName === 'Away') return htAway > htHome ? LegStatus.WON : LegStatus.LOST;
    }

    if (marketType === '2ND-PERIOD-WINNER' || marketType === '2ND_PERIOD_WINNER') {
      if (!scorecard.halfTimeScore) return LegStatus.VOID;
      const shHome = home - scorecard.halfTimeScore.home;
      const shAway = away - scorecard.halfTimeScore.away;
      if (selName === '1' || selName === 'Home') return shHome > shAway ? LegStatus.WON : LegStatus.LOST;
      if (selName === 'X' || selName === 'Draw') return shHome === shAway ? LegStatus.WON : LegStatus.LOST;
      if (selName === '2' || selName === 'Away') return shAway > shHome ? LegStatus.WON : LegStatus.LOST;
    }

    // 10. Half-Time / Full-Time (HT/FT)
    if (marketType === 'HT_FT' || marketType === 'HT-FT' || marketType === 'HALF_TIME_FULL_TIME') {
      if (!scorecard.halfTimeScore) return LegStatus.VOID;
      const htHome = scorecard.halfTimeScore.home;
      const htAway = scorecard.halfTimeScore.away;
      const htResult = htHome > htAway ? '1' : htHome === htAway ? 'X' : '2';
      const ftResult = home > away ? '1' : home === away ? 'X' : '2';
      const outcome = `${htResult}/${ftResult}`;
      const normSel = selName.toUpperCase().replace(/\s+/g, '');
      return normSel.startsWith(outcome) || normSel === outcome ? LegStatus.WON : LegStatus.LOST;
    }

    // 11. Odd / Even Goals (Full Time & Half Time)
    if (marketType === 'ODD_EVEN' || marketType === 'ODD-EVEN') {
      const isOdd = totalGoals % 2 !== 0;
      if (selName.toLowerCase().startsWith('odd')) return isOdd ? LegStatus.WON : LegStatus.LOST;
      if (selName.toLowerCase().startsWith('even')) return !isOdd ? LegStatus.WON : LegStatus.LOST;
    }

    if (marketType === 'ODD_EVEN_HALFTIME' || marketType === 'ODD-EVEN-HALFTIME') {
      if (!scorecard.halfTimeScore) return LegStatus.VOID;
      const htGoals = scorecard.halfTimeScore.home + scorecard.halfTimeScore.away;
      const isOdd = htGoals % 2 !== 0;
      if (selName.toLowerCase().startsWith('odd')) return isOdd ? LegStatus.WON : LegStatus.LOST;
      if (selName.toLowerCase().startsWith('even')) return !isOdd ? LegStatus.WON : LegStatus.LOST;
    }

    // 12. Team to Score (Home / Away)
    if (marketType === 'HOME_TEAM_TO_SCORE' || marketType === 'HOME-TEAM-TO-SCORE') {
      const scored = home > 0;
      if (selName.toLowerCase() === 'yes') return scored ? LegStatus.WON : LegStatus.LOST;
      if (selName.toLowerCase() === 'no') return !scored ? LegStatus.WON : LegStatus.LOST;
    }

    if (marketType === 'AWAY_TEAM_TO_SCORE' || marketType === 'AWAY-TEAM-TO-SCORE') {
      const scored = away > 0;
      if (selName.toLowerCase() === 'yes') return scored ? LegStatus.WON : LegStatus.LOST;
      if (selName.toLowerCase() === 'no') return !scored ? LegStatus.WON : LegStatus.LOST;
    }

    // 13. First Team to Score
    if (marketType === 'FIRST_TEAM_TO_SCORE' || marketType === 'FIRST-TEAM-TO-SCORE') {
      if (totalGoals === 0) {
        return selName.toLowerCase() === 'none' || selName.toLowerCase() === 'no goals' ? LegStatus.WON : LegStatus.LOST;
      }
      if (selName.toLowerCase().startsWith('home') || selName === '1') return home > 0 ? LegStatus.WON : LegStatus.LOST;
      if (selName.toLowerCase().startsWith('away') || selName === '2') return away > 0 ? LegStatus.WON : LegStatus.LOST;
    }

    // 14. Highest Scoring Half
    if (marketType === 'HIGHEST_SCORING_HALF' || marketType === 'HIGHEST-SCORING-HALF') {
      if (!scorecard.halfTimeScore) return LegStatus.VOID;
      const firstHalf = scorecard.halfTimeScore.home + scorecard.halfTimeScore.away;
      const secondHalf = totalGoals - firstHalf;
      if (selName.toLowerCase().includes('1st') || selName.toLowerCase().includes('first')) return firstHalf > secondHalf ? LegStatus.WON : LegStatus.LOST;
      if (selName.toLowerCase().includes('2nd') || selName.toLowerCase().includes('second')) return secondHalf > firstHalf ? LegStatus.WON : LegStatus.LOST;
      if (selName.toLowerCase().includes('equal') || selName.toLowerCase().includes('draw')) return firstHalf === secondHalf ? LegStatus.WON : LegStatus.LOST;
    }

    // 15. Under / Over 1st Period & 2nd Period
    if (marketType === 'UNDER_OVER_1ST_PERIOD' || marketType === 'UNDER-OVER-1ST-PERIOD') {
      if (!scorecard.halfTimeScore) return LegStatus.VOID;
      const htGoals = scorecard.halfTimeScore.home + scorecard.halfTimeScore.away;
      const line = parseFloat(String(selection.line || selName.replace(/[^0-9.]/g, ''))) || 1.5;
      if (selName.toLowerCase().startsWith('over')) return htGoals > line ? LegStatus.WON : LegStatus.LOST;
      if (selName.toLowerCase().startsWith('under')) return htGoals < line ? LegStatus.WON : LegStatus.LOST;
    }

    // Fallback: Default to VOID if market could not be decisively parsed
    return LegStatus.VOID;
  }
}
