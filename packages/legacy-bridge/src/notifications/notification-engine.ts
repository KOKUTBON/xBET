/**
 * Transactional Notification & Email Templating Engine
 * Formats multi-language responsive HTML/Text emails, substitutes dynamic variables,
 * dispatches to email transports, and pushes in-app notifications.
 */

import { randomUUID } from 'crypto';
import type { IEmailTransport, OutgoingEmailMessage, SendResult } from './transports/email-transport.ts';
import { MockMemoryTransport } from './transports/email-transport.ts';
import { InboxManager } from './inbox-manager.ts';

export const NotificationType = {
  WELCOME_REGISTRATION: 'WELCOME_REGISTRATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
  KYC_STATUS_UPDATE: 'KYC_STATUS_UPDATE',
  DEPOSIT_CONFIRMED: 'DEPOSIT_CONFIRMED',
  WITHDRAWAL_PROCESSED: 'WITHDRAWAL_PROCESSED',
  BET_SETTLED_WON: 'BET_SETTLED_WON',
  BONUS_UNLOCKED: 'BONUS_UNLOCKED',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export interface NotificationPayload {
  recipientEmail: string;
  recipientUserId?: string;
  type: NotificationType;
  locale?: string; // 'eng', 'spa', 'ger', 'fre', etc.
  variables: Record<string, string | number>;
  sendEmail?: boolean;
  sendInApp?: boolean;
}

export interface EmailTemplateDefinition {
  subject: Record<string, string>; // locale -> template
  title: Record<string, string>;
  body: Record<string, string>;
  ctaText?: Record<string, string>;
  ctaUrlVar?: string;
}

export class NotificationEngine {
  private static instance: NotificationEngine;
  private emailTransport: IEmailTransport;
  private inboxManager: InboxManager;
  private templates: Map<NotificationType, EmailTemplateDefinition> = new Map();

  private constructor() {
    this.emailTransport = new MockMemoryTransport();
    this.inboxManager = InboxManager.getInstance();
    this.registerDefaultTemplates();
  }

  public static getInstance(): NotificationEngine {
    if (!NotificationEngine.instance) {
      NotificationEngine.instance = new NotificationEngine();
    }
    return NotificationEngine.instance;
  }

  public setEmailTransport(transport: IEmailTransport): void {
    this.emailTransport = transport;
  }

  public getEmailTransport(): IEmailTransport {
    return this.emailTransport;
  }

  /**
   * Registers templates across all 7 event types with multi-language strings
   */
  private registerDefaultTemplates(): void {
    this.templates.set(NotificationType.WELCOME_REGISTRATION, {
      subject: {
        eng: 'Welcome to {{siteName}}, {{username}}! Verify your account',
        spa: '¡Bienvenido a {{siteName}}, {{username}}! Verifica tu cuenta',
        ger: 'Willkommen bei {{siteName}}, {{username}}! Bestätigen Sie Ihr Konto',
        fre: 'Bienvenue sur {{siteName}}, {{username}} ! Vérifiez votre compte',
      },
      title: {
        eng: 'Welcome to the Premier Sportsbook & Casino!',
        spa: '¡Bienvenido a la mejor casa de apuestas y casino!',
        ger: 'Willkommen beim führenden Sportwetten- und Casino-Portal!',
        fre: 'Bienvenue sur la plateforme de paris sportifs et de casino !',
      },
      body: {
        eng: 'Hello {{username}}, thank you for joining {{siteName}}. Your account has been registered successfully. Click the button below to start betting.',
        spa: 'Hola {{username}}, gracias por unirte a {{siteName}}. Tu cuenta ha sido registrada con éxito. Haz clic en el botón para comenzar.',
        ger: 'Hallo {{username}}, vielen Dank für Ihre Anmeldung bei {{siteName}}. Ihr Konto wurde erfolgreich erstellt.',
        fre: 'Bonjour {{username}}, merci de rejoindre {{siteName}}. Votre compte a été créé avec succès.',
      },
      ctaText: {
        eng: 'Go to Sportsbook',
        spa: 'Ir a Deportes',
        ger: 'Zu den Sportwetten',
        fre: 'Accéder aux paris',
      },
      ctaUrlVar: 'actionUrl',
    });

    this.templates.set(NotificationType.PASSWORD_RESET, {
      subject: {
        eng: 'Password Reset Request - {{siteName}}',
        spa: 'Solicitud de Restablecimiento de Contraseña - {{siteName}}',
        ger: 'Passwort-Zurücksetzungsanfrage - {{siteName}}',
        fre: 'Demande de réinitialisation de mot de passe - {{siteName}}',
      },
      title: {
        eng: 'Reset Your Password',
        spa: 'Restablece tu Contraseña',
        ger: 'Passwort zurücksetzen',
        fre: 'Réinitialisez votre mot de passe',
      },
      body: {
        eng: 'Hello {{username}}, we received a request to reset your password. This link is valid for {{expiresInMinutes}} minutes. If you did not request this, please ignore this email.',
        spa: 'Hola {{username}}, recibimos una solicitud para restablecer tu contraseña. Este enlace expira en {{expiresInMinutes}} minutos.',
        ger: 'Hallo {{username}}, wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten. Der Link ist {{expiresInMinutes}} Minuten gültig.',
        fre: 'Bonjour {{username}}, nous avons reçu une demande de réinitialisation de mot de passe valide pendant {{expiresInMinutes}} minutes.',
      },
      ctaText: {
        eng: 'Reset Password',
        spa: 'Restablecer Contraseña',
        ger: 'Passwort zurücksetzen',
        fre: 'Réinitialiser le mot de passe',
      },
      ctaUrlVar: 'resetUrl',
    });

    this.templates.set(NotificationType.KYC_STATUS_UPDATE, {
      subject: {
        eng: 'Identity Verification Update (KYC: {{status}})',
        spa: 'Actualización de Verificación de Identidad (KYC: {{status}})',
        ger: 'Aktualisierung der Identitätsprüfung (KYC: {{status}})',
        fre: 'Mise à jour de votre vérification d’identité (KYC : {{status}})',
      },
      title: {
        eng: 'KYC Identity Verification Status',
        spa: 'Estado de Verificación de Identidad',
        ger: 'Status der Identitätsprüfung',
        fre: 'Statut de vérification d’identité',
      },
      body: {
        eng: 'Hello {{username}}, your identity verification status is now: {{status}}. {{message}}',
        spa: 'Hola {{username}}, el estado de tu verificación de identidad es ahora: {{status}}. {{message}}',
        ger: 'Hallo {{username}}, der Status Ihrer Verifizierung lautet nun: {{status}}. {{message}}',
        fre: 'Bonjour {{username}}, votre statut de vérification est maintenant : {{status}}. {{message}}',
      },
      ctaText: {
        eng: 'View Profile',
        spa: 'Ver Perfil',
        ger: 'Profil anzeigen',
        fre: 'Voir le profil',
      },
      ctaUrlVar: 'profileUrl',
    });

    this.templates.set(NotificationType.DEPOSIT_CONFIRMED, {
      subject: {
        eng: 'Deposit Confirmed: {{currency}} {{amount}} - {{siteName}}',
        spa: 'Depósito Confirmado: {{currency}} {{amount}} - {{siteName}}',
        ger: 'Einzahlung bestätigt: {{currency}} {{amount}} - {{siteName}}',
        fre: 'Dépôt confirmé : {{currency}} {{amount}} - {{siteName}}',
      },
      title: {
        eng: 'Payment Receipt - Deposit Successful',
        spa: 'Recibo de Pago - Depósito Exitoso',
        ger: 'Zahlungsbeleg - Einzahlung erfolgreich',
        fre: 'Reçu de paiement - Dépôt réussi',
      },
      body: {
        eng: 'Hello {{username}}, your deposit of {{currency}} {{amount}} via {{method}} has been credited to your balance. Ref: {{transactionRef}}.',
        spa: 'Hola {{username}}, tu depósito de {{currency}} {{amount}} mediante {{method}} ha sido acreditado en tu saldo. Ref: {{transactionRef}}.',
        ger: 'Hallo {{username}}, Ihre Einzahlung von {{currency}} {{amount}} via {{method}} wurde erfolgreich gutgeschrieben. Ref: {{transactionRef}}.',
        fre: 'Bonjour {{username}}, votre dépôt de {{currency}} {{amount}} via {{method}} a été crédité sur votre solde. Réf : {{transactionRef}}.',
      },
      ctaText: {
        eng: 'Bet Now',
        spa: 'Apostar Ahora',
        ger: 'Jetzt wetten',
        fre: 'Parier maintenant',
      },
      ctaUrlVar: 'actionUrl',
    });

    this.templates.set(NotificationType.WITHDRAWAL_PROCESSED, {
      subject: {
        eng: 'Withdrawal Processed: {{currency}} {{amount}}',
        spa: 'Retiro Procesado: {{currency}} {{amount}}',
        ger: 'Auszahlung bearbeitet: {{currency}} {{amount}}',
        fre: 'Retrait traité : {{currency}} {{amount}}',
      },
      title: {
        eng: 'Payout Dispatched',
        spa: 'Retiro Enviado',
        ger: 'Auszahlung überwiesen',
        fre: 'Paiement envoyé',
      },
      body: {
        eng: 'Hello {{username}}, your withdrawal of {{currency}} {{amount}} (Ref: {{transactionRef}}) has been processed and sent to: {{payoutDetails}}.',
        spa: 'Hola {{username}}, tu retiro de {{currency}} {{amount}} (Ref: {{transactionRef}}) ha sido procesado y enviado a: {{payoutDetails}}.',
        ger: 'Hallo {{username}}, Ihre Auszahlung von {{currency}} {{amount}} (Ref: {{transactionRef}}) wurde an {{payoutDetails}} überwiesen.',
        fre: 'Bonjour {{username}}, votre retrait de {{currency}} {{amount}} (Réf : {{transactionRef}}) a été envoyé à : {{payoutDetails}}.',
      },
    });

    this.templates.set(NotificationType.BET_SETTLED_WON, {
      subject: {
        eng: '🎉 Winning Bet! {{currency}} {{payoutAmount}} Won on Slip #{{ticketNumber}}',
        spa: '🎉 ¡Apuesta Ganada! {{currency}} {{payoutAmount}} en Boleto #{{ticketNumber}}',
        ger: '🎉 Gewonnene Wette! {{currency}} {{payoutAmount}} auf Schein #{{ticketNumber}}',
        fre: '🎉 Pari gagnant ! {{currency}} {{payoutAmount}} gagné sur le ticket #{{ticketNumber}}',
      },
      title: {
        eng: 'Congratulations on Your Big Win!',
        spa: '¡Felicitaciones por tu Victoria!',
        ger: 'Herzlichen Glückwunsch zu Ihrem Gewinn!',
        fre: 'Félicitations pour votre victoire !',
      },
      body: {
        eng: 'Great news {{username}}! Your ticket #{{ticketNumber}} has won. Total payout of {{currency}} {{payoutAmount}} has been credited directly to your account.',
        spa: '¡Grandes noticias {{username}}! Tu boleto #{{ticketNumber}} ha resultado ganador. El pago total de {{currency}} {{payoutAmount}} ha sido acreditado en tu cuenta.',
        ger: 'Tolle Neuigkeiten {{username}}! Ihr Wettschein #{{ticketNumber}} hat gewonnen. Der Gewinn von {{currency}} {{payoutAmount}} wurde gutgeschrieben.',
        fre: 'Excellente nouvelle {{username}} ! Votre ticket #{{ticketNumber}} a gagné. Le gain de {{currency}} {{payoutAmount}} a été crédité.',
      },
      ctaText: {
        eng: 'View Ticket',
        spa: 'Ver Boleto',
        ger: 'Schein ansehen',
        fre: 'Voir le ticket',
      },
      ctaUrlVar: 'ticketUrl',
    });

    this.templates.set(NotificationType.BONUS_UNLOCKED, {
      subject: {
        eng: '🎁 Bonus Completed: {{currency}} {{bonusAmount}} Released to Real Balance!',
        spa: '🎁 Bono Completado: ¡{{currency}} {{bonusAmount}} Liberados a Saldo Real!',
        ger: '🎁 Bonus freigeschaltet: {{currency}} {{bonusAmount}} auf Echtgeldkonto!',
        fre: '🎁 Bonus débloqué : {{currency}} {{bonusAmount}} transférés vers le solde réel !',
      },
      title: {
        eng: 'Rollover Wagering Completed',
        spa: 'Rollover de Bono Completado',
        ger: 'Umsatzbedingungen erfüllt',
        fre: 'Conditions de mise remplies',
      },
      body: {
        eng: 'Congratulations {{username}}! You have successfully completed the wagering requirements for promo code {{bonusCode}}. {{currency}} {{bonusAmount}} has been converted into withdrawable real cash.',
        spa: '¡Felicitaciones {{username}}! Has completado con éxito los requisitos de apuesta del bono {{bonusCode}}. {{currency}} {{bonusAmount}} están listos para retirar.',
        ger: 'Glückwunsch {{username}}! Sie haben den Rollover für den Code {{bonusCode}} abgeschlossen. {{currency}} {{bonusAmount}} sind nun auszahlbar.',
        fre: 'Félicitations {{username}} ! Vous avez rempli les conditions du code {{bonusCode}}. {{currency}} {{bonusAmount}} sont désormais retirables.',
      },
    });
  }

  /**
   * Dispatches transactional notification across email and in-app channels
   */
  public async sendNotification(payload: NotificationPayload): Promise<{
    emailResult?: SendResult;
    inAppId?: string;
  }> {
    const template = this.templates.get(payload.type);
    if (!template) throw new Error(`TEMPLATE_NOT_FOUND: No template for type '${payload.type}'`);

    const lang = payload.locale && template.subject[payload.locale] ? payload.locale : 'eng';
    const siteName = String(payload.variables.siteName || 'XBET');
    const mergedVars = { siteName, ...payload.variables };

    // Interpolate strings
    const rawSubject = template.subject[lang] || template.subject['eng'];
    const rawTitle = template.title[lang] || template.title['eng'];
    const rawBody = template.body[lang] || template.body['eng'];
    const rawCta = template.ctaText ? template.ctaText[lang] || template.ctaText['eng'] : undefined;

    const subject = this.interpolate(rawSubject, mergedVars);
    const title = this.interpolate(rawTitle, mergedVars);
    const bodyText = this.interpolate(rawBody, mergedVars);
    const ctaUrl = template.ctaUrlVar ? String(mergedVars[template.ctaUrlVar] || '#') : undefined;

    let emailResult: SendResult | undefined;
    let inAppId: string | undefined;

    // 1. Send Email (if enabled, default true)
    if (payload.sendEmail !== false && payload.recipientEmail) {
      const htmlContent = this.renderEmailHtml(title, bodyText, rawCta, ctaUrl, siteName);
      const textContent = `${title}\n\n${bodyText}\n\n${ctaUrl ? `Action: ${ctaUrl}\n\n` : ''}${siteName}`;

      const message: OutgoingEmailMessage = {
        id: `msg-${Date.now()}-${randomUUID().slice(0, 8)}`,
        to: payload.recipientEmail,
        subject,
        htmlContent,
        textContent,
        tags: [payload.type, lang],
      };

      emailResult = await this.emailTransport.send(message);
    }

    // 2. Push In-App Notification (if recipientUserId provided)
    if (payload.sendInApp !== false && payload.recipientUserId) {
      const inApp = this.inboxManager.pushNotification({
        userId: payload.recipientUserId,
        type: payload.type,
        title,
        message: bodyText,
        ctaUrl,
      });
      inAppId = inApp.id;
    }

    return { emailResult, inAppId };
  }

  private interpolate(templateString: string, vars: Record<string, string | number>): string {
    return templateString.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
      return vars[key] !== undefined ? String(vars[key]) : '';
    });
  }

  private renderEmailHtml(
    title: string,
    body: string,
    ctaText?: string,
    ctaUrl?: string,
    siteName: string = 'XBET'
  ): string {
    const ctaButtonHtml =
      ctaText && ctaUrl
        ? `
      <div style="margin: 28px 0; text-align: center;">
        <a href="${ctaUrl}" style="background-color: #ffdf1b; color: #0f3d2e; text-decoration: none; padding: 14px 28px; font-size: 15px; font-weight: 700; border-radius: 6px; display: inline-block;">
          ${ctaText}
        </a>
      </div>`
        : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <!-- Brand Header -->
    <div style="background-color: #0f3d2e; padding: 24px 32px; text-align: center;">
      <h1 style="color: #ffdf1b; margin: 0; font-size: 24px; letter-spacing: 1px; font-weight: 900;">${siteName}</h1>
    </div>

    <!-- Email Body -->
    <div style="padding: 32px; color: #1e293b; line-height: 1.6;">
      <h2 style="margin-top: 0; color: #0f3d2e; font-size: 20px; font-weight: 700;">${title}</h2>
      <p style="font-size: 15px; color: #334155; margin-bottom: 20px;">${body}</p>
      ${ctaButtonHtml}
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
      <p style="margin: 0;">This is an automated transactional notification regarding your account.</p>
      <p style="margin: 6px 0 0 0;">&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
  }
}
