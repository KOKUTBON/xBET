/**
 * Versioned calibration parameters and catalog for Virtual Racing.
 * Strictly eliminates Math.random() in favor of versioned track physics,
 * runner skill profiles, and mathematical bookmaker overround modeling.
 */

export const VIRTUAL_RACING_CALIBRATION_VERSION = 'v1.0.0';

export interface VirtualTrackConfig {
  trackId: string;
  name: string;
  type: 'GREYHOUND_RACING' | 'HORSE_RACING';
  distanceMeters: number;
  laneCount: number;
  surface: 'TURF' | 'SAND' | 'SYNTHETIC';
  turnCount: number;
  innerLaneAdvantage: number; // Decimal advantage for inside traps
  tickIntervalSeconds: number; // Simulation tick step in seconds
}

export interface VirtualRunnerProfile {
  id: string;
  name: string;
  baseRating: number;      // 60 to 95
  acceleration: number;    // 0.85 to 1.20 (early race phase)
  topSpeedMps: number;     // Meters per second (15.5 to 18.0)
  stamina: number;         // 0.85 to 1.20 (late race phase)
  consistency: number;     // 0.85 to 1.20 (RNG noise variance damping)
  preferredLane?: number;  // 1-indexed preferred lane/trap
}

export const VIRTUAL_TRACKS: Record<string, VirtualTrackConfig> = {
  wimbledon_park: {
    trackId: 'wimbledon_park',
    name: 'Wimbledon Park',
    type: 'GREYHOUND_RACING',
    distanceMeters: 480,
    laneCount: 6,
    surface: 'SAND',
    turnCount: 2,
    innerLaneAdvantage: 0.012,
    tickIntervalSeconds: 2.0,
  },
  shelbourne_park: {
    trackId: 'shelbourne_park',
    name: 'Shelbourne Park',
    type: 'GREYHOUND_RACING',
    distanceMeters: 500,
    laneCount: 6,
    surface: 'SAND',
    turnCount: 2,
    innerLaneAdvantage: 0.010,
    tickIntervalSeconds: 2.0,
  },
  ascot_derby: {
    trackId: 'ascot_derby',
    name: 'Ascot Derby',
    type: 'HORSE_RACING',
    distanceMeters: 1600,
    laneCount: 8,
    surface: 'TURF',
    turnCount: 2,
    innerLaneAdvantage: 0.008,
    tickIntervalSeconds: 5.0,
  },
  longchamp_sprint: {
    trackId: 'longchamp_sprint',
    name: 'Longchamp Sprint',
    type: 'HORSE_RACING',
    distanceMeters: 1200,
    laneCount: 8,
    surface: 'TURF',
    turnCount: 1,
    innerLaneAdvantage: 0.006,
    tickIntervalSeconds: 4.0,
  },
};

export const GREYHOUND_PROFILES: VirtualRunnerProfile[] = [
  { id: 'gh-01', name: 'Flash Bullet', baseRating: 88, acceleration: 1.15, topSpeedMps: 17.2, stamina: 0.92, consistency: 0.95, preferredLane: 1 },
  { id: 'gh-02', name: 'Thunder Bolt', baseRating: 82, acceleration: 1.04, topSpeedMps: 16.8, stamina: 1.02, consistency: 0.92, preferredLane: 2 },
  { id: 'gh-03', name: 'Swift Comet', baseRating: 85, acceleration: 1.10, topSpeedMps: 17.0, stamina: 0.96, consistency: 0.94, preferredLane: 3 },
  { id: 'gh-04', name: 'Rapid Shadow', baseRating: 79, acceleration: 0.98, topSpeedMps: 16.6, stamina: 1.05, consistency: 0.90, preferredLane: 4 },
  { id: 'gh-05', name: 'Rocket Storm', baseRating: 91, acceleration: 1.18, topSpeedMps: 17.4, stamina: 0.91, consistency: 0.96, preferredLane: 5 },
  { id: 'gh-06', name: 'Golden Blaze', baseRating: 84, acceleration: 1.02, topSpeedMps: 16.9, stamina: 1.00, consistency: 0.93, preferredLane: 6 },
  { id: 'gh-07', name: 'Midnight Echo', baseRating: 76, acceleration: 0.95, topSpeedMps: 16.4, stamina: 1.04, consistency: 0.88, preferredLane: 2 },
  { id: 'gh-08', name: 'Silver Phantom', baseRating: 80, acceleration: 1.00, topSpeedMps: 16.7, stamina: 0.98, consistency: 0.91, preferredLane: 4 },
];

export const HORSE_PROFILES: VirtualRunnerProfile[] = [
  { id: 'hr-01', name: 'Starlight Express', baseRating: 89, acceleration: 1.12, topSpeedMps: 17.5, stamina: 0.95, consistency: 0.95, preferredLane: 1 },
  { id: 'hr-02', name: 'Desert King', baseRating: 86, acceleration: 1.05, topSpeedMps: 17.2, stamina: 1.02, consistency: 0.93, preferredLane: 2 },
  { id: 'hr-03', name: 'Royal Sovereign', baseRating: 92, acceleration: 1.15, topSpeedMps: 17.8, stamina: 0.98, consistency: 0.97, preferredLane: 3 },
  { id: 'hr-04', name: 'Iron Pegasus', baseRating: 81, acceleration: 0.98, topSpeedMps: 16.9, stamina: 1.06, consistency: 0.90, preferredLane: 4 },
  { id: 'hr-05', name: 'Midnight Gallop', baseRating: 84, acceleration: 1.02, topSpeedMps: 17.1, stamina: 1.01, consistency: 0.92, preferredLane: 5 },
  { id: 'hr-06', name: 'Glory Hunter', baseRating: 78, acceleration: 0.96, topSpeedMps: 16.7, stamina: 1.03, consistency: 0.89, preferredLane: 6 },
  { id: 'hr-07', name: 'Celtic Hero', baseRating: 83, acceleration: 1.01, topSpeedMps: 17.0, stamina: 0.99, consistency: 0.91, preferredLane: 7 },
  { id: 'hr-08', name: 'Silver Arrow', baseRating: 87, acceleration: 1.08, topSpeedMps: 17.3, stamina: 0.97, consistency: 0.94, preferredLane: 8 },
  { id: 'hr-09', name: 'Northern Dancer', baseRating: 90, acceleration: 1.10, topSpeedMps: 17.6, stamina: 0.96, consistency: 0.96, preferredLane: 3 },
  { id: 'hr-10', name: 'Crimson Tide', baseRating: 79, acceleration: 0.97, topSpeedMps: 16.8, stamina: 1.04, consistency: 0.89, preferredLane: 6 },
];

/**
 * Computes deterministic win and place odds from runner profiles using
 * power-law implied probabilities and a 10% bookmaker overround.
 */
export function calculateRunnerOdds(
  runners: { rating: number }[],
  placeCount: number = 2
): { winOdds: number; placeOdds: number }[] {
  const powerExponent = 2.4;
  const weights = runners.map((r) => Math.pow(r.rating, powerExponent));
  const sumWeight = weights.reduce((a, b) => a + b, 0);

  const overroundMargin = 1.10; // 110% total implied probability

  return runners.map((_, i) => {
    const rawProb = weights[i] / sumWeight;
    const fairOdds = 1.0 / (rawProb * overroundMargin);
    const winOdds = Math.max(1.20, parseFloat(fairOdds.toFixed(2)));

    // Harville place odds approximation
    const divisor = placeCount + 1.25;
    const placeFair = 1.0 + (winOdds - 1.0) / divisor;
    const placeOdds = Math.max(1.05, parseFloat(placeFair.toFixed(2)));

    return { winOdds, placeOdds };
  });
}
