/**
 * Background Asynchronous Notification Queue & Retry Worker
 * Ported and modernized from CakePHP Queue Plugin (app/Plugin/Queue).
 * Ensures zero delay on user-facing HTTP requests while retrying failed deliveries.
 */

import { randomUUID } from 'crypto';
import { NotificationEngine } from '../notification-engine.ts';
import type { NotificationPayload } from '../notification-engine.ts';
import { MockSmsTransport } from '../transports/sms-transport.ts';
import type { ISmsTransport, OutgoingSmsMessage } from '../transports/sms-transport.ts';

export interface NotificationJob {
  id: string;
  type: 'EMAIL' | 'SMS' | 'MULTI_CHANNEL';
  payload: NotificationPayload;
  smsPayload?: OutgoingSmsMessage;
  retryCount: number;
  maxRetries: number;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DLQ';
  error?: string;
  enqueuedAt: Date;
  processedAt?: Date;
}

export class NotificationQueue {
  private static instance: NotificationQueue;
  private queue: NotificationJob[] = [];
  private completedJobs: Map<string, NotificationJob> = new Map();
  private dlq: NotificationJob[] = [];
  private notificationEngine: NotificationEngine;
  private smsTransport: ISmsTransport;

  private isProcessing = false;
  private concurrencyLimit = 5;
  private activeWorkers = 0;

  private constructor() {
    this.notificationEngine = NotificationEngine.getInstance();
    this.smsTransport = new MockSmsTransport();
  }

  public static getInstance(): NotificationQueue {
    if (!NotificationQueue.instance) {
      NotificationQueue.instance = new NotificationQueue();
    }
    return NotificationQueue.instance;
  }

  public setSmsTransport(transport: ISmsTransport): void {
    this.smsTransport = transport;
  }

  public getSmsTransport(): ISmsTransport {
    return this.smsTransport;
  }

  public enqueueEmail(payload: NotificationPayload): NotificationJob {
    const job: NotificationJob = {
      id: `job-notif-${Date.now()}-${randomUUID().slice(0, 6)}`,
      type: 'EMAIL',
      payload,
      retryCount: 0,
      maxRetries: 3,
      status: 'QUEUED',
      enqueuedAt: new Date(),
    };

    this.queue.push(job);
    this.scheduleProcessing();
    return job;
  }

  public enqueueSms(sms: OutgoingSmsMessage): NotificationJob {
    const job: NotificationJob = {
      id: `job-sms-${Date.now()}-${randomUUID().slice(0, 6)}`,
      type: 'SMS',
      payload: {
        recipientEmail: '',
        type: 'WELCOME_REGISTRATION' as any,
        variables: {},
      },
      smsPayload: sms,
      retryCount: 0,
      maxRetries: 3,
      status: 'QUEUED',
      enqueuedAt: new Date(),
    };

    this.queue.push(job);
    this.scheduleProcessing();
    return job;
  }

  private scheduleProcessing(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    setImmediate(async () => {
      while (this.queue.length > 0 && this.activeWorkers < this.concurrencyLimit) {
        const job = this.queue.shift();
        if (!job) break;

        this.activeWorkers++;
        this.processJob(job).finally(() => {
          this.activeWorkers--;
          this.scheduleProcessing();
        });
      }
      this.isProcessing = false;
    });
  }

  private async processJob(job: NotificationJob): Promise<void> {
    job.status = 'PROCESSING';

    try {
      if (job.type === 'EMAIL') {
        await this.notificationEngine.sendNotification(job.payload);
      } else if (job.type === 'SMS' && job.smsPayload) {
        await this.smsTransport.sendSms(job.smsPayload);
      }

      job.status = 'COMPLETED';
      job.processedAt = new Date();
      this.completedJobs.set(job.id, job);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      job.error = errMsg;
      job.retryCount++;

      if (job.retryCount <= job.maxRetries) {
        console.warn(`[NotificationQueue] Job ${job.id} failed (attempt ${job.retryCount}/${job.maxRetries}): ${errMsg}. Retrying...`);
        job.status = 'QUEUED';
        this.queue.push(job);
      } else {
        console.error(`[NotificationQueue] Job ${job.id} moved to DLQ: ${errMsg}`);
        job.status = 'DLQ';
        this.dlq.push(job);
      }
    }
  }

  public getStats() {
    return {
      queued: this.queue.length,
      processing: this.activeWorkers,
      completed: this.completedJobs.size,
      dlq: this.dlq.length,
    };
  }

  public getDLQ(): NotificationJob[] {
    return [...this.dlq];
  }
}
