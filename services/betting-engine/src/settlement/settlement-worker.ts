/**
 * Settlement Worker Queue & Background Processor
 * Asynchronous job queue for processing ticket payouts, concurrency locking,
 * retry backoff, and periodic reconciliation sweeps.
 */

import { SettlementEngine } from './settlement-engine.ts';
import { FixtureResultingService } from './fixture-resulting-service.ts';
import { BetPlacementService, BetSlipStatus, LegStatus } from '../betting/bet-placement.ts';
import type { BetSlipRecord } from '../betting/bet-placement.ts';

export interface SettlementJob {
  id: string;
  slipId: string;
  triggerFixtureId?: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  retryCount: number;
  maxRetries: number;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DLQ';
  error?: string;
  enqueuedAt: Date;
  processedAt?: Date;
}

export interface WorkerStats {
  queuedCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  dlqCount: number;
  totalSettledPayout: number;
  isSweeperRunning: boolean;
}

export class SettlementWorkerQueue {
  private static instance: SettlementWorkerQueue;
  private settlementEngine: SettlementEngine;
  private betService: BetPlacementService;

  private queue: SettlementJob[] = [];
  private inFlightJobs: Set<string> = new Set(); // slipId lock
  private completedJobs: Map<string, SettlementJob> = new Map();
  private dlq: SettlementJob[] = [];

  private isProcessing = false;
  private concurrencyLimit = 5;
  private activeWorkers = 0;
  private totalSettledPayout = 0;

  private sweeperIntervalTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.settlementEngine = SettlementEngine.getInstance();
    this.betService = BetPlacementService.getInstance();
  }

  public static getInstance(): SettlementWorkerQueue {
    if (!SettlementWorkerQueue.instance) {
      SettlementWorkerQueue.instance = new SettlementWorkerQueue();
    }
    return SettlementWorkerQueue.instance;
  }

  /**
   * Enqueues a bet slip settlement job
   */
  public enqueueSettlementJob(params: {
    slipId: string;
    triggerFixtureId?: string;
    priority?: 'HIGH' | 'NORMAL' | 'LOW';
    enqueuedAt?: Date;
  }): SettlementJob {
    const slipId = params.slipId;

    // Check if already in queue or currently processing
    const existing = this.queue.find((j) => j.slipId === slipId);
    if (existing) {
      return existing;
    }

    const job: SettlementJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      slipId,
      triggerFixtureId: params.triggerFixtureId,
      priority: params.priority || 'NORMAL',
      retryCount: 0,
      maxRetries: 3,
      status: 'QUEUED',
      enqueuedAt: params.enqueuedAt || new Date(),
    };

    if (job.priority === 'HIGH') {
      this.queue.unshift(job);
    } else {
      this.queue.push(job);
    }

    // Trigger processing tick
    this.scheduleProcessing();
    return job;
  }

  /**
   * Dispatches workers to process queue items
   */
  private scheduleProcessing(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    setImmediate(async () => {
      while (this.queue.length > 0 && this.activeWorkers < this.concurrencyLimit) {
        const job = this.queue.shift();
        if (!job) break;

        if (this.inFlightJobs.has(job.slipId)) {
          // Re-queue if locked
          this.queue.push(job);
          break;
        }

        this.activeWorkers++;
        this.inFlightJobs.add(job.slipId);

        this.processJob(job).finally(() => {
          this.activeWorkers--;
          this.inFlightJobs.delete(job.slipId);
          this.scheduleProcessing();
        });
      }
      this.isProcessing = false;
    });
  }

  /**
   * Processes a single settlement job
   */
  private async processJob(job: SettlementJob): Promise<void> {
    job.status = 'PROCESSING';

    try {
      const slip = this.betService.getTicket(job.slipId);
      if (!slip) {
        throw new Error(`Ticket ${job.slipId} not found`);
      }

      if (slip.status !== BetSlipStatus.ACCEPTED) {
        // Already settled (Idempotent success)
        job.status = 'COMPLETED';
        job.processedAt = new Date();
        this.completedJobs.set(job.id, job);
        return;
      }

      // Collect all known resolutions from FixtureResultingService
      const resultingService = FixtureResultingService.getInstance();
      const allGrades = resultingService.getAllGrades();

      // Check if all legs of this slip can be resolved
      const slipResolutions = new Map<string, LegStatus>();
      let allLegsGraded = true;

      for (const leg of slip.legs) {
        if (leg.status !== LegStatus.PENDING) {
          slipResolutions.set(leg.selectionId, leg.status);
          continue;
        }

        const grade = allGrades.get(leg.selectionId);
        if (grade) {
          slipResolutions.set(leg.selectionId, grade);
        } else {
          allLegsGraded = false;
        }
      }

      if (!allLegsGraded) {
        // Some legs are still pending; update whatever legs we have resolved so far
        for (const leg of slip.legs) {
          const res = slipResolutions.get(leg.selectionId);
          if (res) leg.status = res;
        }

        // If it's a combi bet and has at least one LOST leg, it can be settled as LOST immediately (early settlement)
        const hasLostLeg = slip.legs.some((l) => l.status === LegStatus.LOST);
        if (slip.betType === 'COMBI' && hasLostLeg) {
          // Early COMBI settlement
          const settled = this.settlementEngine.settleBetSlip(slip.id, slipResolutions);
          this.totalSettledPayout += settled.actualPayout;
          job.status = 'COMPLETED';
          job.processedAt = new Date();
          this.completedJobs.set(job.id, job);
          return;
        }

        // Otherwise defer until other fixtures finish
        job.status = 'COMPLETED';
        job.processedAt = new Date();
        this.completedJobs.set(job.id, job);
        return;
      }

      // Settle the slip completely
      const settled = this.settlementEngine.settleBetSlip(slip.id, slipResolutions);
      this.totalSettledPayout += settled.actualPayout;

      job.status = 'COMPLETED';
      job.processedAt = new Date();
      this.completedJobs.set(job.id, job);
      console.log(`[SettlementWorker] Successfully processed job ${job.id} for slip ${slip.slipNumber}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      job.error = errMsg;
      job.retryCount++;

      if (job.retryCount <= job.maxRetries) {
        console.warn(`[SettlementWorker] Job ${job.id} failed (attempt ${job.retryCount}/${job.maxRetries}): ${errMsg}. Retrying...`);
        job.status = 'QUEUED';
        this.queue.push(job);
      } else {
        console.error(`[SettlementWorker] Job ${job.id} moved to DLQ after ${job.retryCount} retries: ${errMsg}`);
        job.status = 'DLQ';
        this.dlq.push(job);
      }
    }
  }

  /**
   * Starts periodic reconciliation sweeper (equivalent to legacy CakePHP Cron shells)
   */
  public startSweeper(intervalMs = 10000): void {
    if (this.sweeperIntervalTimer) return;

    this.sweeperIntervalTimer = setInterval(() => {
      this.runReconciliationSweep();
    }, intervalMs);

    console.log(`[SettlementWorker] Reconciliation sweeper started (interval: ${intervalMs}ms)`);
  }

  public stopSweeper(): void {
    if (this.sweeperIntervalTimer) {
      clearInterval(this.sweeperIntervalTimer);
      this.sweeperIntervalTimer = null;
      console.log('[SettlementWorker] Reconciliation sweeper stopped.');
    }
  }

  /**
   * Sweeps through all unsettled tickets and enqueues any with resolved matches
   */
  public runReconciliationSweep(): number {
    const unsettled = this.betService.getUnsettledTickets();
    const resultingService = FixtureResultingService.getInstance();
    const allGrades = resultingService.getAllGrades();

    let enqueuedCount = 0;
    for (const slip of unsettled) {
      const hasGradedLeg = slip.legs.some((leg) => allGrades.has(leg.selectionId));
      if (hasGradedLeg) {
        this.enqueueSettlementJob({ slipId: slip.id, priority: 'LOW' });
        enqueuedCount++;
      }
    }

    if (enqueuedCount > 0) {
      console.log(`[SettlementWorker Sweep] Enqueued ${enqueuedCount} unsettled tickets for settlement evaluation.`);
    }

    return enqueuedCount;
  }

  public getStats(): WorkerStats {
    return {
      queuedCount: this.queue.length,
      processingCount: this.activeWorkers,
      completedCount: this.completedJobs.size,
      failedCount: this.dlq.length,
      dlqCount: this.dlq.length,
      totalSettledPayout: parseFloat(this.totalSettledPayout.toFixed(2)),
      isSweeperRunning: this.sweeperIntervalTimer !== null,
    };
  }

  public getDLQ(): SettlementJob[] {
    return this.dlq;
  }
}
