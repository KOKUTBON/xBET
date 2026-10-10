/**
 * Customer Support Ticketing & Live Inquiry Center Test Suite
 * Tests category-based priority escalation, conversational threads,
 * agent assignment, resolution lifecycle, queue filters, and KPI analytics.
 */

import { SupportManager } from '../src/support/support-manager.ts';
import { TicketCategory, TicketPriority, SupportTicketStatus } from '../src/support/support-types.ts';

async function runSupportDeskTests() {
  console.log('===============================================================');
  console.log('  🎫 Running Customer Support Ticketing Test Suite             ');
  console.log('===============================================================');

  const support = SupportManager.getInstance();

  const userAlice = { id: 'usr-alice-101', email: 'alice@example.com', username: 'AliceBettor' };
  const userBob = { id: 'usr-bob-202', email: 'bob@example.com', username: 'BobBettor' };

  // --------------------------------------------------------------------------
  // Test 1: Ticket Creation & Auto-Priority Escalation
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Ticket Creation & Auto-Priority Escalation...');

  // Withdrawal ticket (should auto-escalate to HIGH priority)
  const ticket1 = support.createTicket({
    userId: userAlice.id,
    userEmail: userAlice.email,
    username: userAlice.username,
    category: TicketCategory.WITHDRAWAL_PAYOUT,
    subject: 'Delayed Bitcoin Withdrawal of $1,200',
    initialMessage: 'My withdrawal transaction WTH-9988 has been pending for over 2 hours.',
  });

  // General inquiry ticket (should default to LOW priority)
  const ticket2 = support.createTicket({
    userId: userBob.id,
    userEmail: userBob.email,
    username: userBob.username,
    category: TicketCategory.GENERAL_INQUIRY,
    subject: 'Question regarding VIP bonus levels',
    initialMessage: 'Where can I find the tier rollover details for Diamond VIP?',
  });

  console.log(`  Ticket 1: ${ticket1.ticketNumber} [${ticket1.category}] - Priority: ${ticket1.priority}`);
  console.log(`  Ticket 2: ${ticket2.ticketNumber} [${ticket2.category}] - Priority: ${ticket2.priority}`);

  if (ticket1.priority !== TicketPriority.HIGH) {
    throw new Error('Withdrawal ticket was not auto-escalated to HIGH priority');
  }
  if (ticket2.priority !== TicketPriority.LOW) {
    throw new Error('General inquiry ticket did not default to LOW priority');
  }
  if (ticket1.messages.length !== 2) {
    throw new Error('Initial ticket missing initial message or system greeting');
  }
  console.log('  ✅ Test 1 Passed: Tickets created with automatic category priority escalation.');

  // --------------------------------------------------------------------------
  // Test 2: Agent Assignment & Status Progression
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Agent Assignment & Status Progression...');
  support.assignAgent(ticket1.id, 'agent-sarah-88', 'Sarah Jenkins (Finance Desk)');

  const assignedTicket = support.getTicket(ticket1.id);
  console.log(`  Assigned Agent: ${assignedTicket?.assignedAgentName} | Status: ${assignedTicket?.status}`);

  if (assignedTicket?.assignedAgentId !== 'agent-sarah-88' || assignedTicket.status !== SupportTicketStatus.IN_PROGRESS) {
    throw new Error('Agent assignment failed or status did not transition to IN_PROGRESS');
  }
  console.log('  ✅ Test 2 Passed: Ticket assigned to agent and transitioned to IN_PROGRESS.');

  // --------------------------------------------------------------------------
  // Test 3: Conversational Threading & State Changes
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Multi-Party Threading & State Transitions...');

  // Agent replies
  support.addMessage(ticket1.id, {
    senderId: 'agent-sarah-88',
    senderName: 'Sarah Jenkins',
    senderType: 'AGENT',
    messageText: 'Hello Alice, I have expedited your Bitcoin transaction with the payment gateway. Could you please confirm your BTC wallet address?',
  });

  const ticketAfterAgent = support.getTicket(ticket1.id)!;
  console.log(`  Status after Agent reply: ${ticketAfterAgent.status}`);
  if (ticketAfterAgent.status !== SupportTicketStatus.WAITING_ON_USER) {
    throw new Error('Status did not transition to WAITING_ON_USER after agent reply');
  }

  // User responds
  support.addMessage(ticket1.id, {
    senderId: userAlice.id,
    senderName: userAlice.username,
    senderType: 'USER',
    messageText: 'Yes, wallet address is 3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy.',
  });

  const ticketAfterUser = support.getTicket(ticket1.id)!;
  console.log(`  Status after User reply: ${ticketAfterUser.status} | Total Messages in Thread: ${ticketAfterUser.messages.length}`);
  if (ticketAfterUser.status !== SupportTicketStatus.OPEN || ticketAfterUser.messages.length !== 4) {
    throw new Error('Status did not transition back to OPEN or message count mismatch');
  }
  console.log('  ✅ Test 3 Passed: Conversational threading maintained with dynamic status changes.');

  // --------------------------------------------------------------------------
  // Test 4: Resolution Lifecycle
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Ticket Resolution Lifecycle...');
  support.updateStatus(ticket1.id, SupportTicketStatus.RESOLVED, 'Withdrawal broadcasted to blockchain successfully.');

  const resolvedTicket = support.getTicket(ticket1.id)!;
  console.log(`  Ticket Status: ${resolvedTicket.status} | Resolved At: ${resolvedTicket.resolvedAt?.toISOString()}`);
  console.log(`  Resolution Notes: "${resolvedTicket.resolutionNotes}"`);

  if (resolvedTicket.status !== SupportTicketStatus.RESOLVED || !resolvedTicket.resolvedAt) {
    throw new Error('Ticket resolution failed');
  }
  console.log('  ✅ Test 4 Passed: Ticket marked RESOLVED with timestamp and auditor notes.');

  // --------------------------------------------------------------------------
  // Test 5: Backoffice Queue Filtering
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Querying Support Queue with Multi-Dimensional Filters...');

  const highPriorityQueue = support.queryQueue({ priority: TicketPriority.HIGH });
  const openQueue = support.queryQueue({ status: SupportTicketStatus.OPEN });
  const searchQueue = support.queryQueue({ searchQuery: 'Bitcoin' });

  console.log(`  HIGH Priority Queue Count: ${highPriorityQueue.length}`);
  console.log(`  OPEN Status Queue Count: ${openQueue.length}`);
  console.log(`  Search 'Bitcoin' Queue Count: ${searchQueue.length}`);

  if (highPriorityQueue.length !== 1 || openQueue.length !== 1 || searchQueue.length !== 1) {
    throw new Error('Support queue filtering returned incorrect counts');
  }
  console.log('  ✅ Test 5 Passed: Queue filtered accurately across priority, status, and search query.');

  // --------------------------------------------------------------------------
  // Test 6: Support Desk Operational Analytics
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Support Desk KPI Analytics...');
  const stats = support.getSupportStats();
  console.log(`  Total: ${stats.totalTickets} | Open: ${stats.openTickets} | Resolved: ${stats.resolvedTickets} | Resolution Rate: ${stats.resolutionRatePercent}%`);

  if (stats.totalTickets !== 2 || stats.resolvedTickets !== 1 || stats.resolutionRatePercent !== 50.0) {
    throw new Error('Support desk analytics calculation mismatch');
  }
  console.log('  ✅ Test 6 Passed: Operational support analytics and resolution metrics verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Customer Support Desk Tests Passed!                   ');
  console.log('===============================================================');
  process.exit(0);
}

runSupportDeskTests().catch((err) => {
  console.error('❌ Support Desk Tests failed:', err);
  process.exit(1);
});
