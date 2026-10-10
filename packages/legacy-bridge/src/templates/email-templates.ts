/**
 * 1:1 CakePHP Email & View Templates (HTML Layouts & Email Notifications)
 * Implements welcome, password_reset, deposit_success, withdraw_success,
 * kyc_verified, ticket_won, and cashout_executed.
 */

export class EmailTemplates {
  public static wrapLayout(title: string, contentHtml: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f2e1b; color: #fff; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #133a22; border-radius: 8px; overflow: hidden; border: 1px solid #1e4620; }
          .header { background: #00733c; padding: 20px; text-align: center; font-size: 24px; font-weight: 900; color: #ffdf1b; }
          .body { padding: 30px; line-height: 1.6; color: #e0f2f1; }
          .footer { background: #0b2214; padding: 15px; text-align: center; font-size: 12px; color: #80cbc4; }
          .btn { display: inline-block; background: #ffdf1b; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: 800; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">XBET</div>
          <div class="body">
            <h2>${title}</h2>
            ${contentHtml}
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} xBET Platform. All rights reserved. 18+ Please gamble responsibly.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  public static welcome(username: string): string {
    return this.wrapLayout('Welcome to xBET!', `
      <p>Hello <strong>${username}</strong>,</p>
      <p>Thank you for creating an account with xBET. You now have access to thousands of live in-play sports markets, casino games, and poker tables.</p>
      <p><a href="https://xbet.local/sports" class="btn">Start Betting Now</a></p>
    `);
  }

  public static passwordReset(username: string, resetLink: string): string {
    return this.wrapLayout('Password Reset Request', `
      <p>Hello <strong>${username}</strong>,</p>
      <p>We received a request to reset your password. Click the button below to choose a new password:</p>
      <p><a href="${resetLink}" class="btn">Reset Password</a></p>
      <p style="font-size:12px; color:#80cbc4;">If you did not request this, please ignore this email.</p>
    `);
  }

  public static depositSuccess(username: string, amount: number, currency: string = 'USD', reference: string): string {
    return this.wrapLayout('Deposit Confirmed', `
      <p>Hello <strong>${username}</strong>,</p>
      <p>Your deposit of <strong>${currency} ${amount.toFixed(2)}</strong> has been successfully credited to your account.</p>
      <p>Reference: <code>${reference}</code></p>
    `);
  }

  public static withdrawSuccess(username: string, amount: number, currency: string = 'USD', reference: string): string {
    return this.wrapLayout('Withdrawal Approved', `
      <p>Hello <strong>${username}</strong>,</p>
      <p>Your withdrawal request of <strong>${currency} ${amount.toFixed(2)}</strong> has been approved and processed.</p>
      <p>Reference: <code>${reference}</code></p>
    `);
  }

  public static kycVerified(username: string): string {
    return this.wrapLayout('KYC Verification Approved', `
      <p>Hello <strong>${username}</strong>,</p>
      <p>Your identity documents have been reviewed and verified by our compliance team. Full cashier withdrawal privileges are now active.</p>
    `);
  }

  public static ticketWon(username: string, ticketNumber: string, payout: number, currency: string = 'USD'): string {
    return this.wrapLayout('🎉 Winning Bet!', `
      <p>Hello <strong>${username}</strong>,</p>
      <p>Congratulations! Your bet ticket <strong>#${ticketNumber}</strong> has won <strong>${currency} ${payout.toFixed(2)}</strong>!</p>
      <p>The funds have been credited directly to your wallet balance.</p>
    `);
  }
}
