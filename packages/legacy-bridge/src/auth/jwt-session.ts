import { createHmac, randomBytes } from 'crypto';
import type { UserRole } from './role-hierarchy.ts';

export interface SessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  parentId?: string | null;
  currencyCode: string;
  expiresAt: number;
}

export class SessionManager {
  private static readonly SECRET_KEY = (() => {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production');
    return (process.env.JWT_SECRET = randomBytes(32).toString('hex'));
  })();

  public static createSession(user: {
    id: string;
    username: string;
    role: UserRole;
    parentId?: string | null;
    currencyCode?: string;
  }, durationHours: number = 24): string {
    const payload: SessionPayload = {
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

      if (signature !== expectedSig) return null;

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as SessionPayload;
      if (Date.now() > payload.expiresAt) return null;

      return payload;
    } catch {
      return null;
    }
  }
}
