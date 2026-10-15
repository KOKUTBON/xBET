/**
 * Dual-Write & Shadow Traffic Cutover Router
 * Routes incoming traffic simultaneously to the New Node/TS Microservices (Primary)
 * and Legacy CakePHP 2.x backend (Shadow) during the zero-downtime cutover window.
 */

export interface CutoverRoutingConfig {
  trafficMode: 'LEGACY_ONLY' | 'DUAL_WRITE_LEGACY_PRIMARY' | 'DUAL_WRITE_NEW_PRIMARY' | 'NEW_ONLY';
  shadowComparisonEnabled: boolean;
  maxDiscrepancyThresholdPct: number;
}

export interface CutoverExecutionResult<T> {
  primaryResult: T;
  shadowResult?: T;
  hasDiscrepancy: boolean;
  latencyPrimaryMs: number;
  latencyShadowMs?: number;
}

export class DualWriteCutoverRouter {
  private config: CutoverRoutingConfig;
  private totalDiscrepancies: number = 0;
  private totalRequests: number = 0;

  constructor(
    config: CutoverRoutingConfig = {
      trafficMode: 'DUAL_WRITE_NEW_PRIMARY',
      shadowComparisonEnabled: true,
      maxDiscrepancyThresholdPct: 0.01,
    }
  ) {
    this.config = { ...config };
  }

  public setTrafficMode(mode: CutoverRoutingConfig['trafficMode']): void {
    this.config.trafficMode = mode;
  }

  public getTrafficMode(): CutoverRoutingConfig['trafficMode'] {
    return this.config.trafficMode;
  }

  public async executeDualWrite<T>(
    operationName: string,
    newHandler: () => Promise<T> | T,
    legacyHandler: () => Promise<T> | T,
    compareFn?: (newRes: T, legacyRes: T) => boolean
  ): Promise<CutoverExecutionResult<T>> {
    this.totalRequests++;

    switch (this.config.trafficMode) {
      case 'LEGACY_ONLY': {
        const start = performance.now();
        const res = await legacyHandler();
        return {
          primaryResult: res,
          hasDiscrepancy: false,
          latencyPrimaryMs: performance.now() - start,
        };
      }

      case 'NEW_ONLY': {
        const start = performance.now();
        const res = await newHandler();
        return {
          primaryResult: res,
          hasDiscrepancy: false,
          latencyPrimaryMs: performance.now() - start,
        };
      }

      case 'DUAL_WRITE_NEW_PRIMARY':
      default: {
        const startNew = performance.now();
        const primaryResult = await newHandler();
        const latencyPrimaryMs = performance.now() - startNew;

        let shadowResult: T | undefined;
        let latencyShadowMs: number | undefined;
        let hasDiscrepancy = false;

        if (this.config.shadowComparisonEnabled) {
          const startShadow = performance.now();
          try {
            shadowResult = await legacyHandler();
            latencyShadowMs = performance.now() - startShadow;

            if (compareFn) {
              hasDiscrepancy = !compareFn(primaryResult, shadowResult);
            } else {
              hasDiscrepancy = JSON.stringify(primaryResult) !== JSON.stringify(shadowResult);
            }

            if (hasDiscrepancy) {
              this.totalDiscrepancies++;
            }
          } catch (err) {
            // Shadow failure does not block primary execution
            hasDiscrepancy = true;
            this.totalDiscrepancies++;
          }
        }

        return {
          primaryResult,
          shadowResult,
          hasDiscrepancy,
          latencyPrimaryMs,
          latencyShadowMs,
        };
      }
    }
  }

  public getDiscrepancyRate(): number {
    if (this.totalRequests === 0) return 0;
    return this.totalDiscrepancies / this.totalRequests;
  }

  public shouldAbortCutover(): boolean {
    return this.getDiscrepancyRate() > this.config.maxDiscrepancyThresholdPct;
  }
}
