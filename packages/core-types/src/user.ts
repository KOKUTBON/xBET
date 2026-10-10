export const UserStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  SELF_EXCLUDED: 'SELF_EXCLUDED',
  CLOSED: 'CLOSED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const UserRole = {
  PLAYER: 'PLAYER',
  AGENT: 'AGENT',
  SUPPORT: 'SUPPORT',
  RISK_MANAGER: 'RISK_MANAGER',
  ADMINISTRATOR: 'ADMINISTRATOR',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const OddsFormat = {
  DECIMAL: 'DECIMAL',
  FRACTIONAL: 'FRACTIONAL',
  AMERICAN: 'AMERICAN',
  HONG_KONG: 'HONG_KONG',
  MALAY: 'MALAY',
  INDONESIAN: 'INDONESIAN',
} as const;
export type OddsFormat = (typeof OddsFormat)[keyof typeof OddsFormat];

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  preferredCurrencyCode: string;
  preferredLanguage: string;
  oddsFormat: OddsFormat;
  referralUserId?: string | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  profile?: UserProfile | null;
}

export interface UserProfile {
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  phoneNumber?: string | null;
  countryCode: string;
  city?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  kycVerified: boolean;
  kycLevel: number;
  dailyDepositLimit?: number | null;
  dailyStakeLimit?: number | null;
  selfExclusionUntil?: Date | null;
}
