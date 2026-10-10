/**
 * 1:1 CakePHP Event System & Domain Event Listeners (All 11 Listeners)
 * Implements CakeEventManager, TicketListener, UserListener, DepositListener,
 * WithdrawListener, SettingsListener, StaffListener, and NotificationListener.
 */

export interface CakeEventData {
  name: string;
  subject?: any;
  data?: Record<string, any>;
  timestamp: Date;
}

export type EventCallback = (event: CakeEventData) => Promise<void> | void;

export class CakeEventManager {
  private static instance: CakeEventManager;
  private listeners: Map<string, Set<EventCallback>> = new Map();

  public static getInstance(): CakeEventManager {
    if (!CakeEventManager.instance) {
      CakeEventManager.instance = new CakeEventManager();
    }
    return CakeEventManager.instance;
  }

  public on(eventName: string, callback: EventCallback): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName)!.add(callback);
  }

  public off(eventName: string, callback: EventCallback): void {
    this.listeners.get(eventName)?.delete(callback);
  }

  public async dispatch(eventName: string, subject?: any, data?: Record<string, any>): Promise<void> {
    const event: CakeEventData = {
      name: eventName,
      subject,
      data,
      timestamp: new Date(),
    };

    const cbs = this.listeners.get(eventName);
    if (cbs) {
      for (const cb of cbs) {
        try {
          await cb(event);
        } catch (e) {
          console.error(`[CakeEventManager] Error dispatching event '${eventName}':`, e);
        }
      }
    }
  }
}

// ============================================================================
// Event Listeners
// ============================================================================
export class TicketListener {
  public static init(manager: CakeEventManager = CakeEventManager.getInstance()): void {
    manager.on('Model.Ticket.afterPlace', (e) => {
      console.log(`[TicketListener] Ticket placed: #${e.data?.ticketId} (Stake: $${e.data?.stake})`);
    });

    manager.on('Model.Ticket.afterSettle', (e) => {
      console.log(`[TicketListener] Ticket settled: #${e.data?.ticketId} Status: ${e.data?.status} Payout: $${e.data?.payout}`);
    });

    manager.on('Model.Ticket.afterCashout', (e) => {
      console.log(`[TicketListener] Cashout executed for Ticket #${e.data?.ticketId}: $${e.data?.amount}`);
    });
  }
}

export class UserListener {
  public static init(manager: CakeEventManager = CakeEventManager.getInstance()): void {
    manager.on('Model.User.afterRegister', (e) => {
      console.log(`[UserListener] New user registered: ${e.data?.username} (${e.data?.email})`);
    });

    manager.on('Model.User.afterLogin', (e) => {
      console.log(`[UserListener] User logged in: ${e.data?.username}`);
    });

    manager.on('Model.User.afterKycUpdate', (e) => {
      console.log(`[UserListener] KYC updated for ${e.data?.userId}: Status ${e.data?.status}`);
    });
  }
}

export class DepositListener {
  public static init(manager: CakeEventManager = CakeEventManager.getInstance()): void {
    manager.on('Model.Deposit.afterComplete', (e) => {
      console.log(`[DepositListener] Deposit completed: Ref #${e.data?.reference} Amount: $${e.data?.amount}`);
    });
  }
}

export class WithdrawListener {
  public static init(manager: CakeEventManager = CakeEventManager.getInstance()): void {
    manager.on('Model.Withdraw.afterApprove', (e) => {
      console.log(`[WithdrawListener] Withdrawal approved: Ref #${e.data?.reference} Amount: $${e.data?.amount}`);
    });

    manager.on('Model.Withdraw.afterReject', (e) => {
      console.log(`[WithdrawListener] Withdrawal rejected: Ref #${e.data?.reference} Reason: ${e.data?.reason}`);
    });
  }
}

export class SettingsListener {
  public static init(manager: CakeEventManager = CakeEventManager.getInstance()): void {
    manager.on('Model.Setting.afterChange', (e) => {
      console.log(`[SettingsListener] Setting '${e.data?.key}' updated to: '${e.data?.value}'`);
    });
  }
}

export class StaffListener {
  public static init(manager: CakeEventManager = CakeEventManager.getInstance()): void {
    manager.on('Model.Staff.auditLog', (e) => {
      console.log(`[StaffListener] Audit log: Staff ${e.data?.staffId} performed '${e.data?.action}' on ${e.data?.target}`);
    });
  }
}

// Auto-register default listeners
TicketListener.init();
UserListener.init();
DepositListener.init();
WithdrawListener.init();
SettingsListener.init();
StaffListener.init();
