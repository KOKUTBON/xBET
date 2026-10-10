import { DatabaseClient } from '../../../../packages/database/src/client.ts';
import type { IFixtureRepository } from '../interfaces.ts';
import type { LiveFixtureState, LiveOddsDelta, LiveScoreDelta } from '../../domain/live-state.ts';

export class FixturePrismaRepository implements IFixtureRepository {
  public async upsertFixture(fixture: LiveFixtureState): Promise<void> {
    try {
      const prisma = await DatabaseClient.getClient();
      await prisma.fixture.upsert({
        where: { id: fixture.id },
        create: {
          id: fixture.id,
          tournamentId: fixture.tournamentId || 1,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          startTime: fixture.startTime,
          status: fixture.status,
          isInPlay: fixture.isInPlay,
          currentScore: fixture.score,
          matchClock: fixture.matchClock,
        },
        update: {
          status: fixture.status,
          isInPlay: fixture.isInPlay,
          currentScore: fixture.score,
          matchClock: fixture.matchClock,
        },
      });

      for (const market of fixture.markets.values()) {
        await prisma.market.upsert({
          where: { id: market.id },
          create: {
            id: market.id,
            fixtureId: fixture.id,
            marketType: market.marketType,
            name: market.name,
            line: market.line || null,
            status: market.status,
            isInPlay: market.isInPlay,
            sortOrder: market.sortOrder,
          },
          update: {
            status: market.status,
            isInPlay: market.isInPlay,
          },
        });

        for (const selection of market.selections.values()) {
          await prisma.selection.upsert({
            where: { id: selection.id },
            create: {
              id: selection.id,
              marketId: market.id,
              name: selection.name,
              odds: selection.odds,
              previousOdds: selection.previousOdds,
              status: selection.status,
              probability: selection.probability,
              sortOrder: selection.sortOrder,
            },
            update: {
              odds: selection.odds,
              previousOdds: selection.previousOdds,
              status: selection.status,
            },
          });
        }
      }
    } catch (err) {
      console.error('[FixturePrismaRepository] Failed to upsert fixture to DB:', err);
    }
  }

  public async updateOdds(delta: LiveOddsDelta): Promise<void> {
    try {
      const prisma = await DatabaseClient.getClient();
      await prisma.selection.update({
        where: { id: delta.selectionId },
        data: {
          odds: delta.newOdds,
          previousOdds: delta.oldOdds,
          status: delta.status as any,
        },
      });
    } catch (err) {
      // Non-blocking async logger
      console.warn(`[FixturePrismaRepository] DB write-through updateOdds error:`, err);
    }
  }

  public async updateScore(delta: LiveScoreDelta): Promise<void> {
    try {
      const prisma = await DatabaseClient.getClient();
      await prisma.fixture.update({
        where: { id: delta.fixtureId },
        data: {
          currentScore: delta.score,
          matchClock: delta.matchClock,
          status: delta.status as any,
        },
      });
    } catch (err) {
      console.warn(`[FixturePrismaRepository] DB write-through updateScore error:`, err);
    }
  }

  public async getInPlayFixtures(): Promise<LiveFixtureState[]> {
    // In-memory state remains primary for real-time reads
    return [];
  }
}
