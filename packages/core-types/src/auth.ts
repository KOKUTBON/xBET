import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMINISTRATOR: 'ADMINISTRATOR',
  RISK_MANAGER: 'RISK_MANAGER',
  TRADER: 'TRADER',
  SUBADMIN: 'SUBADMIN',
  AGENT: 'AGENT',
  BRANCH: 'BRANCH',
  SUPPORT: 'SUPPORT',
  CASHIER: 'CASHIER',
  PLAYER: 'PLAYER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ROLE_HIERARCHY_LEVELS: Record<UserRole, number> = {
  SUPER_ADMIN: 0,
  ADMINISTRATOR: 1,
  RISK_MANAGER: 2,
  TRADER: 2,
  SUBADMIN: 2,
  AGENT: 3,
  BRANCH: 4,
  SUPPORT: 4,
  CASHIER: 5,
  PLAYER: 6,
};

export interface SessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  parentId?: string | null;
  currencyCode: string;
  expiresAt: number;
  sessionId?: string;
}

/** Rejects missing, short or template (.env.example) signing secrets for the points pilot. */
export function assertPilotJwtSecret(secret: string | undefined): void {
  if (!secret || secret.length < 32 || /^replace_with|change_?me/i.test(secret)) {
    throw new Error('JWT_SECRET must be a random secret of at least 32 characters for the points pilot (generate with: openssl rand -hex 32)');
  }
}

export class AuthTokenManager {
  private static readonly SECRET_KEY = (() => {
    if (process.env.XBET_PILOT_MODE === 'true') assertPilotJwtSecret(process.env.JWT_SECRET);
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production');
    return (process.env.JWT_SECRET = randomBytes(32).toString('hex'));
  })();

  public static createSession(
    user: {
      id: string;
      username: string;
      role: UserRole;
      parentId?: string | null;
      currencyCode?: string;
    },
    durationHours: number = 24
  ): string {
    const payload: SessionPayload = {
      sessionId: randomBytes(16).toString('hex'),
      userId: user.id,
      username: user.username,
      role: user.role,
      parentId: user.parentId || null,
      currencyCode: user.currencyCode || 'USD',
      expiresAt: Date.now() + durationHours * 3600 * 1000,
    };

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.SECRET_KEY).update(`${header}.${body}`).digest('base64url');

    return `${header}.${body}.${signature}`;
  }

  public static verifySession(token: string): SessionPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [header, body, signature] = parts;
      const expectedSig = createHmac('sha256', this.SECRET_KEY).update(`${header}.${body}`).digest('base64url');

      const actual=Buffer.from(signature);const expected=Buffer.from(expectedSig);
      if(actual.length!==expected.length || !timingSafeEqual(actual,expected))return null;

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as SessionPayload;
      if(typeof payload.userId!=='string'||!payload.userId||!Number.isFinite(payload.expiresAt)||Date.now()>=payload.expiresAt||!(payload.role in ROLE_HIERARCHY_LEVELS))return null;

      return payload;
    } catch {
      return null;
    }
  }

  public static isAuthorized(userRole: UserRole, requiredRole: UserRole): boolean {
    const userLevel = ROLE_HIERARCHY_LEVELS[userRole] ?? 99;
    const requiredLevel = ROLE_HIERARCHY_LEVELS[requiredRole] ?? 99;
    return userLevel <= requiredLevel;
  }
}

/**
 * HTTP Authentication Middleware Helpers
 */
export class AuthMiddleware {
  public static extractToken(req: IncomingMessage): string | null {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    // Also check query param ?token=
    if (req.url) {
      try {
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');
        if (token) return token;
      } catch {
        // Fallback
      }
    }
    return null;
  }

  public static authenticate(req: IncomingMessage): SessionPayload | null {
    const token = this.extractToken(req);
    if (!token) return null;
    return AuthTokenManager.verifySession(token);
  }

  public static requireAuth(
    req: IncomingMessage,
    res: ServerResponse,
    requiredRole?: UserRole
  ): SessionPayload | null {
    const session = this.authenticate(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Valid Bearer token required' }));
      return null;
    }

    if (requiredRole && !AuthTokenManager.isAuthorized(session.role, requiredRole)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'FORBIDDEN',
          message: `Insufficient permissions. Required role level: ${requiredRole}`,
        })
      );
      return null;
    }

    return session;
  }
}
