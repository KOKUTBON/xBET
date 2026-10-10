/**
 * Static demo casino (GitHub Pages build only).
 *
 * Browser-side simulations for the table, slot, instant and virtual-racing
 * titles. Results use the same shapes the RGS engines return, so the existing
 * game stages render them unchanged. Outcomes come from the injected RNG and
 * are for presentation only — nothing here is provably fair or server-verified.
 */

import type { DemoRng } from './demo-sports.ts';

export interface DemoRound {
  payout: number;
  gameState: any;
  roundId: string;
  message?: string;
  error?: string;
}

const DEMO_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const DEMO_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const DEMO_SUITS = ['♠', '♥', '♦', '♣'];

/** Slot themes: symbol weights per reel and the 3/4/5-of-a-kind line pays (× line bet). */
const DEMO_SLOT_THEMES: Record<string, { symbols: Array<[string, number, number[]]> }> = {
  fruits: { symbols: [['CHERRY', 26, [1, 3, 10]], ['LEMON', 24, [1, 3, 10]], ['ORANGE', 20, [2, 5, 15]], ['PLUM', 16, [2, 6, 20]], ['GRAPE', 12, [3, 10, 30]], ['BELL', 8, [5, 20, 60]], ['SEVEN', 4, [10, 50, 200]], ['WILD', 3, [20, 100, 500]]] },
  treasure: { symbols: [['BAR', 26, [1, 3, 10]], ['BELL', 22, [1, 4, 12]], ['STAR', 18, [2, 5, 15]], ['MELON', 14, [2, 8, 25]], ['DIAMOND', 10, [4, 12, 40]], ['SEVEN', 5, [10, 40, 150]], ['WILD', 3, [20, 100, 500]]] },
  space: { symbols: [['STAR', 26, [1, 3, 10]], ['PLUM', 22, [1, 4, 12]], ['BAR', 18, [2, 5, 15]], ['DIAMOND', 13, [3, 8, 25]], ['BONUS', 9, [4, 15, 50]], ['SEVEN', 5, [10, 40, 150]], ['WILD', 3, [20, 100, 500]]] },
};
const DEMO_SLOT_LINES = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2]];
/** Scales every slot pay so the long-run return stays near 95% (verified by test_demo.ts). */
const DEMO_SLOT_SCALE: Record<string, number> = { fruits: 8.0, treasure: 5.8, space: 5.45 };

const DEMO_KENO_PAYS = [0, 0, 1, 3, 20, 300];          // 5 picks, 20 of 80 drawn
const DEMO_BINGO_PAYS = [0, 5, 20, 90, 250, 500];      // lines completed with 30 of 75 balls
const DEMO_SCRATCH_PRIZES: Array<[number, number]> = [[1, 0.17], [2, 0.15], [5, 0.04], [10, 0.012], [20, 0.004], [50, 0.001], [100, 0.0002]];

const DEMO_DOG_NAMES = ['Ballymac Blaze', 'Swift Rumour', 'Droopys Jet', 'Kinda Sparky', 'Romeo Magico', 'Salacres Dream', 'Bombay Pat', 'Clona Fire', 'Coolavanny Ace', 'Garryglass Dot', 'Hiya Butt', 'Lenson Bocko'];
const DEMO_HORSE_NAMES = ['Northern Comet', 'Silver Ledger', 'Queen of Tides', 'Midnight Ballot', 'Copper Harbour', 'Lord Kestrel', 'Velvet Thunder', 'Atlas Rising', 'Sea of Lanterns', 'Iron Prospect', 'Golden Meridian', 'Highland Rebel', 'Paper Tiger', 'Starlit Echo'];
const DEMO_DOG_TRACKS = ['Romford Virtual', 'Towcester Virtual', 'Shelbourne Park Virtual'];
const DEMO_HORSE_TRACKS = ['Ascot Virtual', 'Longchamp Virtual', 'Saratoga Virtual', 'Meydan Virtual'];

function demoPick<T>(list: T[], rng: DemoRng): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function demoRoundId(rng: DemoRng): string {
  return `demo-${Math.floor(rng() * 0xffffffff).toString(16).padStart(8, '0')}`;
}

function demoCard(rng: DemoRng): { value: string; suit: string; rank: number } {
  const r = Math.floor(rng() * 13) % 13;
  return { value: DEMO_RANKS[r], suit: DEMO_SUITS[Math.floor(rng() * 4) % 4], rank: r + 2 };
}

function demoCardPoints(c: { rank: number }): number {
  return c.rank === 14 ? 11 : c.rank >= 10 ? 10 : c.rank;
}

function demoBlackjackTotal(hand: Array<{ rank: number }>): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of hand) { total += demoCardPoints(c); if (c.rank === 14) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

function demoBaccaratValue(hand: Array<{ rank: number }>): number {
  return hand.reduce((acc, c) => acc + (c.rank === 14 ? 1 : c.rank >= 10 ? 0 : c.rank), 0) % 10;
}

export class DemoCasino {
  public static readonly slotThemeFor = (slug: string): string =>
    /treasure|ancient|olympus/i.test(slug) ? 'treasure' : /space|rocket/i.test(slug) ? 'space' : 'fruits';

  public static roulette(type: string, stake: number, rng: DemoRng): DemoRound {
    const number = Math.floor(rng() * 37) % 37;
    const color = number === 0 ? 'GREEN' : DEMO_RED.has(number) ? 'RED' : 'BLACK';
    const won = number !== 0 && (type === color || (type === 'EVEN' && number % 2 === 0) || (type === 'ODD' && number % 2 === 1)
      || (type === 'LOW' && number <= 18) || (type === 'HIGH' && number >= 19));
    return { payout: won ? stake * 2 : 0, roundId: demoRoundId(rng), gameState: { winningNumber: number, winningColor: color } };
  }

  public static slots(slug: string, stake: number, rng: DemoRng): DemoRound {
    const themeKey = this.slotThemeFor(slug);
    const theme = DEMO_SLOT_THEMES[themeKey];
    const weightTotal = theme.symbols.reduce((acc, s) => acc + s[1], 0);
    const draw = () => {
      let r = rng() * weightTotal;
      for (const s of theme.symbols) { r -= s[1]; if (r < 0) return s[0]; }
      return theme.symbols[0][0];
    };
    const grid = [0, 1, 2].map(() => [0, 1, 2, 3, 4].map(() => draw()));
    const winningLines: any[] = [];
    let units = 0;
    DEMO_SLOT_LINES.forEach((rows, line) => {
      const symbols = rows.map((row, reel) => grid[row][reel]);
      const lead = symbols.find((s) => s !== 'WILD') || 'WILD';
      let count = 0;
      while (count < 5 && (symbols[count] === lead || symbols[count] === 'WILD')) count++;
      if (count < 3) return;
      const pays = theme.symbols.find((s) => s[0] === lead)?.[2] || [0, 0, 0];
      const multiplier = pays[count - 3] * DEMO_SLOT_SCALE[themeKey];
      units += multiplier;
      winningLines.push({ line: line + 1, symbol: lead, count, multiplier });
    });
    const payout = Math.round((stake * units / DEMO_SLOT_LINES.length) * 100) / 100;
    return { payout, roundId: demoRoundId(rng), gameState: { grid, winningLines, totalWinMultiplier: Math.round((payout / stake) * 100) / 100 } };
  }

  public static blackjack(stake: number, rng: DemoRng): DemoRound {
    const dealer = [demoCard(rng), demoCard(rng)];
    const player = [demoCard(rng), demoCard(rng)];
    const up = demoCardPoints(dealer[0]);
    const playerBj = demoBlackjackTotal(player).total === 21;
    const dealerBj = demoBlackjackTotal(dealer).total === 21;
    // Simplified basic strategy: always hit below 12, stand on 17+, hit 12-16 against a dealer 7 or better.
    if (!playerBj && !dealerBj) {
      for (;;) {
        const { total, soft } = demoBlackjackTotal(player);
        if (total >= 19 || (total >= 17 && !soft) || (total >= 13 && total <= 16 && up <= 6) || (total === 12 && up >= 4 && up <= 6)) break;
        if (total === 18 && soft && up <= 8) break;
        player.push(demoCard(rng));
      }
      if (demoBlackjackTotal(player).total <= 21) while (demoBlackjackTotal(dealer).total < 17) dealer.push(demoCard(rng));
    }
    const p = demoBlackjackTotal(player).total;
    const d = demoBlackjackTotal(dealer).total;
    let outcome: string;
    let payout = 0;
    if (playerBj && !dealerBj) { outcome = 'BLACKJACK'; payout = stake * 2.5; }
    else if (playerBj && dealerBj) { outcome = 'PUSH'; payout = stake; }
    else if (dealerBj) { outcome = 'DEALER BLACKJACK'; }
    else if (p > 21) { outcome = 'BUST'; }
    else if (d > 21 || p > d) { outcome = d > 21 ? 'DEALER BUST' : 'PLAYER WINS'; payout = stake * 2; }
    else if (p === d) { outcome = 'PUSH'; payout = stake; }
    else { outcome = 'DEALER WINS'; }
    const strip = (c: any) => ({ value: c.value, suit: c.suit });
    return {
      payout, roundId: demoRoundId(rng), message: outcome,
      gameState: { dealerHand: dealer.map(strip), playerHand: player.map(strip), dealerScore: d, playerScore: p, outcome, isCompleted: true },
    };
  }

  public static baccarat(side: string, stake: number, rng: DemoRng): DemoRound {
    const player = [demoCard(rng), demoCard(rng)];
    const banker = [demoCard(rng), demoCard(rng)];
    let pv = demoBaccaratValue(player);
    let bv = demoBaccaratValue(banker);
    if (pv < 8 && bv < 8) {
      let third: number | null = null;
      if (pv <= 5) { const c = demoCard(rng); player.push(c); third = c.rank === 14 ? 1 : c.rank >= 10 ? 0 : c.rank; }
      const bankerDraws = third === null ? bv <= 5
        : bv <= 2 || (bv === 3 && third !== 8) || (bv === 4 && third >= 2 && third <= 7)
          || (bv === 5 && third >= 4 && third <= 7) || (bv === 6 && (third === 6 || third === 7));
      if (bankerDraws) banker.push(demoCard(rng));
      pv = demoBaccaratValue(player);
      bv = demoBaccaratValue(banker);
    }
    const winner = pv > bv ? 'PLAYER' : bv > pv ? 'BANKER' : 'TIE';
    let payout = 0;
    if (winner === 'TIE') payout = side === 'TIE' ? stake * 9 : stake; // player/banker bets push on a tie
    else if (winner === side) payout = side === 'BANKER' ? stake * 1.95 : stake * 2;
    const strip = (c: any) => ({ value: c.value, suit: c.suit });
    return {
      payout: Math.round(payout * 100) / 100, roundId: demoRoundId(rng),
      message: winner === 'TIE' && side !== 'TIE' ? 'Tie — stake returned' : undefined,
      gameState: { playerHand: player.map(strip), bankerHand: banker.map(strip), playerScore: pv, bankerScore: bv, winner },
    };
  }

  public static highLow(choice: string, stake: number, rng: DemoRng): DemoRound {
    const base = demoCard(rng);
    const next = demoCard(rng);
    const won = choice === 'LOWER' ? next.rank < base.rank : next.rank > base.rank;
    const verdict = next.rank === base.rank ? 'same rank, house wins' : next.rank > base.rank ? 'higher' : 'lower';
    return {
      payout: won ? stake * 2.1 : 0, roundId: demoRoundId(rng),
      gameState: { baseCard: { value: base.value, suit: base.suit }, nextCard: { value: next.value, suit: next.suit }, choice, message: `${base.value}${base.suit} → ${next.value}${next.suit} · ${verdict}` },
    };
  }

  public static keno(picks: number[], stake: number, rng: DemoRng): DemoRound {
    const pool = Array.from({ length: 80 }, (_, i) => i + 1);
    const drawn: number[] = [];
    while (drawn.length < 20) drawn.push(pool.splice(Math.floor(rng() * pool.length) % pool.length, 1)[0]);
    const matchedCount = picks.filter((n) => drawn.includes(n)).length;
    const mult = DEMO_KENO_PAYS[Math.min(matchedCount, DEMO_KENO_PAYS.length - 1)] || 0;
    return { payout: stake * mult, roundId: demoRoundId(rng), gameState: { pickedNumbers: picks, drawnNumbers: drawn, matchedCount, multiplier: mult } };
  }

  public static scratch(stake: number, rng: DemoRng): DemoRound {
    let r = rng();
    let prize = 0;
    for (const [value, chance] of DEMO_SCRATCH_PRIZES) { if (r < chance) { prize = value; break; } r -= chance; }
    const values = DEMO_SCRATCH_PRIZES.map((x) => x[0]);
    const cells: number[] = [];
    if (prize) cells.push(prize, prize, prize);
    const counts = new Map<number, number>(prize ? [[prize, 3]] : []);
    while (cells.length < 9) {
      const v = demoPick(values, rng);
      if ((counts.get(v) || 0) >= 2 && v !== prize) continue;
      if (v === prize) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
      cells.push(v);
    }
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)) % (i + 1); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    return { payout: stake * prize, roundId: demoRoundId(rng), gameState: { grid: [cells.slice(0, 3), cells.slice(3, 6), cells.slice(6, 9)], prizeMultiplier: prize } };
  }

  public static bingo(stake: number, rng: DemoRng): DemoRound {
    const card: number[][] = [0, 1, 2, 3, 4].map((col) => {
      const pool = Array.from({ length: 15 }, (_, i) => col * 15 + i + 1);
      return [0, 1, 2, 3, 4].map(() => pool.splice(Math.floor(rng() * pool.length) % pool.length, 1)[0]);
    });
    card[2][2] = 0;
    const balls = Array.from({ length: 75 }, (_, i) => i + 1);
    const drawnBalls: number[] = [];
    while (drawnBalls.length < 30) drawnBalls.push(balls.splice(Math.floor(rng() * balls.length) % balls.length, 1)[0]);
    const hit = (c: number, r: number) => card[c][r] === 0 || drawnBalls.includes(card[c][r]);
    const lines = [
      ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].every((c) => hit(c, r))),
      ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].every((r) => hit(c, r))),
      [0, 1, 2, 3, 4].every((i) => hit(i, i)),
      [0, 1, 2, 3, 4].every((i) => hit(i, 4 - i)),
    ].filter(Boolean).length;
    const multiplier = DEMO_BINGO_PAYS[Math.min(lines, DEMO_BINGO_PAYS.length - 1)];
    return { payout: stake * multiplier, roundId: demoRoundId(rng), gameState: { card, drawnBalls, completedLines: lines, multiplier } };
  }

  // ---- Virtual racing -------------------------------------------------------

  public static raceCard(kind: 'GREYHOUND' | 'HORSE', raceNumber: number, now: number, rng: DemoRng): any {
    const names = (kind === 'HORSE' ? DEMO_HORSE_NAMES : DEMO_DOG_NAMES).slice();
    const size = kind === 'HORSE' ? 8 : 6;
    const runners: any[] = [];
    for (let i = 0; i < size; i++) {
      const name = names.splice(Math.floor(rng() * names.length) % names.length, 1)[0];
      runners.push({ number: i + 1, trapNumber: i + 1, name, rating: 62 + Math.floor(rng() * 34), form: Array.from({ length: 4 }, () => 1 + Math.floor(rng() * 6)).join('') });
    }
    const weights = runners.map((x) => Math.exp(x.rating / 9));
    const wins = new Array(size).fill(0);
    const places = new Array(size).fill(0);
    for (let i = 0; i < 1500; i++) {
      const order = this.finishOrder(weights, rng);
      wins[order[0]]++;
      for (const idx of order.slice(0, kind === 'HORSE' ? 3 : 2)) places[idx]++;
    }
    runners.forEach((x, i) => {
      x.winOdds = Math.max(1.15, Math.round((1 / (Math.max(wins[i], 3) / 1500 * 1.16)) * 100) / 100);
      x.placeOdds = Math.max(1.05, Math.round((1 / (Math.max(places[i], 3) / 1500 * 1.16)) * 100) / 100);
    });
    const tracks = kind === 'HORSE' ? DEMO_HORSE_TRACKS : DEMO_DOG_TRACKS;
    return {
      id: `${kind.toLowerCase()}-${raceNumber}`, type: kind, raceNumber, weights,
      name: kind === 'HORSE' ? `${demoPick(['Maiden', 'Handicap', 'Novice', 'Listed'], rng)} Stakes · ${demoPick(['1m', '1m2f', '7f', '6f'], rng)}` : `Grade A${1 + Math.floor(rng() * 6)} · ${demoPick(['480m', '500m', '525m'], rng)}`,
      trackName: demoPick(tracks, rng), scheduledTime: new Date(now + 60000).toISOString(), runners,
    };
  }

  /** Plackett-Luce finish order (indices into the runner list). */
  public static finishOrder(weights: number[], rng: DemoRng): number[] {
    const left = weights.map((w, i) => ({ w, i }));
    const order: number[] = [];
    while (left.length) {
      let r = rng() * left.reduce((acc, x) => acc + x.w, 0);
      let k = 0;
      while (k < left.length - 1 && (r -= left[k].w) > 0) k++;
      order.push(left.splice(k, 1)[0].i);
    }
    return order;
  }

  public static runRace(race: any, runnerNumber: number, stake: number, rng: DemoRng): any {
    const order = this.finishOrder(race.weights || race.runners.map(() => 1), rng);
    const finishOrder = order.map((i) => race.runners[i].number);
    const winner = race.runners[order[0]];
    const mine = race.runners.find((x: any) => x.number === runnerNumber);
    const won = winner.number === runnerNumber;
    const payout = won ? Math.round(stake * Number(mine.winOdds) * 100) / 100 : 0;
    return {
      won, payout, finishOrder, raceId: race.id, winner: { number: winner.number, name: winner.name },
      message: won ? `${winner.name} wins!` : `${mine?.name || 'Your runner'} finished ${finishOrder.indexOf(runnerNumber) + 1}${['st', 'nd', 'rd'][finishOrder.indexOf(runnerNumber)] || 'th'} · ${winner.name} won`,
    };
  }
}
