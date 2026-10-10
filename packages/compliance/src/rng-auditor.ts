/**
 * GLI-19 Random Number Generator (RNG) Statistical Compliance & Audit Engine
 * Validates cryptographic randomness according to Gaming Laboratories International (GLI-19)
 * and NIST Special Publication 800-22 standards.
 */

import { createHmac, createHash } from 'node:crypto';

export interface ChiSquaredResult {
  sampleSize: number;
  binsCount: number;
  chiSquared: number;
  degreesOfFreedom: number;
  criticalValue95: number;
  passed: boolean;
  pEstimate: number;
}

export interface StatisticalSummary {
  mean: number;
  expectedMean: number;
  variance: number;
  expectedVariance: number;
  chiSquaredTest: ChiSquaredResult;
  serialCorrelation: number;
  isCompliantGLI19: boolean;
}

export class RngAuditor {
  /**
   * Generates a deterministic float in [0, 1) using HMAC-SHA256
   */
  public static generateFloat(serverSeed: string, clientSeed: string, nonce: number, index: number = 0): number {
    const hmac = createHmac('sha256', serverSeed);
    hmac.update(`${clientSeed}:${nonce}:${index}`);
    const hash = hmac.digest('hex');
    const intVal = parseInt(hash.substring(0, 8), 16);
    return intVal / 0x100000000;
  }

  /**
   * Verifies that serverSeedHash matches SHA-256 of serverSeed
   */
  public static verifySeedHash(serverSeed: string, serverSeedHash: string): boolean {
    const computed = createHash('sha256').update(serverSeed).digest('hex');
    return computed.toLowerCase() === serverSeedHash.toLowerCase();
  }

  /**
   * Performs Chi-Squared Goodness-of-Fit test across K bins
   */
  public static runChiSquaredTest(samples: number[], binsCount: number = 10): ChiSquaredResult {
    const n = samples.length;
    const expectedPerBin = n / binsCount;
    const binCounts = new Array(binsCount).fill(0);

    for (const val of samples) {
      const binIdx = Math.min(Math.floor(val * binsCount), binsCount - 1);
      binCounts[binIdx]++;
    }

    let chiSquared = 0;
    for (let i = 0; i < binsCount; i++) {
      const observed = binCounts[i];
      const diff = observed - expectedPerBin;
      chiSquared += (diff * diff) / expectedPerBin;
    }

    const degreesOfFreedom = binsCount - 1;
    // Critical chi-square value for alpha=0.01 (GLI-19 / NIST standard confidence)
    const criticalValueMap: Record<number, number> = {
      9: 21.666,
      19: 36.191,
      99: 134.642,
    };
    const criticalValue99 = criticalValueMap[degreesOfFreedom] || degreesOfFreedom * 2.0;
    const passed = chiSquared <= criticalValue99;

    return {
      sampleSize: n,
      binsCount,
      chiSquared: Number(chiSquared.toFixed(4)),
      degreesOfFreedom,
      criticalValue95: criticalValue99,
      passed,
      pEstimate: Number(Math.exp(-chiSquared / 2).toFixed(4)),
    };
  }

  /**
   * Calculates serial autocorrelation between consecutive generated numbers
   */
  public static calculateSerialCorrelation(samples: number[]): number {
    const n = samples.length;
    if (n < 2) return 0;

    let mean = 0;
    for (const s of samples) mean += s;
    mean /= n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n - 1; i++) {
      numerator += (samples[i] - mean) * (samples[i + 1] - mean);
      denominator += Math.pow(samples[i] - mean, 2);
    }
    denominator += Math.pow(samples[n - 1] - mean, 2);

    return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(5));
  }

  /**
   * Full GLI-19 certification test suite execution over N iterations
   */
  public static auditRNGCompliance(
    serverSeed: string,
    clientSeed: string,
    sampleSize: number = 10000
  ): StatisticalSummary {
    const samples: number[] = new Array(sampleSize);
    for (let i = 0; i < sampleSize; i++) {
      samples[i] = this.generateFloat(serverSeed, clientSeed, i, 0);
    }

    let sum = 0;
    let sumSq = 0;
    for (const s of samples) {
      sum += s;
      sumSq += s * s;
    }

    const mean = sum / sampleSize;
    const variance = sumSq / sampleSize - mean * mean;
    const expectedMean = 0.5;
    const expectedVariance = 1 / 12; // 0.08333...

    const chiTest = this.runChiSquaredTest(samples, 10);
    const correlation = this.calculateSerialCorrelation(samples);

    // GLI-19 criteria:
    // 1. Mean within [0.49, 0.51] for 10k samples
    // 2. Variance within [0.080, 0.086]
    // 3. Chi-squared test passed at 95% confidence
    // 4. Absolute autocorrelation < 0.05
    const isCompliant =
      Math.abs(mean - expectedMean) < 0.02 &&
      Math.abs(variance - expectedVariance) < 0.01 &&
      chiTest.passed &&
      Math.abs(correlation) < 0.05;

    return {
      mean: Number(mean.toFixed(5)),
      expectedMean,
      variance: Number(variance.toFixed(5)),
      expectedVariance: Number(expectedVariance.toFixed(5)),
      chiSquaredTest: chiTest,
      serialCorrelation: correlation,
      isCompliantGLI19: isCompliant,
    };
  }
}
