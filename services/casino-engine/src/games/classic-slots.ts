/**
 * Classic Egyptian & Fruit-Themed Slot Machine Engines
 * Implements four original 5x3 classic slot themes (ancient treasure, blazing sevens,
 * fortune charm, and ocean pearl)
 * with 5x3 reel grid, 10 paylines, scatter books, and expanding symbol free games.
 */

import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import { randomUUID } from 'crypto';
import type { GameRoundResult } from './base-game.ts';

export class ClassicSlotEngine {
  private static readonly THEME_SYMBOLS: Record<string, string[]> = {
    ancient_treasure: ['TEN', 'JACK', 'QUEEN', 'KING', 'ACE', 'SCARAB', 'STATUE', 'PHARAOH', 'EXPLORER', 'BOOK'],
    blazing_sevens: ['CHERRY', 'LEMON', 'ORANGE', 'PLUM', 'GRAPES', 'WATERMELON', 'STAR', 'SEVEN'],
    fortune_charm: ['NINE', 'TEN', 'JACK', 'QUEEN', 'KING', 'ACE', 'CLOVER', 'COIN', 'RABBIT_FOOT', 'LADYBUG', 'CRYSTAL_BALL', 'LUCKY_LADY'],
    ocean_pearl: ['NINE', 'TEN', 'JACK', 'QUEEN', 'KING', 'ACE', 'FISH', 'SEAHORSE', 'CRAB', 'STINGRAY', 'PEARL', 'DOLPHIN'],
  };

  private static readonly PAYLINES_10 = [
    [1, 1, 1, 1, 1], // 1. Middle
    [0, 0, 0, 0, 0], // 2. Top
    [2, 2, 2, 2, 2], // 3. Bottom
    [0, 1, 2, 1, 0], // 4. V
    [2, 1, 0, 1, 2], // 5. Inverted V
    [1, 0, 0, 0, 1], // 6. Soft V top
    [1, 2, 2, 2, 1], // 7. Soft V bottom
    [0, 0, 1, 2, 2], // 8. Slant down
    [2, 2, 1, 0, 0], // 9. Slant up
    [1, 2, 1, 0, 1], // 10. Zigzag
  ];

  // Paytable multipliers for the Egyptian-theme reel set: [2-match, 3-match, 4-match, 5-match]
  private static readonly ANCIENT_TREASURE_PAYTABLE: Record<string, number[]> = {
    TEN: [0, 5, 25, 100],
    JACK: [0, 5, 25, 100],
    QUEEN: [0, 5, 25, 100],
    KING: [0, 5, 40, 150],
    ACE: [0, 5, 40, 150],
    SCARAB: [5, 30, 100, 750],
    STATUE: [5, 30, 100, 750],
    PHARAOH: [5, 40, 400, 2000],
    EXPLORER: [10, 100, 1000, 5000],
    BOOK: [0, 20, 200, 2000], // Scatter & Wild
  };

  public static spin(params: {
    userId: string;
    wager: number;
    gameCode?: string; // 'ancient_treasure', 'blazing_sevens', 'fortune_charm', 'ocean_pearl'
    lines?: number; // default 10
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = randomUUID();
    const gameCode = params.gameCode || 'ancient_treasure';
    const symbols = this.THEME_SYMBOLS[gameCode] || this.THEME_SYMBOLS.ancient_treasure;
    const lineCount = Math.min(10, Math.max(1, params.lines || 10));
    const activePaylines = this.PAYLINES_10.slice(0, lineCount);
    const stakePerLine = params.wager / lineCount;

    // Generate 5x3 Reel Matrix
    const grid: string[][] = [];
    let rngIdx = 0;
    let scatterCount = 0;

    for (let row = 0; row < 3; row++) {
      const rowSymbols: string[] = [];
      for (let col = 0; col < 5; col++) {
        const symIdx = ProvablyFairRNG.generateInt(0, symbols.length - 1, params.serverSeed, params.clientSeed, params.nonce, rngIdx++);
        const sym = symbols[symIdx];
        if (sym === 'BOOK' || sym === 'STAR' || sym === 'CRYSTAL_BALL' || sym === 'PEARL') {
          scatterCount++;
        }
        rowSymbols.push(sym);
      }
      grid.push(rowSymbols);
    }

    // Evaluate paylines
    let totalWinMultiplier = 0;
    const winningLines: Array<{ lineIndex: number; symbol: string; count: number; winMultiplier: number; payout: number }> = [];

    for (let lIdx = 0; lIdx < activePaylines.length; lIdx++) {
      const line = activePaylines[lIdx];
      const symbolsInLine = [
        grid[line[0]][0],
        grid[line[1]][1],
        grid[line[2]][2],
        grid[line[3]][3],
        grid[line[4]][4],
      ];

      let baseSymbol = symbolsInLine[0];
      let matchCount = 1;

      for (let c = 1; c < 5; c++) {
        const curr = symbolsInLine[c];
        if (curr === baseSymbol || curr === 'BOOK' || baseSymbol === 'BOOK') {
          if (baseSymbol === 'BOOK' && curr !== 'BOOK') {
            baseSymbol = curr;
          }
          matchCount++;
        } else {
          break;
        }
      }

      const paytable = this.ANCIENT_TREASURE_PAYTABLE[baseSymbol] || [0, 5, 20, 100];
      let winMult = 0;
      if (matchCount === 2 && paytable[0] > 0) winMult = paytable[0];
      else if (matchCount === 3) winMult = paytable[1];
      else if (matchCount === 4) winMult = paytable[2];
      else if (matchCount === 5) winMult = paytable[3];

      if (winMult > 0) {
        totalWinMultiplier += winMult;
        winningLines.push({
          lineIndex: lIdx + 1,
          symbol: baseSymbol,
          count: matchCount,
          winMultiplier: winMult,
          payout: parseFloat((stakePerLine * winMult).toFixed(2)),
        });
      }
    }

    // Free Games Feature Trigger (3 or more Book/Scatter symbols trigger 10 Free Games)
    const freeSpinsAwarded = scatterCount >= 3 ? 10 : 0;
    const totalPayout = parseFloat((stakePerLine * totalWinMultiplier).toFixed(2));

    return {
      roundId,
      gameCode,
      userId: params.userId,
      wager: params.wager,
      payout: totalPayout,
      profit: parseFloat((totalPayout - params.wager).toFixed(2)),
      isCompleted: true,
      gameState: {
        grid,
        winningLines,
        scatterCount,
        freeSpinsAwarded,
        totalWinMultiplier,
        stakePerLine,
      },
    };
  }
}
