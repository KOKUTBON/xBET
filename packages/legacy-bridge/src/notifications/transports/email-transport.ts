/**
 * Email Transports & Pluggable Delivery Drivers
 */

export interface OutgoingEmailMessage {
  id: string;
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  tags?: string[];
  sentAt?: Date;
}

export interface SendResult {
  success: boolean;
  messageId: string;
  error?: string;
}

export interface IEmailTransport {
  readonly transportName: string;
  send(message: OutgoingEmailMessage): Promise<SendResult>;
}

/**
 * In-memory Mock Transport for unit tests and local development
 */
export class MockMemoryTransport implements IEmailTransport {
  public readonly transportName = 'MockMemoryTransport';
  private sentMessages: OutgoingEmailMessage[] = [];

  public async send(message: OutgoingEmailMessage): Promise<SendResult> {
    message.sentAt = new Date();
    this.sentMessages.push(message);
    console.log(`[EmailTransport:Mock] Sent '${message.subject}' to ${message.to} (ID: ${message.id})`);
    return {
      success: true,
      messageId: message.id,
    };
  }

  public getSentMessages(): OutgoingEmailMessage[] {
    return [...this.sentMessages];
  }

  public getMessagesForRecipient(email: string): OutgoingEmailMessage[] {
    return this.sentMessages.filter((m) => m.to.toLowerCase() === email.toLowerCase());
  }

  public clear(): void {
    this.sentMessages = [];
  }
}
