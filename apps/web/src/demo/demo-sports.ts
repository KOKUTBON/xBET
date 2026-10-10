/**
 * Static demo sports engine (GitHub Pages build only).
 *
 * Pure TypeScript with no DOM or network access: a catalogue of competitions,
 * sport-specific match simulation, Monte-Carlo market pricing and result grading.
 * Every top-level name is prefixed with `demo`/`DEMO_` because the frontend
 * bundler flattens all modules into one shared scope.
 */

export type DemoRng = () => number;

/** Small, fast, seedable PRNG (mulberry32) so tests can replay whole matches. */
export function demoSeededRng(seed: number): DemoRng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoPoisson(lambda: number, rng: DemoRng): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = rng();
  while (p > limit && k < 60) { k++; p *= rng(); }
  return k;
}

function demoClamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function demoOrdinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th';
  return `${n}${s}`;
}

// ============================================================================
// Catalogue
// ============================================================================

export interface DemoLeague {
  sportId: number;
  name: string;
  /** Competitor name and strength rating (roughly 60-95). */
  teams: Array<[string, number]>;
}

export const DEMO_LEAGUES: DemoLeague[] = [
  { sportId: 1, name: 'UEFA Champions League', teams: [['Real Madrid', 92], ['Manchester City', 91], ['Bayern Munich', 90], ['Liverpool', 90], ['Arsenal', 90], ['Paris Saint-Germain', 89], ['Barcelona', 89], ['Inter', 87], ['Atlético Madrid', 85], ['Borussia Dortmund', 83], ['Napoli', 83], ['Benfica', 80]] },
  { sportId: 1, name: 'Premier League', teams: [['Arsenal', 90], ['Liverpool', 90], ['Manchester City', 91], ['Chelsea', 85], ['Newcastle United', 83], ['Aston Villa', 82], ['Tottenham Hotspur', 82], ['Manchester United', 80], ['Brighton', 78], ['Crystal Palace', 77], ['Nottingham Forest', 77], ['Bournemouth', 76], ['Brentford', 76], ['Fulham', 75], ['West Ham United', 75], ['Everton', 72]] },
  { sportId: 1, name: 'Spanish La Liga', teams: [['Real Madrid', 92], ['Barcelona', 89], ['Atlético Madrid', 85], ['Athletic Club', 80], ['Villarreal', 79], ['Real Sociedad', 78], ['Real Betis', 78], ['Girona', 76], ['Sevilla', 75], ['Valencia', 73]] },
  { sportId: 1, name: 'German Bundesliga', teams: [['Bayern Munich', 90], ['Bayer Leverkusen', 86], ['Borussia Dortmund', 83], ['RB Leipzig', 82], ['VfB Stuttgart', 80], ['Eintracht Frankfurt', 79], ['SC Freiburg', 76], ['Wolfsburg', 74], ['Borussia Mönchengladbach', 73], ['Union Berlin', 72]] },
  { sportId: 1, name: 'Italian Serie A', teams: [['Inter', 87], ['Napoli', 83], ['Juventus', 84], ['AC Milan', 83], ['Atalanta', 83], ['Roma', 80], ['Lazio', 79], ['Fiorentina', 78], ['Bologna', 77], ['Torino', 74]] },
  { sportId: 1, name: 'French Ligue 1', teams: [['Paris Saint-Germain', 89], ['Marseille', 80], ['Monaco', 80], ['Lille', 79], ['Lyon', 78], ['Nice', 76], ['Lens', 76], ['Rennes', 75]] },
  { sportId: 1, name: 'Dutch Eredivisie', teams: [['PSV', 81], ['Feyenoord', 80], ['Ajax', 79], ['AZ Alkmaar', 75], ['FC Twente', 74], ['FC Utrecht', 71]] },
  { sportId: 1, name: 'Portuguese Primeira Liga', teams: [['Sporting CP', 82], ['Porto', 81], ['Benfica', 80], ['Braga', 76], ['Vitória SC', 71], ['Famalicão', 69]] },
  { sportId: 1, name: 'Brazilian Serie A', teams: [['Flamengo', 80], ['Palmeiras', 80], ['Botafogo', 77], ['Atlético Mineiro', 76], ['São Paulo', 75], ['Fluminense', 74], ['Internacional', 74], ['Corinthians', 73]] },
  { sportId: 1, name: 'United States MLS', teams: [['Inter Miami', 75], ['LAFC', 75], ['LA Galaxy', 74], ['Columbus Crew', 74], ['FC Cincinnati', 73], ['Seattle Sounders', 72], ['New York Red Bulls', 71], ['Orlando City', 71]] },
  { sportId: 2, name: 'ATP Shanghai Masters', teams: [['Jannik Sinner', 95], ['Carlos Alcaraz', 95], ['Novak Djokovic', 90], ['Alexander Zverev', 88], ['Taylor Fritz', 85], ['Daniil Medvedev', 85], ['Jack Draper', 84], ['Alex de Minaur', 83], ['Ben Shelton', 83], ['Lorenzo Musetti', 83], ['Casper Ruud', 82], ['Holger Rune', 82]] },
  { sportId: 2, name: 'WTA Wuhan Open', teams: [['Aryna Sabalenka', 94], ['Iga Swiatek', 93], ['Coco Gauff', 90], ['Elena Rybakina', 89], ['Jessica Pegula', 87], ['Mirra Andreeva', 87], ['Qinwen Zheng', 86], ['Jasmine Paolini', 85], ['Madison Keys', 85], ['Emma Navarro', 83]] },
  { sportId: 3, name: 'NBA', teams: [['Oklahoma City Thunder', 93], ['Boston Celtics', 92], ['Cleveland Cavaliers', 90], ['Denver Nuggets', 89], ['New York Knicks', 88], ['Minnesota Timberwolves', 87], ['Dallas Mavericks', 87], ['Houston Rockets', 86], ['Los Angeles Lakers', 86], ['Milwaukee Bucks', 86], ['Golden State Warriors', 85], ['Indiana Pacers', 85], ['Phoenix Suns', 83], ['Miami Heat', 82]] },
  { sportId: 3, name: 'EuroLeague', teams: [['Fenerbahçe Beko', 86], ['Real Madrid Baloncesto', 86], ['Panathinaikos', 85], ['Olympiacos', 85], ['AS Monaco Basket', 84], ['Anadolu Efes', 82], ['Žalgiris Kaunas', 80], ['Partizan', 80]] },
  { sportId: 4, name: 'NHL', teams: [['Florida Panthers', 90], ['Edmonton Oilers', 90], ['Dallas Stars', 88], ['Colorado Avalanche', 88], ['Winnipeg Jets', 87], ['Carolina Hurricanes', 87], ['Toronto Maple Leafs', 86], ['Vegas Golden Knights', 86], ['New York Rangers', 85], ['Tampa Bay Lightning', 85], ['Washington Capitals', 85], ['Boston Bruins', 83]] },
  { sportId: 4, name: 'Swedish SHL', teams: [['Skellefteå AIK', 82], ['Frölunda HC', 81], ['Luleå HF', 80], ['Färjestad BK', 79], ['Rögle BK', 77], ['Växjö Lakers', 77]] },
  { sportId: 7, name: 'NFL', teams: [['Kansas City Chiefs', 91], ['Philadelphia Eagles', 91], ['Baltimore Ravens', 90], ['Buffalo Bills', 90], ['Detroit Lions', 89], ['San Francisco 49ers', 85], ['Washington Commanders', 85], ['Green Bay Packers', 85], ['Minnesota Vikings', 84], ['Los Angeles Rams', 84], ['Denver Broncos', 83], ['Houston Texans', 83], ['Cincinnati Bengals', 83], ['Pittsburgh Steelers', 82]] },
  { sportId: 7, name: 'NCAAF College Football', teams: [['Ohio State Buckeyes', 88], ['Georgia Bulldogs', 87], ['Texas Longhorns', 87], ['Oregon Ducks', 86], ['Penn State Nittany Lions', 85], ['Notre Dame Fighting Irish', 85]] },
  { sportId: 8, name: 'MLB Postseason', teams: [['Los Angeles Dodgers', 90], ['New York Yankees', 88], ['Philadelphia Phillies', 87], ['Milwaukee Brewers', 86], ['Toronto Blue Jays', 85], ['Chicago Cubs', 85], ['San Diego Padres', 85], ['Detroit Tigers', 84], ['Seattle Mariners', 84], ['Boston Red Sox', 84]] },
  { sportId: 9, name: 'EHF Champions League', teams: [['Barça Handbol', 92], ['SC Magdeburg', 90], ['Veszprém', 89], ['Füchse Berlin', 88], ['Aalborg Håndbold', 87], ['THW Kiel', 87], ['Paris Saint-Germain Handball', 86], ['Industria Kielce', 85]] },
];

// ============================================================================
// Sport models
// ============================================================================

/** Minimal state that pricing simulations clone; display-only data lives on the fixture. */
export interface DemoSimState {
  t: number;
  home: number;
  away: number;
  done: boolean;
  ot?: number;
  red?: number[];
  g?: number[];        // tennis: games in the current set
  server?: number;     // tennis: 0 home, 1 away
  games?: number;      // tennis: total games played
}

export interface DemoSimDetail {
  events: Array<{ at: string; text: string; side: number; kind: string }>;
  periods: number[][];
  stats: Record<string, number[]>;
  sets?: number[][];
  last?: string;
}

interface DemoSportModel {
  id: number;
  name: string;
  units: number;          // regulation units (minutes, half-innings, games estimate)
  periodUnits: number;
  advance: number;        // chance per real tick that a live event advances one unit
  totalsName: string;
  handicapName: string;
  markets: string[];
  params(ra: number, rb: number): number[];
  step(s: DemoSimState, p: number[], ra: number, rb: number, rng: DemoRng, d?: DemoSimDetail, names?: string[]): void;
  clock(s: DemoSimState): string;
  periodLabel(i: number): string;
}

function demoLog(d: DemoSimDetail | undefined, at: string, text: string, side: number, kind: string, keep = true): void {
  if (!d) return;
  d.last = text;
  if (keep) d.events.push({ at, text, side, kind });
  if (d.events.length > 40) d.events.splice(0, d.events.length - 40);
}

function demoPeriodAdd(d: DemoSimDetail | undefined, index: number, side: number, points: number): void {
  if (!d) return;
  while (d.periods.length <= index) d.periods.push([0, 0]);
  d.periods[index][side] += points;
}

const DEMO_SOCCER: DemoSportModel = {
  id: 1, name: 'Soccer', units: 90, periodUnits: 45, advance: 1, totalsName: 'Total Goals', handicapName: 'Asian Handicap',
  markets: ['1x2', 'dc', 'btts', 'tot:1.5', 'tot:2.5', 'tot:3.5', 'hcp', 'cs'],
  params: (ra, rb) => [1.42 * Math.exp((ra - rb) / 30 + 0.1) / 90, 1.18 * Math.exp((rb - ra) / 30) / 90],
  step(s, p, ra, rb, rng, d, names) {
    if (s.done) return;
    s.t++;
    const red = s.red || [0, 0];
    const rate = [p[0] * (1 - 0.3 * red[0]) * (1 + 0.15 * red[1]), p[1] * (1 - 0.3 * red[1]) * (1 + 0.15 * red[0])];
    const half = s.t <= 45 ? 0 : 1;
    const at = `${s.t}'`;
    for (const side of [0, 1]) {
      if (rng() < rate[side]) {
        if (side === 0) s.home++; else s.away++;
        demoPeriodAdd(d, half, side, 1);
        if (d) { d.stats.shots[side]++; d.stats.onTarget[side]++; }
        demoLog(d, at, `Goal! ${names?.[side] || ''} · ${s.home}-${s.away}`, side, 'goal');
      }
    }
    if (d) {
      const share = demoClamp(0.5 + (ra - rb) / 120, 0.3, 0.7);
      const poss = d.stats.possession;
      poss[0] = Math.round(demoClamp(poss[0] + (share * 100 - poss[0]) * 0.08 + (rng() - 0.5) * 3, 25, 75));
      poss[1] = 100 - poss[0];
      for (const side of [0, 1]) {
        const w = side === 0 ? share : 1 - share;
        if (rng() < 0.2 * w) { d.stats.shots[side]++; if (rng() < 0.33) d.stats.onTarget[side]++; }
        if (rng() < 0.1 * w) { d.stats.corners[side]++; if (rng() < 0.25) demoLog(d, at, `Corner · ${names?.[side] || ''}`, side, 'corner', false); }
        if (rng() < 0.02) { d.stats.yellow[side]++; demoLog(d, at, `Yellow card · ${names?.[side] || ''}`, side, 'card'); }
        if (rng() < 0.0012 && red[side] < 2) {
          red[side]++; s.red = red; d.stats.red[side]++;
          demoLog(d, at, `Red card · ${names?.[side] || ''} down to ${11 - red[side]}`, side, 'red');
        }
      }
    }
    if (s.t === 45) demoLog(d, "45'", `Half-time · ${s.home}-${s.away}`, -1, 'period');
    if (s.t >= 90) { s.done = true; demoLog(d, 'FT', `Full-time · ${s.home}-${s.away}`, -1, 'period'); }
  },
  clock: (s) => (s.done ? 'FT' : s.t === 45 ? 'HT' : `${s.t}'`),
  periodLabel: (i) => (i === 0 ? '1st half' : '2nd half'),
};

/** Goal-rate sports that are simulated minute by minute (hockey, handball). */
function demoGoalSport(id: number, name: string, perTeam: number, spread: number, units: number, periodUnits: number, labels: string[], handicapName: string, logGoals: boolean): DemoSportModel {
  return {
    id, name, units, periodUnits, advance: 0.85, totalsName: 'Total Goals', handicapName,
    markets: ['1x2', 'dc', 'tot', 'hcp'],
    params: (ra, rb) => [perTeam * Math.exp((ra - rb) / spread + 0.04) / units, perTeam * Math.exp((rb - ra) / spread) / units],
    step(s, p, _ra, _rb, rng, d, names) {
      if (s.done) return;
      s.t++;
      const period = Math.floor((s.t - 1) / periodUnits);
      const at = `${s.t}'`;
      for (const side of [0, 1]) {
        const goals = p[side] < 0.2 ? (rng() < p[side] ? 1 : 0) : demoPoisson(p[side], rng);
        if (!goals) continue;
        if (side === 0) s.home += goals; else s.away += goals;
        demoPeriodAdd(d, period, side, goals);
        demoLog(d, at, `Goal · ${names?.[side] || ''} · ${s.home}-${s.away}`, side, 'goal', logGoals);
      }
      if (d) d.stats.shots[rng() < 0.5 ? 0 : 1] += 1;
      if (s.t % periodUnits === 0 && s.t < units) demoLog(d, at, `End of ${labels[period]} · ${s.home}-${s.away}`, -1, 'period');
      if (s.t >= units) { s.done = true; demoLog(d, 'FT', `Full-time · ${s.home}-${s.away}`, -1, 'period'); }
    },
    clock(s) {
      if (s.done) return 'FT';
      const period = Math.min(labels.length, Math.floor(s.t / periodUnits) + 1);
      return `${labels.length === 2 ? 'H' : 'P'}${period} · ${s.t}'`;
    },
    periodLabel: (i) => labels[i] || `OT${i - labels.length + 1}`,
  };
}

const DEMO_HOCKEY = demoGoalSport(4, 'Ice Hockey', 2.85, 35, 60, 20, ['1st period', '2nd period', '3rd period'], 'Puck Line', true);
const DEMO_HANDBALL = demoGoalSport(9, 'Handball', 29, 70, 60, 30, ['1st half', '2nd half'], 'Handicap', false);

const DEMO_BASKETBALL: DemoSportModel = {
  id: 3, name: 'Basketball', units: 48, periodUnits: 12, advance: 0.7, totalsName: 'Total Points', handicapName: 'Point Spread',
  markets: ['ml', 'hcp', 'tot'],
  params: (ra, rb) => [demoClamp(0.36 + (ra - rb) / 500 + 0.008, 0.25, 0.47), demoClamp(0.36 + (rb - ra) / 500, 0.25, 0.47)],
  step(s, p, _ra, _rb, rng, d, names) {
    if (s.done) return;
    s.t++;
    const ot = s.ot || 0;
    const period = s.t <= 48 ? Math.floor((s.t - 1) / 12) : 4 + Math.floor((s.t - 49) / 5);
    const at = DEMO_BASKETBALL.clock(s);
    for (const side of [0, 1]) {
      for (let poss = 0; poss < 2; poss++) {
        const r = rng();
        const pts = r < 0.125 ? 3 : r < 0.125 + p[side] ? 2 : r < 0.19 + p[side] ? 1 : 0;
        if (!pts) continue;
        if (side === 0) s.home += pts; else s.away += pts;
        demoPeriodAdd(d, period, side, pts);
        if (pts === 3) demoLog(d, at, `3-pointer · ${names?.[side] || ''}`, side, 'score', false);
      }
    }
    const end = 48 + 5 * ot;
    if (s.t === end) {
      if (s.home !== s.away) { s.done = true; demoLog(d, 'Final', `Final · ${s.home}-${s.away}${ot ? ` (${ot > 1 ? `${ot}OT` : 'OT'})` : ''}`, -1, 'period'); }
      else { s.ot = ot + 1; demoLog(d, at, `Tied ${s.home}-${s.away} · overtime`, -1, 'period'); }
    } else if (s.t < 48 && s.t % 12 === 0) {
      demoLog(d, at, `End of Q${s.t / 12} · ${s.home}-${s.away}`, -1, 'period');
    }
  },
  clock(s) {
    if (s.done) return 'Final';
    if (s.t < 48 || (s.t === 48 && !s.ot)) {
      const q = Math.min(4, Math.floor(s.t / 12) + 1);
      return s.t > 0 && s.t % 12 === 0 ? `End Q${s.t / 12}` : `Q${q} ${12 - (s.t % 12)}:00`;
    }
    const n = Math.floor((s.t - 48) / 5) + 1;
    return `OT${n > 1 ? n : ''} ${5 - ((s.t - 48) % 5)}:00`;
  },
  periodLabel: (i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3}`),
};

const DEMO_FOOTBALL: DemoSportModel = {
  id: 7, name: 'American Football', units: 60, periodUnits: 15, advance: 0.8, totalsName: 'Total Points', handicapName: 'Point Spread',
  markets: ['ml', 'hcp', 'tot'],
  params: (ra, rb) => [0.042 * Math.exp((ra - rb) / 40 + 0.03), 0.042 * Math.exp((rb - ra) / 40)],
  step(s, p, ra, rb, rng, d, names) {
    if (s.done) return;
    s.t++;
    const period = Math.min(4, Math.floor((s.t - 1) / 15));
    const at = DEMO_FOOTBALL.clock(s);
    for (const side of [0, 1]) {
      const r = rng();
      const pts = r < p[side] ? 7 : r < p[side] + p[side] * 0.66 ? 3 : 0;
      if (!pts) continue;
      if (side === 0) s.home += pts; else s.away += pts;
      demoPeriodAdd(d, period, side, pts);
      demoLog(d, at, `${pts === 7 ? 'Touchdown' : 'Field goal'} · ${names?.[side] || ''} · ${s.home}-${s.away}`, side, 'score');
      if (s.t > 60) break; // sudden-death overtime
    }
    if (s.t > 60 && s.home !== s.away) { s.done = true; demoLog(d, 'Final', `Final (OT) · ${s.home}-${s.away}`, -1, 'period'); return; }
    if (s.t === 60 && s.home !== s.away) { s.done = true; demoLog(d, 'Final', `Final · ${s.home}-${s.away}`, -1, 'period'); return; }
    if (s.t === 60) demoLog(d, at, `Tied ${s.home}-${s.away} · overtime`, -1, 'period');
    if (s.t >= 70) {
      const side = rng() < 0.5 + (ra - rb) / 100 ? 0 : 1;
      if (side === 0) s.home += 3; else s.away += 3;
      demoPeriodAdd(d, 4, side, 3);
      s.done = true;
      demoLog(d, 'Final', `Overtime field goal · ${names?.[side] || ''} · ${s.home}-${s.away}`, side, 'score');
      return;
    }
    if (s.t < 60 && s.t % 15 === 0) demoLog(d, at, `End of Q${s.t / 15} · ${s.home}-${s.away}`, -1, 'period');
  },
  clock(s) {
    if (s.done) return 'Final';
    if (s.t >= 60) return `OT ${10 - (s.t - 60)}:00`;
    return s.t > 0 && s.t % 15 === 0 ? `End Q${s.t / 15}` : `Q${Math.floor(s.t / 15) + 1} ${15 - (s.t % 15)}:00`;
  },
  periodLabel: (i) => (i < 4 ? `Q${i + 1}` : 'OT'),
};

const DEMO_BASEBALL: DemoSportModel = {
  id: 8, name: 'Baseball', units: 18, periodUnits: 2, advance: 0.3, totalsName: 'Total Runs', handicapName: 'Run Line',
  markets: ['ml', 'hcp', 'tot'],
  // Index 0: home batting chance per half-inning, 1: away.
  params: (ra, rb) => [demoClamp(0.27 * Math.exp((ra - rb) / 40 + 0.03), 0.12, 0.45), demoClamp(0.27 * Math.exp((rb - ra) / 40), 0.12, 0.45)],
  step(s, p, _ra, _rb, rng, d, names) {
    if (s.done) return;
    const top = s.t % 2 === 0;           // away team bats in the top half
    const inning = Math.floor(s.t / 2);
    const side = top ? 1 : 0;
    const at = DEMO_BASEBALL.clock(s);
    s.t++;
    if (rng() < p[side]) {
      const runs = 1 + demoPoisson(0.55, rng);
      if (side === 0) s.home += runs; else s.away += runs;
      demoPeriodAdd(d, inning, side, runs);
      demoLog(d, at, `${runs} run${runs > 1 ? 's' : ''} · ${names?.[side] || ''} · ${s.home}-${s.away}`, side, 'score');
    } else {
      demoPeriodAdd(d, inning, side, 0);
    }
    if (s.t >= 17 && s.t % 2 === 1 && s.home > s.away) s.done = true;
    else if (s.t >= 18 && s.t % 2 === 0 && s.home !== s.away) s.done = true;
    else if (s.t >= 30) {
      const winner = rng() < 0.5 ? 0 : 1;
      if (winner === 0) s.home++; else s.away++;
      demoPeriodAdd(d, inning, winner, 1);
      s.done = true;
    }
    if (s.done) demoLog(d, 'Final', `Final · ${s.home}-${s.away}`, -1, 'period');
  },
  clock(s) {
    if (s.done) return 'Final';
    return `${s.t % 2 === 0 ? 'Top' : 'Bot'} ${demoOrdinal(Math.floor(s.t / 2) + 1)}`;
  },
  periodLabel: (i) => String(i + 1),
};

const DEMO_TENNIS: DemoSportModel = {
  id: 2, name: 'Tennis', units: 22, periodUnits: 10, advance: 0.45, totalsName: 'Total Games', handicapName: 'Game Handicap',
  markets: ['ml', 'sets', 'tot'],
  params: (ra, rb) => [demoClamp(0.66 + (ra - rb) / 160, 0.5, 0.88), demoClamp(0.66 + (rb - ra) / 160, 0.5, 0.88), demoClamp(0.5 + (ra - rb) / 120, 0.2, 0.8)],
  step(s, p, _ra, _rb, rng, d, names) {
    if (s.done) return;
    const g = s.g || [0, 0];
    const server = s.server || 0;
    s.t++;
    s.games = (s.games || 0) + 1;
    let winner: number;
    let tiebreak = false;
    if (g[0] === 6 && g[1] === 6) { tiebreak = true; winner = rng() < p[2] ? 0 : 1; }
    else winner = rng() < p[server] ? server : 1 - server;
    g[winner]++;
    s.g = g;
    s.server = 1 - server;
    const setNo = s.home + s.away + 1;
    if (d) {
      if (!d.sets) d.sets = [];
      d.sets[setNo - 1] = g.slice();
    }
    const setOver = tiebreak || (g[winner] >= 6 && g[winner] - g[1 - winner] >= 2);
    if (setOver) {
      if (winner === 0) s.home++; else s.away++;
      demoLog(d, `Set ${setNo}`, `Set ${setNo} · ${names?.[winner] || ''} ${g[winner]}-${g[1 - winner]}${tiebreak ? ' (TB)' : ''}`, winner, 'set');
      s.g = [0, 0];
      if (s.home === 2 || s.away === 2) {
        s.done = true;
        demoLog(d, 'Final', `Game, set and match · ${names?.[winner] || ''}`, winner, 'period');
      }
    } else if (!tiebreak && winner !== server) {
      demoLog(d, `Set ${setNo}`, `Break of serve · ${names?.[winner] || ''} ${g[0]}-${g[1]}`, winner, 'break');
    } else if (d) {
      d.last = `${names?.[winner] || ''} holds · ${g[0]}-${g[1]}`;
    }
  },
  clock(s) {
    if (s.done) return 'Final';
    const g = s.g || [0, 0];
    return `Set ${s.home + s.away + 1} · ${g[0]}-${g[1]}`;
  },
  periodLabel: (i) => `Set ${i + 1}`,
};

export const DEMO_SPORT_MODELS: Record<number, DemoSportModel> = {
  1: DEMO_SOCCER, 2: DEMO_TENNIS, 3: DEMO_BASKETBALL, 4: DEMO_HOCKEY, 7: DEMO_FOOTBALL, 8: DEMO_BASEBALL, 9: DEMO_HANDBALL,
};

// ============================================================================
// Markets: definitions, pricing and grading
// ============================================================================

const DEMO_CS_SCORES = ['1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '0-0', '1-1', '2-2', '3-3', '0-1', '0-2', '1-2', '0-3', '1-3', '2-3'];

const DEMO_MARGIN: Record<string, number> = { '1x2': 0.05, ml: 0.045, dc: 0.05, tot: 0.06, btts: 0.06, hcp: 0.06, sets: 0.1, cs: 0.18 };

interface DemoFinal { home: number; away: number; games?: number }

/** Did selection `skey` of market `mkey` (with optional line) win for this final result? */
export function demoOutcome(mkey: string, line: number | null, skey: string, f: DemoFinal, sportId: number): boolean {
  const total = sportId === 2 ? Number(f.games || 0) : f.home + f.away;
  switch (mkey) {
    case '1x2': return skey === 'H' ? f.home > f.away : skey === 'A' ? f.away > f.home : f.home === f.away;
    case 'ml': return skey === 'H' ? f.home > f.away : f.away > f.home;
    case 'dc': return skey === '1X' ? f.home >= f.away : skey === 'X2' ? f.away >= f.home : f.home !== f.away;
    case 'tot': return skey === 'O' ? total > Number(line) : total < Number(line);
    case 'btts': return (f.home > 0 && f.away > 0) === (skey === 'Y');
    case 'hcp': return skey === 'H' ? f.home + Number(line) > f.away : f.home + Number(line) < f.away;
    case 'sets': return skey === `${f.home}-${f.away}`;
    case 'cs': return skey === 'OTH' ? !DEMO_CS_SCORES.includes(`${f.home}-${f.away}`) : skey === `${f.home}-${f.away}`;
    default: return false;
  }
}

function demoFmtLine(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}

/** Half-point threshold c for which P(value > c) is closest to 50%. */
function demoHalfLine(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  let best = Math.floor(median) + 0.5;
  let bestGap = 2;
  for (const c of [Math.floor(median) - 1.5, Math.floor(median) - 0.5, Math.floor(median) + 0.5, Math.floor(median) + 1.5]) {
    const over = values.filter((v) => v > c).length / Math.max(values.length, 1);
    if (Math.abs(over - 0.5) < bestGap) { bestGap = Math.abs(over - 0.5); best = c; }
  }
  return best;
}

function demoPrice(p: number, margin: number): number | null {
  if (!(p >= 0.004)) return null;
  const raw = 1 / (Math.min(p, 0.999) * (1 + margin));
  const odds = Math.max(1.01, Math.min(raw, 500));
  return odds < 10 ? Math.round(odds * 100) / 100 : odds < 100 ? Math.round(odds * 10) / 10 : Math.round(odds);
}

export interface DemoSelectionRef { fixtureId: string; mkey: string; line: number | null; skey: string }

export function demoParseSelection(id: string): DemoSelectionRef | null {
  const parts = String(id).split('~');
  if (parts.length !== 4) return null;
  return { fixtureId: parts[0], mkey: parts[1], line: parts[2] === '' ? null : Number(parts[2]), skey: parts[3] };
}

// ============================================================================
// Fixtures
// ============================================================================

export class DemoSports {
  public static model(sportId: number): DemoSportModel {
    return DEMO_SPORT_MODELS[sportId] || DEMO_SOCCER;
  }

  private static cloneState(s: DemoSimState): DemoSimState {
    return { ...s, red: s.red ? s.red.slice() : undefined, g: s.g ? s.g.slice() : undefined };
  }

  /** Simulate `n` possible remainders of a fixture from its current state. */
  public static sampleFinals(fixture: any, rng: DemoRng, n: number): DemoFinal[] {
    const sim = fixture.sim;
    const model = this.model(fixture.sportId);
    const out: DemoFinal[] = [];
    for (let i = 0; i < n; i++) {
      const s = this.cloneState(sim.state);
      let guard = 0;
      while (!s.done && guard++ < 400) model.step(s, sim.params, sim.ra, sim.rb, rng);
      out.push({ home: s.home, away: s.away, games: s.games });
    }
    return out;
  }

  private static buildMarkets(fixture: any, finals: DemoFinal[]): any[] {
    const model = this.model(fixture.sportId);
    const id = fixture.id;
    const H = fixture.homeTeam;
    const A = fixture.awayTeam;
    const totals = finals.map((f) => (fixture.sportId === 2 ? Number(f.games || 0) : f.home + f.away));
    const margins = finals.map((f) => f.home - f.away);
    const market = (key: string, line: number | null, marketType: string, displayName: string, group: string, sels: Array<[string, string]>) => ({
      id: `${id}~${key}~${line ?? ''}`, key, line, marketType, name: displayName, displayName, group,
      selections: sels.map(([skey, name]) => ({ id: `${id}~${key}~${line ?? ''}~${skey}`, key: skey, name, odds: 0 })),
    });
    const goalGroup = [1, 4, 9].includes(fixture.sportId) ? 'GOALS' : 'TOTALS';
    return model.markets.map((spec) => {
      const [key, fixed] = spec.split(':');
      if (key === '1x2') return market('1x2', null, 'MATCH_WINNER_1X2', fixture.sportId === 4 ? '1X2 · Regulation Time' : '1X2 · Full Time Result', 'MAIN', [['H', H], ['D', 'Draw'], ['A', A]]);
      if (key === 'ml') return market('ml', null, fixture.sportId === 2 ? 'MATCH_WINNER' : 'MONEYLINE', fixture.sportId === 2 ? 'Match Winner' : 'Moneyline (incl. overtime)', 'MAIN', [['H', H], ['A', A]]);
      if (key === 'dc') return market('dc', null, 'DOUBLE_CHANCE', 'Double Chance', 'MAIN', [['1X', `${H} or Draw`], ['12', `${H} or ${A}`], ['X2', `Draw or ${A}`]]);
      if (key === 'btts') return market('btts', null, 'BOTH_TEAMS_TO_SCORE', 'Both Teams to Score', 'GOALS', [['Y', 'Yes'], ['N', 'No']]);
      if (key === 'tot') {
        const line = fixed ? Number(fixed) : demoHalfLine(totals);
        return market('tot', line, 'TOTALS', `${model.totalsName} ${line}`, goalGroup, [['O', `Over ${line}`], ['U', `Under ${line}`]]);
      }
      if (key === 'hcp') {
        const line = -demoHalfLine(margins);
        return market('hcp', line, 'HANDICAP', `${model.handicapName} ${demoFmtLine(line)}`, 'LINES', [['H', `${H} ${demoFmtLine(line)}`], ['A', `${A} ${demoFmtLine(-line)}`]]);
      }
      if (key === 'sets') return market('sets', null, 'SET_BETTING', 'Set Betting', 'SETS', [['2-0', `${H} 2-0`], ['2-1', `${H} 2-1`], ['1-2', `${A} 2-1`], ['0-2', `${A} 2-0`]]);
      return market('cs', null, 'CORRECT_SCORE', 'Correct Score', 'SCORE', [...DEMO_CS_SCORES.map((sc): [string, string] => [sc, sc]), ['OTH', 'Any other']]);
    });
  }

  /**
   * Re-price every market from fresh simulations. `smooth` blends with the previous
   * probability so quiet periods drift gently while goals move prices at once.
   */
  public static reprice(fixture: any, rng: DemoRng, n: number, smooth = 0, finals?: DemoFinal[]): void {
    const samples = finals || this.sampleFinals(fixture, rng, n);
    for (const market of fixture.markets) {
      const margin = DEMO_MARGIN[market.key] ?? 0.06;
      for (const sel of market.selections) {
        const hits = samples.reduce((acc, f) => acc + (demoOutcome(market.key, market.line, sel.key, f, fixture.sportId) ? 1 : 0), 0);
        const mc = hits / Math.max(samples.length, 1);
        const p = typeof sel.p === 'number' && smooth > 0 && mc > 0 && mc < 1 ? sel.p * smooth + mc * (1 - smooth) : mc;
        sel.p = Math.round(p * 10000) / 10000;
        const odds = fixture.status === 'FINISHED' ? null : demoPrice(p, margin);
        const previous = Number(sel.odds) || 0;
        if (odds === null) {
          sel.status = 'SUSPENDED';
          sel.isDriftUp = sel.isDriftDown = false;
          continue;
        }
        sel.status = undefined;
        if (previous && odds !== previous) {
          sel.previousOdds = previous;
          sel.isDriftUp = odds > previous;
          sel.isDriftDown = odds < previous;
        } else if (previous) {
          sel.isDriftUp = sel.isDriftDown = false;
        }
        sel.odds = odds;
      }
    }
  }

  /** Copy simulation output into the fields the existing UI components render. */
  public static syncDisplay(fixture: any): void {
    const model = this.model(fixture.sportId);
    const { state, detail } = fixture.sim;
    fixture.score = { home: state.home, away: state.away };
    if (fixture.status === 'LIVE' || fixture.status === 'FINISHED') {
      fixture.matchClock = model.clock(state);
      fixture.matchMinute = fixture.sportId === 1 ? Math.min(state.t, 90) : undefined;
    }
    fixture.lastEvent = detail.last || fixture.lastEvent;
    fixture.timeline = detail.events.slice(-14).reverse();
    const labels = detail.periods.map((_p: number[], i: number) => model.periodLabel(i));
    fixture.periodScores = fixture.sportId === 2
      ? (detail.sets || []).map((g: number[], i: number) => ({ label: `Set ${i + 1}`, home: g[0], away: g[1] }))
      : detail.periods.map((p: number[], i: number) => ({ label: labels[i], home: p[0], away: p[1] }));
    const st = detail.stats;
    fixture.stats = fixture.sportId === 1
      ? [
          { label: 'Possession %', home: st.possession[0], away: st.possession[1] },
          { label: 'Shots', home: st.shots[0], away: st.shots[1] },
          { label: 'Shots on target', home: st.onTarget[0], away: st.onTarget[1] },
          { label: 'Corners', home: st.corners[0], away: st.corners[1] },
          { label: 'Yellow cards', home: st.yellow[0], away: st.yellow[1] },
          { label: 'Red cards', home: st.red[0], away: st.red[1] },
        ]
      : [];
  }

  public static createFixture(opts: {
    id: string; league: DemoLeague; home: [string, number]; away: [string, number];
    startTime: number; rng: DemoRng; samples?: number;
  }): any {
    const { league, home, away, rng } = opts;
    const model = this.model(league.sportId);
    const fixture: any = {
      id: opts.id, sportId: league.sportId, sportName: model.name, tournamentName: league.name,
      homeTeam: home[0], awayTeam: away[0], status: 'PRE', isLive: false, startTime: opts.startTime,
      score: { home: 0, away: 0 }, matchClock: '', markets: [], timeline: [], stats: [], periodScores: [],
      sim: {
        ra: home[1], rb: away[1], params: model.params(home[1], away[1]),
        state: { t: 0, home: 0, away: 0, done: false } as DemoSimState,
        detail: { events: [], periods: [], stats: { possession: [50, 50], shots: [0, 0], onTarget: [0, 0], corners: [0, 0], yellow: [0, 0], red: [0, 0] } } as DemoSimDetail,
      },
    };
    const finals = this.sampleFinals(fixture, rng, opts.samples || 700);
    fixture.markets = this.buildMarkets(fixture, finals);
    this.reprice(fixture, rng, 0, 0, finals);
    return fixture;
  }

  public static kickOff(fixture: any): void {
    fixture.status = 'LIVE';
    fixture.isLive = true;
    const first = ({ 2: 'First serve', 3: 'Tip-off', 4: 'Face-off', 8: 'First pitch', 9: 'Throw-off' } as Record<number, string>)[fixture.sportId] || 'Kick-off';
    fixture.sim.detail.last = first;
    fixture.sim.detail.events.push({ at: fixture.sportId === 1 ? "0'" : 'Start', text: first, side: -1, kind: 'period' });
    this.syncDisplay(fixture);
  }

  /** Advance a live fixture by one unit. Returns the number of new scoring events. */
  public static advance(fixture: any, rng: DemoRng): { scored: boolean; finished: boolean } {
    const sim = fixture.sim;
    if (sim.state.done) return { scored: false, finished: true };
    const before = sim.state.home + sim.state.away;
    this.model(fixture.sportId).step(sim.state, sim.params, sim.ra, sim.rb, rng, sim.detail, [fixture.homeTeam, fixture.awayTeam]);
    const scored = sim.state.home + sim.state.away !== before;
    if (sim.state.done) {
      fixture.status = 'FINISHED';
      fixture.isLive = false;
      fixture.isSuspended = true;
      fixture.suspensionReason = 'Settled';
    }
    this.syncDisplay(fixture);
    return { scored, finished: Boolean(sim.state.done) };
  }

  /** Play the remainder instantly (used by "finish my matches" and offline catch-up). */
  public static playToEnd(fixture: any, rng: DemoRng): void {
    if (fixture.status === 'PRE') this.kickOff(fixture);
    let guard = 0;
    while (!fixture.sim.state.done && guard++ < 400) this.advance(fixture, rng);
  }

  /** WON / LOST once the fixture is finished; null while it is still running. */
  public static grade(fixture: any, selectionId: string): 'WON' | 'LOST' | null {
    if (!fixture || fixture.status !== 'FINISHED') return null;
    const ref = demoParseSelection(selectionId);
    if (!ref) return null;
    const s = fixture.sim.state;
    return demoOutcome(ref.mkey, ref.line, ref.skey, { home: s.home, away: s.away, games: s.games }, fixture.sportId) ? 'WON' : 'LOST';
  }

  public static resultText(fixture: any): string {
    if (!fixture) return '';
    const s = fixture.score || { home: 0, away: 0 };
    return `${s.home}-${s.away}`;
  }
}
