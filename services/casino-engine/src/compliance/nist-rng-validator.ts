/**
 * NIST SP 800-22 RNG Statistical Test Suite & GLI-19 Certification Validator
 *
 * Implements the core statistical battery mandated by GLI-19 §2.4 (Random Number Generator Requirements):
 * 1. Frequency (Monobit) Test
 * 2. Frequency Test within a Block (Block Frequency Test)
 * 3. Runs Test
 * 4. Cumulative Sums (Cusum) Test
 * 5. Discrete Symbol Chi-Square Goodness-of-Fit Test (e.g. Roulette Pockets / Card Decks)
 *
 * Passing threshold: P-value >= 0.01 (99% confidence interval)
 */

export interface NistTestResult {
  testName: string;
  statistic: number;
  pValue: number;
  passed: boolean;
  notes?: string;
}

export interface Gli19CertificationReport {
  certId: string;
  engine: string;
  totalBitsTested: number;
  overallStatus: 'PASS' | 'FAIL';
  testResults: NistTestResult[];
  timestamp: string;
}

export class NistRngValidator {
  /**
   * Complementary error function: erfc(z) = 1 - erf(z)
   * High-precision Abramowitz and Stegun (7.1.26) approximation.
   */
  public static erfc(z: number): number {
    if (z < 0) return 2.0 - this.erfc(-z);
    const p = 0.3275911;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;

    const t = 1.0 / (1.0 + p * z);
    const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
    return poly * Math.exp(-z * z);
  }

  /**
   * Log-gamma function ln(Gamma(z)) via Lanczos approximation
   */
  public static logGamma(z: number): number {
    const c = [
      57.1562356658629235,
      -59.5979603554754912,
      14.1360979747417471,
      -0.491913816097620199,
      0.339946499848118887e-4,
      0.465236289270485756e-4,
      -0.983744753048795646e-4,
      0.158088703224378714e-3,
      -0.210264441724104883e-3,
      0.217439618115212643e-3,
      -0.16431810653676389e-3,
      0.844182239838527433e-4,
      -0.261908384015814087e-4,
      0.368991826595316234e-5,
    ];
    let sum = 0.99999999999999709182;
    for (let i = 0; i < c.length; i++) {
      sum += c[i] / (z + i + 1);
    }
    const t = z + 5.2421875;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
  }

  /**
   * Regularized Incomplete Gamma Q(a, x) = Gamma(a, x) / Gamma(a)
   * Represents Chi-Square survival probability.
   */
  public static gammaQ(a: number, x: number): number {
    if (x < 0 || a <= 0) return 0;
    if (x === 0) return 1.0;

    // Series expansion for small x, continued fraction for large x
    if (x < a + 1.0) {
      // Series representation for P(a, x), then Q = 1 - P
      let ap = a;
      let sum = 1.0 / a;
      let del = sum;
      for (let n = 1; n <= 200; n++) {
        ap += 1.0;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
      }
      const gamLog = this.logGamma(a);
      const p = sum * Math.exp(-x + a * Math.log(x) - gamLog);
      return Math.max(0, Math.min(1.0, 1.0 - p));
    } else {
      // Continued fraction representation for Q(a, x)
      let b = x + 1.0 - a;
      let c = 1.0 / 1e-30;
      let d = 1.0 / b;
      let h = d;
      for (let i = 1; i <= 200; i++) {
        const an = -i * (i - a);
        b += 2.0;
        d = an * d + b;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = b + an / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1.0 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1.0) < 1e-12) break;
      }
      const gamLog = this.logGamma(a);
      const q = Math.exp(-x + a * Math.log(x) - gamLog) * h;
      return Math.max(0, Math.min(1.0, q));
    }
  }

  /**
   * Computes the Chi-Square survival function P(X >= chi2) for degrees of freedom k.
   * Uses Wilson-Hilferty cube-root normal transformation for k >= 30,
   * and exact incomplete gamma for smaller k.
   */
  public static chiSquarePValue(k: number, chi2: number): number {
    if (chi2 <= 0) return 1.0;
    if (k <= 0) return 0.0;

    if (k >= 30) {
      const term1 = Math.pow(chi2 / k, 1.0 / 3.0);
      const term2 = 1.0 - 2.0 / (9.0 * k);
      const denom = Math.sqrt(2.0 / (9.0 * k));
      const z = (term1 - term2) / denom;
      return Math.max(0, Math.min(1.0, 0.5 * this.erfc(z / Math.SQRT2)));
    }

    return this.gammaQ(k / 2.0, chi2 / 2.0);
  }

  /**
   * 1. NIST SP 800-22 Frequency (Monobit) Test
   */
  public static frequencyMonobitTest(bits: Uint8Array): NistTestResult {
    const n = bits.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += bits[i] === 1 ? 1 : -1;
    }
    const sObs = Math.abs(s) / Math.sqrt(n);
    const pValue = this.erfc(sObs / Math.SQRT2);
    return {
      testName: 'Frequency (Monobit) Test',
      statistic: parseFloat(sObs.toFixed(6)),
      pValue: parseFloat(pValue.toFixed(6)),
      passed: pValue >= 0.01,
      notes: `n=${n}, S_n=${s}`,
    };
  }

  /**
   * 2. NIST SP 800-22 Frequency Test within a Block (Block Frequency Test)
   * Typically block size M = 128 bits
   */
  public static blockFrequencyTest(bits: Uint8Array, blockSizeM: number = 128): NistTestResult {
    const n = bits.length;
    const numBlocksN = Math.floor(n / blockSizeM);
    if (numBlocksN === 0) {
      throw new Error(`Insufficient bits (${n}) for block size ${blockSizeM}`);
    }

    let chiSquared = 0;
    for (let i = 0; i < numBlocksN; i++) {
      let blockSum = 0;
      const offset = i * blockSizeM;
      for (let j = 0; j < blockSizeM; j++) {
        blockSum += bits[offset + j];
      }
      const pi = blockSum / blockSizeM;
      chiSquared += Math.pow(pi - 0.5, 2);
    }
    chiSquared *= 4 * blockSizeM;
    const pValue = this.chiSquarePValue(numBlocksN, chiSquared);

    return {
      testName: 'Block Frequency Test',
      statistic: parseFloat(chiSquared.toFixed(6)),
      pValue: parseFloat(pValue.toFixed(6)),
      passed: pValue >= 0.01,
      notes: `M=${blockSizeM}, N=${numBlocksN}`,
    };
  }

  /**
   * 3. NIST SP 800-22 Runs Test
   */
  public static runsTest(bits: Uint8Array): NistTestResult {
    const n = bits.length;
    let onesCount = 0;
    for (let i = 0; i < n; i++) {
      onesCount += bits[i];
    }
    const pi = onesCount / n;

    // Prerequisite check
    if (Math.abs(pi - 0.5) >= 2.0 / Math.sqrt(n)) {
      return {
        testName: 'Runs Test',
        statistic: 0,
        pValue: 0.0,
        passed: false,
        notes: `Failed prerequisite: |pi - 0.5| >= 2/sqrt(n)`,
      };
    }

    let totalRuns = 1;
    for (let k = 0; k < n - 1; k++) {
      if (bits[k] !== bits[k + 1]) {
        totalRuns++;
      }
    }

    const numerator = Math.abs(totalRuns - 2.0 * n * pi * (1.0 - pi));
    const denominator = 2.0 * Math.sqrt(2.0 * n) * pi * (1.0 - pi);
    const pValue = this.erfc(numerator / denominator);

    return {
      testName: 'Runs Test',
      statistic: totalRuns,
      pValue: parseFloat(pValue.toFixed(6)),
      passed: pValue >= 0.01,
      notes: `Total runs observed: ${totalRuns}, pi=${pi.toFixed(4)}`,
    };
  }

  /**
   * 4. NIST SP 800-22 Cumulative Sums (Cusum) Test
   */
  public static cumulativeSumsTest(bits: Uint8Array): NistTestResult {
    const n = bits.length;
    let s = 0;
    let maxAbsS = 0;

    for (let i = 0; i < n; i++) {
      s += bits[i] === 1 ? 1 : -1;
      const absS = Math.abs(s);
      if (absS > maxAbsS) {
        maxAbsS = absS;
      }
    }

    const z = maxAbsS;
    // P-value approximation using normal CDF summation
    let sum1 = 0;
    const startK1 = Math.floor((-n / z + 1) / 4);
    const endK1 = Math.floor((n / z - 1) / 4);
    for (let k = startK1; k <= endK1; k++) {
      const term1 = ((4 * k + 1) * z) / Math.sqrt(n);
      const term2 = ((4 * k - 1) * z) / Math.sqrt(n);
      sum1 += (1.0 - 0.5 * this.erfc(term1 / Math.SQRT2)) - (1.0 - 0.5 * this.erfc(term2 / Math.SQRT2));
    }

    let sum2 = 0;
    const startK2 = Math.floor((-n / z - 3) / 4);
    const endK2 = Math.floor((n / z - 1) / 4);
    for (let k = startK2; k <= endK2; k++) {
      const term1 = ((4 * k + 3) * z) / Math.sqrt(n);
      const term2 = ((4 * k + 1) * z) / Math.sqrt(n);
      sum2 += (1.0 - 0.5 * this.erfc(term1 / Math.SQRT2)) - (1.0 - 0.5 * this.erfc(term2 / Math.SQRT2));
    }

    const pValue = Math.max(0, Math.min(1.0, 1.0 - sum1 + sum2));

    return {
      testName: 'Cumulative Sums (Cusum) Test',
      statistic: z,
      pValue: parseFloat(pValue.toFixed(6)),
      passed: pValue >= 0.01,
      notes: `Max excursion z=${z}`,
    };
  }

  /**
   * 5. Chi-Squared Goodness-of-Fit Test for Discrete Casino Symbols (e.g. Roulette 0-36 or Dice 1-6)
   */
  public static chiSquareSymbolTest(samples: number[], numBins: number): NistTestResult {
    const n = samples.length;
    const binCounts = new Array(numBins).fill(0);

    for (let i = 0; i < n; i++) {
      const val = samples[i];
      if (val >= 0 && val < numBins) {
        binCounts[val]++;
      }
    }

    const expected = n / numBins;
    let chiSquared = 0;
    for (let b = 0; b < numBins; b++) {
      const diff = binCounts[b] - expected;
      chiSquared += (diff * diff) / expected;
    }

    const df = numBins - 1;
    const pValue = this.chiSquarePValue(df, chiSquared);

    return {
      testName: `Discrete Symbol Chi-Square Test (${numBins} bins)`,
      statistic: parseFloat(chiSquared.toFixed(4)),
      pValue: parseFloat(pValue.toFixed(6)),
      passed: pValue >= 0.01,
      notes: `N=${n}, expected per bin=${expected.toFixed(1)}, df=${df}`,
    };
  }

  /**
   * Runs the full GLI-19 certification test battery across a bitstream.
   */
  public static runBattery(bits: Uint8Array, engineName: string = 'ProvablyFairHMAC'): Gli19CertificationReport {
    const results: NistTestResult[] = [
      this.frequencyMonobitTest(bits),
      this.blockFrequencyTest(bits, 128),
      this.runsTest(bits),
      this.cumulativeSumsTest(bits),
    ];

    const allPassed = results.every((r) => r.passed);

    return {
      certId: `gli19_cert_${Date.now()}`,
      engine: engineName,
      totalBitsTested: bits.length,
      overallStatus: allPassed ? 'PASS' : 'FAIL',
      testResults: results,
      timestamp: new Date().toISOString(),
    };
  }
}
