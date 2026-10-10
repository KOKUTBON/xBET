import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import type { GameRoundResult } from './base-game.ts';
import { randomUUID } from 'crypto';

export class SlotMachineEngine {
  private static readonly SYMBOLS = ['CHERRY', 'LEMON', 'ORANGE', 'PLUM', 'BELL', 'SEVEN', 'WILD', 'BONUS'];
  
  // Payline patterns for 5x3 grid (row index 0, 1, 2 for each of the 5 reels)
  private static readonly PAYLINES = [
    [1, 1, 1, 1, 1], // Middle horizontal
    [0, 0, 0, 0, 0], // Top horizontal
    [2, 2, 2, 2, 2], // Bottom horizontal
    [0, 1, 2, 1, 0], // V-shape
    [2, 1, 0, 1, 2], // Inverted V-shape
  ];

  // Paytable multipliers for 3, 4, 5 of a kind
  private static readonly PAYTABLE: Record<string, number[]> = {
    CHERRY: [0, 0, 2, 5, 15],
    LEMON: [0, 0, 3, 8, 20],
    ORANGE: [0, 0, 4, 10, 30],
    PLUM: [0, 0, 5, 15, 50],
    BELL: [0, 0, 10, 30, 100],
    SEVEN: [0, 0, 25, 100, 500],
    WILD: [0, 0, 50, 250, 1000],
  };

  public static spin(params: {
    userId: string;
    wager: number;
    gameCode?: string;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = randomUUID();
    const gameCode = params.gameCode || 'slot_fruits';

    // Generate 5x3 grid
    const grid: string[][] = [];
    let rngIndex = 0;

    for (let row = 0; row < 3; row++) {
      const rowSymbols: string[] = [];
      for (let col = 0; col < 5; col++) {
        const symbolIdx = ProvablyFairRNG.generateInt(0, this.SYMBOLS.length - 1, params.serverSeed, params.clientSeed, params.nonce, rngIndex++);
        rowSymbols.push(this.SYMBOLS[symbolIdx]);
      }
      grid.push(rowSymbols);
    }

    // Evaluate paylines
    let totalWinMultiplier = 0;
    const winningLines: Array<{ lineIndex: number; symbol: string; count: number; winMultiplier: number }> = [];

    const stakePerLine = params.wager / this.PAYLINES.length;

    for (let lineIdx = 0; lineIdx < this.PAYLINES.length; lineIdx++) {
      const line = this.PAYLINES[lineIdx];
      const symbolsInLine = [
        grid[line[0]][0],
        grid[line[1]][1],
        grid[line[2]][2],
        grid[line[3]][3],
        grid[line[4]][4],
      ];

      // Count matching symbols starting from reel 1
      let baseSymbol = symbolsInLine[0];
      let matchCount = 1;

      for (let c = 1; c < 5; c++) {
        const current = symbolsInLine[c];
        if (current === baseSymbol || current === 'WILD' || baseSymbol === 'WILD') {
          if (baseSymbol === 'WILD' && current !== 'WILD') {
            baseSymbol = current;
          }
          matchCount++;
        } else {
          break;
        }
      }

      if (matchCount >= 3 && this.PAYTABLE[baseSymbol]) {
        const multiplier = this.PAYTABLE[baseSymbol][matchCount - 1] || 0;
        if (multiplier > 0) {
          totalWinMultiplier += multiplier;
          winningLines.push({
            lineIndex: lineIdx + 1,
            symbol: baseSymbol,
            count: matchCount,
            winMultiplier: multiplier,
          });
        }
      }
    }

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
        totalWinMultiplier,
        stakePerLine,
      },
    };
  }
}
