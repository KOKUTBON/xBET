import { EventEmitter } from 'events';

export class RedisPubSubManager extends EventEmitter {
  private static instance: RedisPubSubManager;
  private isConnected: boolean = false;

  private constructor() {
    super();
  }

  public static getInstance(): RedisPubSubManager {
    if (!RedisPubSubManager.instance) {
      RedisPubSubManager.instance = new RedisPubSubManager();
    }
    return RedisPubSubManager.instance;
  }

  public async connect(): Promise<void> {
    // In local standalone mode, we use internal EventEmitter for event bus
    this.isConnected = true;
    console.log('[Storage] Event Bus & State Cache initialized successfully.');
  }

  public publish(channel: string, message: unknown): void {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    this.emit(channel, payload);
  }

  public subscribe(channel: string, callback: (payload: string) => void): void {
    this.on(channel, callback);
  }
}
