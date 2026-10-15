export const AccountType = {
  PLAYER_MAIN: 'PLAYER_MAIN',
  PLAYER_BONUS: 'PLAYER_BONUS',
  HOUSE_MARGIN: 'HOUSE_MARGIN',
  HOUSE_ESCROW: 'HOUSE_ESCROW',
  PAYMENT_CLEARING: 'PAYMENT_CLEARING',
  AFFILIATE_COMMISSION: 'AFFILIATE_COMMISSION',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const TransactionType = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  BET_STAKE: 'BET_STAKE',
  BET_PAYOUT: 'BET_PAYOUT',
  BET_REFUND: 'BET_REFUND',
  BET_CASHOUT: 'BET_CASHOUT',
  CASINO_WAGER: 'CASINO_WAGER',
  CASINO_PAYOUT: 'CASINO_PAYOUT',
  CASINO_REFUND: 'CASINO_REFUND',
  BONUS_GRANT: 'BONUS_GRANT',
  BONUS_CONVERSION: 'BONUS_CONVERSION',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
  AFFILIATE_PAYOUT: 'AFFILIATE_PAYOUT',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const TransactionDirection = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
} as const;
export type TransactionDirection = (typeof TransactionDirection)[keyof typeof TransactionDirection];

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  exchangeRateToUsd: number;
  decimals: number;
  isActive: boolean;
}

export interface LedgerAccount {
  id: string;
  userId?: string | null;
  accountType: AccountType;
  currencyCode: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalEntry {
  id: string;
  entryNumber: bigint;
  transactionType: TransactionType;
  referenceId?: string | null;
  referenceType?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  transactions?: TransactionLeg[];
}

export interface TransactionLeg {
  id: string;
  journalEntryId: string;
  accountId: string;
  direction: TransactionDirection;
  amount: number;
  currencyCode: string;
  createdAt: Date;
}

export interface AccountBalance {
  accountId: string;
  userId?: string | null;
  accountType: AccountType;
  currencyCode: string;
  balance: number;
  transactionCount: number;
  lastTransactionAt?: Date | null;
}
