/**
 * Customer Support Ticketing & Live Inquiry Manager
 * Handles multi-department inquiries, automated priority escalation,
 * conversational multi-party threads, agent assignment, and queue filters.
 */

import { randomUUID, randomBytes } from 'crypto';
import {
  TicketCategory,
  TicketPriority,
  SupportTicketStatus,
} from './support-types.ts';
import type {
  SupportTicket,
  SupportMessage,
  SupportQueueFilter,
  SupportDeskStats,
} from './support-types.ts';

export class SupportManager {
  private static instance: SupportManager;
  private tickets: Map<string, SupportTicket> = new Map();
  private ticketNumberIndex: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): SupportManager {
    if (!SupportManager.instance) {
      SupportManager.instance = new SupportManager();
    }
    return SupportManager.instance;
  }

  /**
   * Creates a new customer support ticket with category-based priority escalation
   */
  public createTicket(params: {
    userId: string;
    userEmail: string;
    username: string;
    category: TicketCategory;
    subject: string;
    initialMessage: string;
    priority?: TicketPriority;
    attachments?: string[];
  }): SupportTicket {
    const id = `ticket_${randomUUID().slice(0, 8)}`;
    const ticketNumber = `SUP-${randomBytes(3).toString('hex').toUpperCase()}`;

    // Automatic Priority Escalation
    let priority = params.priority;
    if (!priority) {
      switch (params.category) {
        case TicketCategory.WITHDRAWAL_PAYOUT:
        case TicketCategory.DEPOSIT_PAYMENT:
          priority = TicketPriority.HIGH;
          break;
        case TicketCategory.BET_DISPUTE:
        case TicketCategory.ACCOUNT_KYC:
          priority = TicketPriority.MEDIUM;
          break;
        case TicketCategory.TECHNICAL_BUG:
        case TicketCategory.BONUS_PROMOTIONS:
          priority = TicketPriority.MEDIUM;
          break;
        default:
          priority = TicketPriority.LOW;
          break;
      }
    }

    const initialMsg: SupportMessage = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      ticketId: id,
      senderType: 'USER',
      senderId: params.userId,
      senderName: params.username,
      messageText: params.initialMessage,
      attachments: params.attachments,
      createdAt: new Date(),
    };

    const systemGreeting: SupportMessage = {
      id: `msg_sys_${randomUUID().slice(0, 8)}`,
      ticketId: id,
      senderType: 'SYSTEM',
      senderId: 'system_bot',
      senderName: 'xBET Support Desk',
      messageText: `Thank you for contacting xBET Support. Ticket #${ticketNumber} has been received under [${params.category}]. An agent will respond shortly.`,
      createdAt: new Date(Date.now() + 10),
    };

    const ticket: SupportTicket = {
      id,
      ticketNumber,
      userId: params.userId,
      userEmail: params.userEmail,
      username: params.username,
      category: params.category,
      priority,
      status: SupportTicketStatus.OPEN,
      subject: params.subject,
      assignedAgentId: null,
      assignedAgentName: null,
      messages: [initialMsg, systemGreeting],
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
    };

    this.tickets.set(id, ticket);
    this.ticketNumberIndex.set(ticketNumber, id);

    console.log(
      `[SupportDesk] Created Ticket ${ticket.ticketNumber} for User ${ticket.username} - [${ticket.category}] (Priority: ${ticket.priority})`
    );
    return ticket;
  }

  /**
   * Appends a message to a ticket thread
   */
  public addMessage(
    ticketId: string,
    params: {
      senderId: string;
      senderName: string;
      senderType: 'USER' | 'AGENT' | 'SYSTEM';
      messageText: string;
      attachments?: string[];
    }
  ): SupportMessage {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const msg: SupportMessage = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      ticketId,
      senderType: params.senderType,
      senderId: params.senderId,
      senderName: params.senderName,
      messageText: params.messageText,
      attachments: params.attachments,
      createdAt: new Date(),
    };

    ticket.messages.push(msg);
    ticket.updatedAt = new Date();

    if (params.senderType === 'AGENT') {
      ticket.status = SupportTicketStatus.WAITING_ON_USER;
    } else if (params.senderType === 'USER' && ticket.status === SupportTicketStatus.WAITING_ON_USER) {
      ticket.status = SupportTicketStatus.OPEN;
    }

    console.log(`[SupportDesk] Added message to ${ticket.ticketNumber} from ${params.senderName} (${params.senderType})`);
    return msg;
  }

  /**
   * Assigns a ticket to a support representative
   */
  public assignAgent(ticketId: string, agentId: string, agentName: string): SupportTicket {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    ticket.assignedAgentId = agentId;
    ticket.assignedAgentName = agentName;
    if (ticket.status === SupportTicketStatus.OPEN) {
      ticket.status = SupportTicketStatus.IN_PROGRESS;
    }
    ticket.updatedAt = new Date();

    console.log(`[SupportDesk] Assigned ${ticket.ticketNumber} to Agent ${agentName}`);
    return ticket;
  }

  /**
   * Updates resolution status of a ticket
   */
  public updateStatus(ticketId: string, status: SupportTicketStatus, resolutionNotes?: string): SupportTicket {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    ticket.status = status;
    ticket.updatedAt = new Date();
    if (resolutionNotes) ticket.resolutionNotes = resolutionNotes;

    if (status === SupportTicketStatus.RESOLVED || status === SupportTicketStatus.CLOSED) {
      ticket.resolvedAt = new Date();
    }

    console.log(`[SupportDesk] Updated ${ticket.ticketNumber} Status -> ${status}`);
    return ticket;
  }

  public getTicket(id: string): SupportTicket | undefined {
    return this.tickets.get(id);
  }

  public getTicketByNumber(ticketNumber: string): SupportTicket | undefined {
    const id = this.ticketNumberIndex.get(ticketNumber);
    return id ? this.tickets.get(id) : undefined;
  }

  public getUserTickets(userId: string): SupportTicket[] {
    return Array.from(this.tickets.values()).filter((t) => t.userId === userId);
  }

  /**
   * Queries the support queue with multi-dimensional filters
   */
  public queryQueue(filter?: SupportQueueFilter): SupportTicket[] {
    let result = Array.from(this.tickets.values());

    if (filter?.category) {
      result = result.filter((t) => t.category === filter.category);
    }
    if (filter?.priority) {
      result = result.filter((t) => t.priority === filter.priority);
    }
    if (filter?.status) {
      result = result.filter((t) => t.status === filter.status);
    }
    if (filter?.assignedAgentId) {
      result = result.filter((t) => t.assignedAgentId === filter.assignedAgentId);
    }
    if (filter?.userId) {
      result = result.filter((t) => t.userId === filter.userId);
    }
    if (filter?.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.ticketNumber.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.username.toLowerCase().includes(q) ||
          t.userEmail.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Operational analytics for support management
   */
  public getSupportStats(): SupportDeskStats {
    const all = Array.from(this.tickets.values());
    const open = all.filter((t) => t.status === SupportTicketStatus.OPEN).length;
    const inProgress = all.filter((t) => t.status === SupportTicketStatus.IN_PROGRESS).length;
    const resolved = all.filter((t) => t.status === SupportTicketStatus.RESOLVED).length;
    const closed = all.filter((t) => t.status === SupportTicketStatus.CLOSED).length;
    const urgent = all.filter((t) => t.priority === TicketPriority.URGENT || t.priority === TicketPriority.HIGH).length;

    const completed = resolved + closed;
    const resolutionRate = all.length > 0 ? parseFloat(((completed / all.length) * 100).toFixed(2)) : 100.0;

    return {
      totalTickets: all.length,
      openTickets: open,
      inProgressTickets: inProgress,
      resolvedTickets: resolved,
      closedTickets: closed,
      urgentTickets: urgent,
      resolutionRatePercent: resolutionRate,
    };
  }
}
