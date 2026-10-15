/**
 * 1:1 Contact & Support Ticket Plugin Layer (Contact, ContactAppModel)
 * Manages customer support inquiry tickets, department routing, admin replies,
 * and resolution status tracking.
 */

export interface SupportInquiry {
  id: string;
  ticketNumber: string;
  userId?: string;
  name: string;
  email: string;
  category: 'SPORTS' | 'CASINO' | 'PAYMENTS' | 'VERIFICATION' | 'TECHNICAL';
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  replies: Array<{ from: 'USER' | 'STAFF'; message: string; timestamp: Date }>;
  createdAt: Date;
}

export class ContactPluginManager {
  private tickets: Map<string, SupportInquiry> = new Map();

  public createTicket(data: Omit<SupportInquiry, 'id' | 'ticketNumber' | 'status' | 'replies' | 'createdAt'>): SupportInquiry {
    const id = `sup-${Date.now()}`;
    const ticketNumber = `SUP-${Math.floor(100000 + Math.random() * 900000)}`;
    const inquiry: SupportInquiry = {
      id,
      ticketNumber,
      ...data,
      status: 'OPEN',
      replies: [{ from: 'USER', message: data.message, timestamp: new Date() }],
      createdAt: new Date(),
    };
    this.tickets.set(id, inquiry);
    return inquiry;
  }

  public addReply(ticketId: string, from: 'USER' | 'STAFF', message: string): SupportInquiry | null {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;

    ticket.replies.push({ from, message, timestamp: new Date() });
    if (from === 'STAFF') {
      ticket.status = 'IN_PROGRESS';
    }
    return ticket;
  }

  public resolveTicket(ticketId: string): boolean {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return false;
    ticket.status = 'RESOLVED';
    return true;
  }

  public getTickets(status?: string): SupportInquiry[] {
    const list = Array.from(this.tickets.values());
    if (status) return list.filter((t) => t.status === status);
    return list;
  }
}
