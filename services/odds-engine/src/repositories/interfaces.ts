import type { LiveFixtureState, LiveOddsDelta, LiveScoreDelta } from '../domain/live-state.ts';

export interface IFixtureRepository {
  upsertFixture(fixture: LiveFixtureState): Promise<void>;
  updateOdds(delta: LiveOddsDelta): Promise<void>;
  updateScore(delta: LiveScoreDelta): Promise<void>;
  getInPlayFixtures(): Promise<LiveFixtureState[]>;
}
