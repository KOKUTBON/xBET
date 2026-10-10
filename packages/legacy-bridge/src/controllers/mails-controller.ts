/**
 * Converted CakePHP MailsController
 * Handles 1:1 Contact Us mail form, single admin email dispatch, and broadcast email lists.
 */

import { AppController } from './AppController.ts';

export interface MailPayload {
  to?: string;
  name?: string;
  email?: string;
  subject: string;
  message?: string;
  content?: string;
}

export class MailsController extends AppController {
  private sentMails: Array<MailPayload & { sentAt: Date; recipientCount: number }> = [];

  constructor(req?: any) {
    super(req);
    this.name = 'Mails';
  }

  public admin_index(): any {
    return this.renderJson(this.adminIndex(this.request.data));
  }

  public admin_all(): any {
    const { subject, content, userEmails } = this.request.data;
    return this.renderJson(this.adminAll(subject, content, userEmails || []));
  }

  /**
   * 1:1 Port of MailsController::contact
   */
  public contact(data: MailPayload): { success: boolean; message: string } {
    if (!data.email || !data.subject || !data.message) {
      return { success: false, message: 'Cannot send email. Please try again.' };
    }

    this.sentMails.push({
      ...data,
      to: 'contact@xbet.local',
      sentAt: new Date(),
      recipientCount: 1,
    });

    return { success: true, message: 'Email successfully sent' };
  }

  /**
   * 1:1 Port of MailsController::admin_index
   */
  public adminIndex(data: MailPayload): { success: boolean; message: string } {
    if (!data.to || !data.subject || !data.content) {
      return { success: false, message: 'Cannot send email. Please try again.' };
    }

    this.sentMails.push({
      ...data,
      sentAt: new Date(),
      recipientCount: 1,
    });

    return { success: true, message: 'Email successfully sent' };
  }

  /**
   * 1:1 Port of MailsController::admin_all
   */
  public adminAll(subject: string, content: string, userEmails: string[]): { success: boolean; recipientCount: number; message: string } {
    const validEmails = userEmails.filter((email) => email.includes('@') && email.includes('.'));
    if (validEmails.length === 0) {
      return { success: false, recipientCount: 0, message: 'No valid recipient email addresses found.' };
    }

    this.sentMails.push({
      subject,
      content,
      to: `broadcast:${validEmails.length}_users`,
      sentAt: new Date(),
      recipientCount: validEmails.length,
    });

    return { success: true, recipientCount: validEmails.length, message: 'Emails successfully sent' };
  }

  public getSentMails(): Array<MailPayload & { sentAt: Date; recipientCount: number }> {
    return [...this.sentMails];
  }
}
