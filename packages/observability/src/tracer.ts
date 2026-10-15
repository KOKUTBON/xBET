/**
 * OpenTelemetry-Compatible Distributed Tracing Engine
 * Implements W3C TraceContext propagation, Spans, Attributes, Events, and OTLP formatting.
 */

import { randomBytes } from 'node:crypto';

export type SpanStatusCode = 'UNSET' | 'OK' | 'ERROR';

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

export interface SpanEvent {
  name: string;
  time: Date;
  attributes?: Record<string, any>;
}

export class Span {
  public readonly traceId: string;
  public readonly spanId: string;
  public readonly parentSpanId?: string;
  public readonly startTime: Date = new Date();
  public endTime?: Date;
  public durationMs: number = 0;
  public status: { code: SpanStatusCode; message?: string } = { code: 'UNSET' };
  public readonly name: string;
  public attributes: Record<string, any> = {};
  public events: SpanEvent[] = [];

  constructor(
    name: string,
    spanContext: SpanContext,
    parentSpanId?: string,
    attributes: Record<string, any> = {}
  ) {
    this.name = name;
    this.traceId = spanContext.traceId;
    this.spanId = spanContext.spanId;
    this.parentSpanId = parentSpanId;
    this.attributes = { ...attributes };
  }

  public setAttribute(key: string, value: any): this {
    this.attributes[key] = value;
    return this;
  }

  public setAttributes(attrs: Record<string, any>): this {
    Object.assign(this.attributes, attrs);
    return this;
  }

  public addEvent(name: string, attributes?: Record<string, any>): this {
    this.events.push({
      name,
      time: new Date(),
      attributes,
    });
    return this;
  }

  public setStatus(code: SpanStatusCode, message?: string): this {
    this.status = { code, message };
    return this;
  }

  public end(): this {
    this.endTime = new Date();
    this.durationMs = this.endTime.getTime() - this.startTime.getTime();
    return this;
  }

  /**
   * Format as W3C traceparent header value
   * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
   */
  public toTraceparent(): string {
    return `00-${this.traceId}-${this.spanId}-01`;
  }

  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime?.toISOString(),
      durationMs: this.durationMs,
      status: this.status,
      attributes: this.attributes,
      events: this.events,
    };
  }
}

export class Tracer {
  public readonly serviceName: string;
  private completedSpans: Span[] = [];

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  public startSpan(
    name: string,
    options: { parentContext?: SpanContext; parentSpan?: Span; attributes?: Record<string, any> } = {}
  ): Span {
    let traceId: string;
    let parentSpanId: string | undefined;

    if (options.parentSpan) {
      traceId = options.parentSpan.traceId;
      parentSpanId = options.parentSpan.spanId;
    } else if (options.parentContext) {
      traceId = options.parentContext.traceId;
      parentSpanId = options.parentContext.spanId;
    } else {
      traceId = randomBytes(16).toString('hex');
    }

    const spanId = randomBytes(8).toString('hex');
    const spanContext: SpanContext = { traceId, spanId, traceFlags: 1 };

    const span = new Span(name, spanContext, parentSpanId, {
      'service.name': this.serviceName,
      ...options.attributes,
    });

    return span;
  }

  public async traceAsync<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options: { parentContext?: SpanContext; parentSpan?: Span; attributes?: Record<string, any> } = {}
  ): Promise<T> {
    const span = this.startSpan(name, options);
    try {
      const result = await fn(span);
      span.setStatus('OK');
      return result;
    } catch (err: any) {
      span.setStatus('ERROR', err.message);
      span.addEvent('exception', { 'exception.message': err.message, 'exception.stack': err.stack });
      throw err;
    } finally {
      span.end();
      this.completedSpans.push(span);
    }
  }

  /**
   * Parse incoming W3C traceparent header
   */
  public extractTraceContext(traceparentHeader?: string): SpanContext | undefined {
    if (!traceparentHeader) return undefined;
    const parts = traceparentHeader.trim().split('-');
    if (parts.length < 4 || parts[0] !== '00') return undefined;

    const traceId = parts[1];
    const spanId = parts[2];
    const traceFlags = parseInt(parts[3], 16) || 1;

    if (traceId.length !== 32 || spanId.length !== 16) return undefined;

    return { traceId, spanId, traceFlags };
  }

  public getCompletedSpans(): Span[] {
    return [...this.completedSpans];
  }

  public clear(): void {
    this.completedSpans = [];
  }
}
