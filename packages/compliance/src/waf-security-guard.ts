/**
 * Web Application Firewall (WAF), Anti-DDoS & Security Guard
 * Implements Sliding-Window Rate Limiting, HMAC-SHA256 Webhook Signature Verification,
 * Replay Attack Prevention, and HTTP Security Header Policies.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface RateLimitRule {
  maxRequests: number;
  windowSeconds: number;
}

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: string;
  strictTransportSecurity?: string;
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  referrerPolicy?: string;
}

export class WafSecurityGuard {
  private static instance: WafSecurityGuard;
  private requestLogs: Map<string, number[]> = new Map(); // key -> timestamps
  private seenWebhookNonces: Set<string> = new Set();

  public static getInstance(): WafSecurityGuard {
    if (!WafSecurityGuard.instance) {
      WafSecurityGuard.instance = new WafSecurityGuard();
    }
    return WafSecurityGuard.instance;
  }

  /**
   * Sliding-Window Rate Limiter
   */
  public checkRateLimit(
    key: string,
    rule: RateLimitRule = { maxRequests: 60, windowSeconds: 60 }
  ): { allowed: boolean; remaining: number; resetTimeMs: number } {
    const now = Date.now();
    const windowStart = now - rule.windowSeconds * 1000;

    let timestamps = this.requestLogs.get(key) || [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= rule.maxRequests) {
      const oldest = timestamps[0];
      const resetTimeMs = oldest + rule.windowSeconds * 1000 - now;
      this.requestLogs.set(key, timestamps);
      return { allowed: false, remaining: 0, resetTimeMs: Math.max(0, resetTimeMs) };
    }

    timestamps.push(now);
    this.requestLogs.set(key, timestamps);

    return {
      allowed: true,
      remaining: rule.maxRequests - timestamps.length,
      resetTimeMs: rule.windowSeconds * 1000,
    };
  }

  /**
   * Validates HMAC-SHA256 Webhook Signatures with Replay Attack Prevention
   */
  public verifyWebhookSignature(
    rawBody: string,
    receivedSignature: string,
    secret: string,
    timestampHeader?: string,
    nonceHeader?: string
  ): { valid: boolean; reason?: string } {
    // 1. Check Replay Attack Timestamp Window (within 5 minutes)
    if (timestampHeader) {
      const requestTime = parseInt(timestampHeader, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      if (isNaN(requestTime) || Math.abs(currentTime - requestTime) > 300) {
        return { valid: false, reason: 'Timestamp outside acceptable 5-minute replay window' };
      }
    }

    // 2. Check Replay Attack Nonce
    if (nonceHeader) {
      if (this.seenWebhookNonces.has(nonceHeader)) {
        return { valid: false, reason: 'Duplicate webhook nonce detected (Replay Attack blocked)' };
      }
      this.seenWebhookNonces.add(nonceHeader);
    }

    // 3. Compute and verify HMAC signature using constant-time comparison
    const payloadToSign = timestampHeader ? `${timestampHeader}.${rawBody}` : rawBody;
    const computedHmac = createHmac('sha256', secret).update(payloadToSign).digest('hex');

    try {
      const sigBuffer = Buffer.from(receivedSignature, 'utf-8');
      const compBuffer = Buffer.from(computedHmac, 'utf-8');

      if (sigBuffer.length !== compBuffer.length || !timingSafeEqual(sigBuffer, compBuffer)) {
        return { valid: false, reason: 'Invalid HMAC signature' };
      }
    } catch {
      return { valid: false, reason: 'Malformed signature payload' };
    }

    return { valid: true };
  }

  /**
   * Returns enterprise HTTP Security Headers
   */
  public getSecurityHeaders(): Record<string, string> {
    return {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:; img-src 'self' data: https:;",
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-XSS-Protection': '1; mode=block',
    };
  }

  /**
   * Sanitizes input strings against SQL injection & XSS attempts
   */
  public sanitizeInput(input: string): string {
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/[<>"']/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '"': return '&quot;';
          case "'": return '&#x27;';
          default: return c;
        }
      });
  }
}
