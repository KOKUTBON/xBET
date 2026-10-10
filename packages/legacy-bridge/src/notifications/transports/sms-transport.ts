/**
 * SMS / Mobile Messaging Transports & Delivery Drivers (Twilio / Infobip / Sandbox)
 */

export interface OutgoingSmsMessage {
  id: string;
  toPhoneNumber: string;
  fromSender?: string;
  body: string;
  tag?: string;
  sentAt?: Date;
}

export interface SmsSendResult {
  success: boolean;
  messageId: string;
  status: 'DELIVERED' | 'SENT' | 'FAILED';
  error?: string;
}

export interface ISmsTransport {
  readonly transportName: string;
  sendSms(message: OutgoingSmsMessage): Promise<SmsSendResult>;
}

/**
 * In-Memory Mock SMS Transport for testing and local sandbox
 */
export class MockSmsTransport implements ISmsTransport {
  public readonly transportName = 'MockSmsTransport';
  private sentMessages: OutgoingSmsMessage[] = [];

  public async sendSms(message: OutgoingSmsMessage): Promise<SmsSendResult> {
    message.sentAt = new Date();
    this.sentMessages.push(message);
    console.log(`[SmsTransport:Mock] SMS sent to ${message.toPhoneNumber}: "${message.body}"`);
    return {
      success: true,
      messageId: message.id,
      status: 'DELIVERED',
    };
  }

  public getSentMessages(): OutgoingSmsMessage[] {
    return [...this.sentMessages];
  }

  public getMessagesForPhone(phone: string): OutgoingSmsMessage[] {
    return this.sentMessages.filter((m) => m.toPhoneNumber === phone);
  }

  public clear(): void {
    this.sentMessages = [];
  }
}
