/**
 * Customer Support Ticketing & Live Inquiry Types & Contracts
 */

export const TicketCategory = {
  DEPOSIT_PAYMENT: 'DEPOSIT_PAYMENT',
  WITHDRAWAL_PAYOUT: 'WITHDRAWAL_PAYOUT',
  BET_DISPUTE: 'BET_DISPUTE',
  ACCOUNT_KYC: 'ACCOUNT_KYC',
  BONUS_PROMOTIONS: 'BONUS_PROMOTIONS',
  TECHNICAL_BUG: 'TECHNICAL_BUG',
  GENERAL_INQUIRY: 'GENERAL_INQUIRY',
} as const;
export type TicketCategory = (typeof TicketCategory)[keyof typeof TicketCategory];

export const TicketPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type TicketPriority = (typeof TicketPriority)[keyof typeof TicketPriority];

export const SupportTicketStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_ON_USER: 'WAITING_ON_USER',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type SupportTicketStatus = (typeof SupportTicketStatus)[keyof typeof SupportTicketStatus];

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderType: 'USER' | 'AGENT' | 'SYSTEM';
  senderId: string;
  senderName: string;
  messageText: string;
  attachments?: string[];
  createdAt: Date;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string; // e.g. SUP-883921
  userId: string;
  userEmail: string;
  username: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: SupportTicketStatus;
  subject: string;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  messages: SupportMessage[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date | null;
  resolutionNotes?: string;
}

export interface SupportQueueFilter {
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: SupportTicketStatus;
  assignedAgentId?: string;
  userId?: string;
  searchQuery?: string;
}

export interface SupportDeskStats {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  urgentTickets: number;
  resolutionRatePercent: number;
}
