import { UserManager } from './user-manager.ts';
import { UserRole, RoleHierarchy } from '../auth/role-hierarchy.ts';

export interface CreditAllocationRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  createdAt: Date;
}

export class AgentCreditTree {
  private static instance: AgentCreditTree;
  private userManager: UserManager;
  private history: CreditAllocationRecord[] = [];

  private constructor() {
    this.userManager = UserManager.getInstance();
  }

  public static getInstance(): AgentCreditTree {
    if (!AgentCreditTree.instance) {
      AgentCreditTree.instance = new AgentCreditTree();
    }
    return AgentCreditTree.instance;
  }

  /**
   * Transfers credit downline: Parent -> Child (e.g. Admin -> Agent -> Branch -> Cashier)
   */
  public allocateCredit(fromUserId: string, toUserId: string, amount: number): void {
    if (amount <= 0) throw new Error('INVALID_AMOUNT: Allocation amount must be positive');

    const parent = this.userManager.getUserById(fromUserId);
    const child = this.userManager.getUserById(toUserId);

    if (!parent) throw new Error(`Parent user ${fromUserId} not found`);
    if (!child) throw new Error(`Child user ${toUserId} not found`);

    // Verify parent is authorized over child's role
    const isAuthorized = RoleHierarchy.isAuthorized(parent.role, child.role);
    if (!isAuthorized || parent.role === child.role) {
      throw new Error(`HIERARCHY_VIOLATION: ${parent.role} cannot allocate credit to ${child.role}`);
    }

    // Super Admin has unlimited root allocation; intermediate tiers must have available credit
    if (parent.role !== UserRole.ADMINISTRATOR) {
      if (parent.availableCredit < amount) {
        throw new Error(`INSUFFICIENT_CREDIT: ${parent.role} has only $${parent.availableCredit.toFixed(2)} available credit`);
      }
      parent.availableCredit -= amount;
    }

    child.creditLimit += amount;
    child.availableCredit += amount;

    this.history.push({
      id: `alloc-${Date.now()}`,
      fromUserId,
      toUserId,
      amount,
      createdAt: new Date(),
    });

    console.log(`[Credit Tree] Allocated $${amount.toFixed(2)} from ${parent.role} (${parent.username}) -> ${child.role} (${child.username})`);
  }

  /**
   * Deducts credit from an agent's available credit float when fulfilling a cash deposit
   */
  public deductAgentCredit(agentUserId: string, amount: number): void {
    const agent = this.userManager.getUserById(agentUserId);
    if (!agent) throw new Error(`Agent user ${agentUserId} not found`);

    if (agent.availableCredit < amount) {
      throw new Error(`INSUFFICIENT_AGENT_CREDIT: Agent ${agent.username} has only $${agent.availableCredit.toFixed(2)} available credit float`);
    }

    agent.availableCredit -= amount;
    console.log(`[Credit Tree] Deducted $${amount.toFixed(2)} from Agent ${agent.username}. Remaining credit: $${agent.availableCredit.toFixed(2)}`);
  }

  public getDownlineUsers(parentUserId: string): any[] {
    const parent = this.userManager.getUserById(parentUserId);
    if (!parent) return [];
    return [];
  }
}
