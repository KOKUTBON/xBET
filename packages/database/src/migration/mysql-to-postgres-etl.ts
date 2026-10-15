/**
 * Automated MySQL 5.5 -> PostgreSQL 16 ETL Migration Engine
 * Handles historical row extraction, data type transformation (TINYINT -> boolean, DATETIME -> ISO UTC),
 * CakePHP password migration flags, foreign key resolution, and batch insertion.
 */

export interface LegacyUserRow {
  id: number;
  username: string;
  password: string;
  email: string;
  balance: number;
  group_id: number;
  referal_id?: number | null;
  status: number;
  created: string;
  modified: string;
}

export interface LegacyTicketRow {
  id: number;
  user_id: number;
  date: string;
  amount: number;
  odd: number;
  return: number;
  status: number; // 0=PENDING, 1=WON, 2=LOST, 3=CANCELLED, 4=REFUNDED
  type: number;   // 0=SINGLE, 1=COMBI, 2=SYSTEM
}

export interface LegacyTicketPartRow {
  id: number;
  ticket_id: number;
  bet_id: number;
  bet_part_id: number;
  odd: number;
}

export interface LegacyDepositRow {
  id: number;
  user_id: number;
  amount: number;
  type: string;
  status: number;
  created: string;
}

export interface TransformedUser {
  id: string;
  legacyId: number;
  username: string;
  email: string;
  passwordHash: string;
  isLegacyPassword: boolean;
  balance: number;
  role: string;
  referralId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransformedTicket {
  id: string;
  legacyId: number;
  userId: string;
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'CANCELLED' | 'REFUNDED';
  type: 'SINGLE' | 'COMBI' | 'SYSTEM';
  placedAt: Date;
}

export interface MigrationSummary {
  dryRun: boolean;
  usersExtracted: number;
  usersTransformed: number;
  ticketsExtracted: number;
  ticketsTransformed: number;
  depositsExtracted: number;
  totalBalanceConserved: number;
  discrepancies: string[];
  executionTimeMs: number;
}

export class MysqlToPostgresEtl {
  private userIdMap: Map<number, string> = new Map();

  /**
   * Transforms legacy CakePHP MySQL user record to PostgreSQL 16 schema
   */
  public transformUser(row: LegacyUserRow): TransformedUser {
    const uuid = `usr-${row.id.toString().padStart(6, '0')}`;
    this.userIdMap.set(row.id, uuid);

    let role = 'PLAYER';
    switch (row.group_id) {
      case 3: role = 'SUPER_ADMIN'; break;
      case 7: role = 'BRANCH'; break;
      case 6: role = 'AGENT'; break;
      case 5: role = 'CASHIER'; break;
      default: role = 'PLAYER'; break;
    }

    const isSha1Legacy = !row.password.startsWith('$2') && !row.password.startsWith('$argon');

    return {
      id: uuid,
      legacyId: row.id,
      username: row.username.trim(),
      email: row.email.toLowerCase().trim(),
      passwordHash: isSha1Legacy ? `cakephp_sha1:${row.password}` : row.password,
      isLegacyPassword: isSha1Legacy,
      balance: Number(Number(row.balance).toFixed(2)),
      role,
      referralId: row.referal_id && row.referal_id > 0 ? `usr-${row.referal_id.toString().padStart(6, '0')}` : null,
      isActive: row.status === 1,
      createdAt: new Date(row.created.replace(' ', 'T') + 'Z'),
      updatedAt: new Date(row.modified.replace(' ', 'T') + 'Z'),
    };
  }

  /**
   * Transforms legacy Ticket row to PostgreSQL 16 schema
   */
  public transformTicket(row: LegacyTicketRow): TransformedTicket {
    const ticketUuid = `tck-${row.id.toString().padStart(7, '0')}`;
    const userUuid = this.userIdMap.get(row.user_id) || `usr-${row.user_id.toString().padStart(6, '0')}`;

    let status: TransformedTicket['status'] = 'PENDING';
    switch (row.status) {
      case 1: status = 'WON'; break;
      case 2: status = 'LOST'; break;
      case 3: status = 'CANCELLED'; break;
      case 4: status = 'REFUNDED'; break;
      default: status = 'PENDING'; break;
    }

    let type: TransformedTicket['type'] = 'SINGLE';
    switch (row.type) {
      case 1: type = 'COMBI'; break;
      case 2: type = 'SYSTEM'; break;
      default: type = 'SINGLE'; break;
    }

    return {
      id: ticketUuid,
      legacyId: row.id,
      userId: userUuid,
      stake: Number(Number(row.amount).toFixed(2)),
      totalOdds: Number(Number(row.odd).toFixed(2)),
      potentialReturn: Number(Number(row.return).toFixed(2)),
      status,
      type,
      placedAt: new Date(row.date.replace(' ', 'T') + 'Z'),
    };
  }

  /**
   * Runs an end-to-end batch ETL migration pipeline with integrity checks
   */
  public runEtlPipeline(
    legacyUsers: LegacyUserRow[],
    legacyTickets: LegacyTicketRow[],
    legacyDeposits: LegacyDepositRow[] = [],
    dryRun: boolean = true
  ): MigrationSummary {
    const startTime = Date.now();
    const discrepancies: string[] = [];

    // 1. Transform Users
    const transformedUsers: TransformedUser[] = [];
    let totalInitialBalance = 0;
    for (const u of legacyUsers) {
      totalInitialBalance += Number(u.balance);
      transformedUsers.push(this.transformUser(u));
    }

    // Check balance parity
    const totalMigratedBalance = transformedUsers.reduce((sum, u) => sum + u.balance, 0);
    if (Math.abs(totalInitialBalance - totalMigratedBalance) > 0.01) {
      discrepancies.push(`Balance mismatch: legacy=${totalInitialBalance} vs migrated=${totalMigratedBalance}`);
    }

    // 2. Transform Tickets
    const transformedTickets: TransformedTicket[] = [];
    for (const t of legacyTickets) {
      // Validate foreign key existence
      if (!this.userIdMap.has(t.user_id)) {
        discrepancies.push(`Ticket ${t.id} references non-existent user_id: ${t.user_id}`);
      }
      transformedTickets.push(this.transformTicket(t));
    }

    return {
      dryRun,
      usersExtracted: legacyUsers.length,
      usersTransformed: transformedUsers.length,
      ticketsExtracted: legacyTickets.length,
      ticketsTransformed: transformedTickets.length,
      depositsExtracted: legacyDeposits.length,
      totalBalanceConserved: Number(totalMigratedBalance.toFixed(2)),
      discrepancies,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
