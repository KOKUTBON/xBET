import { DatabaseClient } from '../../../../packages/database/src/client.ts';
import type { IBetSlipRepository } from '../interfaces.ts';
import type { BetSlipRecord, BetSlipStatus, BetLegRecord, LegStatus } from '../../betting/bet-placement.ts';
import type { BetSlipType } from '../../betting/bet-validator.ts';

export class BetSlipPrismaRepository implements IBetSlipRepository {
  public async save(slip: BetSlipRecord): Promise<void> {
    const prisma = await DatabaseClient.getClient();
    await prisma.$transaction(async (tx: any) => {
      await tx.betSlip.upsert({
        where: { id: slip.id },
        create: {
          id: slip.id,
          slipNumber: slip.slipNumber,
          userId: slip.userId,
          betType: slip.betType,
          status: slip.status,
          currencyCode: slip.currencyCode,
          stakeAmount: slip.stake,
          totalOdds: slip.totalOdds,
          potentialPayout: slip.potentialPayout,
          actualPayout: slip.actualPayout,
          cashoutAmount: slip.cashoutOffer,
          settledAt: slip.settledAt,
          createdAt: slip.createdAt,
        },
        update: {
          status: slip.status,
          actualPayout: slip.actualPayout,
          cashoutAmount: slip.cashoutOffer,
          settledAt: slip.settledAt,
        },
      });

      for (const leg of slip.legs) {
        await tx.betLeg.upsert({
          where: { id: leg.id },
          create: {
            id: leg.id,
            betSlipId: slip.id,
            selectionId: leg.selectionId,
            marketId: leg.marketId,
            fixtureId: leg.fixtureId,
            lockedOdds: leg.lockedOdds,
            status: leg.status,
            fixtureNameSnapshot: leg.fixtureName,
            marketNameSnapshot: leg.marketName,
            selectionNameSnapshot: leg.selectionName,
          },
          update: {
            status: leg.status,
          },
        });
      }
    });
  }

  public async findById(id: string): Promise<BetSlipRecord | undefined> {
    const prisma = await DatabaseClient.getClient();
    const slip = await prisma.betSlip.findUnique({
      where: { id },
      include: { legs: true },
    });
    if (!slip) return undefined;
    return this.mapToRecord(slip);
  }

  public async findByUserId(userId: string): Promise<BetSlipRecord[]> {
    const prisma = await DatabaseClient.getClient();
    const slips = await prisma.betSlip.findMany({
      where: { userId },
      include: { legs: true },
      orderBy: { createdAt: 'desc' },
    });
    return slips.map(this.mapToRecord);
  }

  public async findAll(): Promise<BetSlipRecord[]> {
    const prisma = await DatabaseClient.getClient();
    const slips = await prisma.betSlip.findMany({
      include: { legs: true },
      orderBy: { createdAt: 'desc' },
    });
    return slips.map(this.mapToRecord);
  }

  public async findByStatus(status: BetSlipStatus): Promise<BetSlipRecord[]> {
    const prisma = await DatabaseClient.getClient();
    const slips = await prisma.betSlip.findMany({
      where: { status },
      include: { legs: true },
      orderBy: { createdAt: 'desc' },
    });
    return slips.map(this.mapToRecord);
  }

  public async addUserTicket(userId: string, slipId: string): Promise<void> {
    // Relationships are already handled by userId in betSlip table in PostgreSQL
  }

  private mapToRecord(slip: any): BetSlipRecord {
    return {
      id: slip.id,
      slipNumber: slip.slipNumber,
      userId: slip.userId,
      betType: slip.betType as BetSlipType,
      status: slip.status as BetSlipStatus,
      currencyCode: slip.currencyCode,
      stake: Number(slip.stakeAmount),
      totalOdds: Number(slip.totalOdds),
      potentialPayout: Number(slip.potentialPayout),
      actualPayout: Number(slip.actualPayout || 0),
      cashoutOffer: slip.cashoutAmount ? Number(slip.cashoutAmount) : null,
      createdAt: slip.createdAt,
      settledAt: slip.settledAt,
      legs: (slip.legs || []).map((l: any): BetLegRecord => ({
        id: l.id,
        selectionId: l.selectionId,
        selectionName: l.selectionNameSnapshot,
        marketId: l.marketId,
        marketName: l.marketNameSnapshot,
        fixtureId: l.fixtureId,
        fixtureName: l.fixtureNameSnapshot,
        lockedOdds: Number(l.lockedOdds),
        status: l.status as LegStatus,
      })),
    };
  }
}
