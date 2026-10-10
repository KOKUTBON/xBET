/**
 * Microservices Scheduled Tasks & Health Diagnostics Contracts
 */

export const ScheduledTaskStatus = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type ScheduledTaskStatus = (typeof ScheduledTaskStatus)[keyof typeof ScheduledTaskStatus];

export interface TaskExecutionResult {
  success: boolean;
  itemsProcessed: number;
  message?: string;
  durationMs: number;
  error?: string;
}

export interface ScheduledJobDefinition {
  id: string;
  name: string;
  description: string;
  intervalMs: number;
  handler: () => Promise<TaskExecutionResult>;
  status: ScheduledTaskStatus;
  lastRunAt?: Date | null;
  nextRunAt?: Date | null;
  lastDurationMs?: number;
  runCount: number;
  failCount: number;
  lastError?: string;
  timerHandle?: any;
}

export const ServiceHealthStatus = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNHEALTHY: 'UNHEALTHY',
} as const;
export type ServiceHealthStatus = (typeof ServiceHealthStatus)[keyof typeof ServiceHealthStatus];

export interface ServiceHealthCheckResult {
  serviceName: string;
  status: ServiceHealthStatus;
  latencyMs: number;
  details?: Record<string, unknown>;
  checkedAt: Date;
}

export interface SystemHealthReport {
  overallStatus: ServiceHealthStatus;
  timestamp: Date;
  uptimeSeconds: number;
  services: ServiceHealthCheckResult[];
  activeScheduledJobsCount: number;
}
