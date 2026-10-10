// We define the minimal Prisma types we need so this compiles without @prisma/client installed
type PrismaClient = any;
type Prisma = { TransactionIsolationLevel: Record<string, string> };

let PrismaClientClass: any = null;

async function loadPrisma() {
  if (!PrismaClientClass) {
    try {
      const mod = await import('@prisma/client');
      PrismaClientClass = mod.PrismaClient;
    } catch {
      console.warn('[Database] @prisma/client not installed. Running in memory-only mode.');
    }
  }
}

export class DatabaseClient {
  private static instance: PrismaClient | null = null;

  public static async getInstance(): Promise<PrismaClient | null> {
    if (!this.isAvailable()) {
      return null;
    }

    if (!this.instance) {
      await loadPrisma();
      
      if (!PrismaClientClass) {
          return null;
      }

      this.instance = new PrismaClientClass({
        datasources: {
          db: {
            url: process.env.DATABASE_URL,
          },
        },
        log: process.env.NODE_ENV === 'production' 
          ? ['error', 'warn'] 
          : ['query', 'error', 'warn'],
      });
    }

    return this.instance;
  }

  public static isAvailable(): boolean {
    return !!process.env.DATABASE_URL;
  }

  public static async getClient(): Promise<PrismaClient> {
    const client = await this.getInstance();
    if (!client) {
      throw new Error('Database client is not available. Ensure DATABASE_URL is set.');
    }
    return client;
  }

  public static async disconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.$disconnect();
      this.instance = null;
    }
  }

  public static async healthCheck(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.$queryRawUnsafe('SELECT 1');
      return true;
    } catch (error) {
      console.error('[Database] Health check failed:', error);
      return false;
    }
  }

  public static async transaction<T>(
    fn: (tx: any) => Promise<T>,
    options?: { isolationLevel?: string }
  ): Promise<T> {
    const client = await this.getClient();
    const isolationLevel = options?.isolationLevel || 'Serializable';
    return client.$transaction(fn, { isolationLevel });
  }
}

// Setup shutdown hooks
process.on('SIGINT', async () => {
  await DatabaseClient.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await DatabaseClient.disconnect();
  process.exit(0);
});
