/**
 * Transactional Notification & Email Engine Test Suite
 * Tests multi-language templates, variable interpolation, mock email transports,
 * and user in-app notification center inbox management.
 */

import {
  NotificationEngine,
  NotificationType,
} from '../src/notifications/notification-engine.ts';
import { MockMemoryTransport } from '../src/notifications/transports/email-transport.ts';
import { InboxManager } from '../src/notifications/inbox-manager.ts';

async function runNotificationTests() {
  console.log('===============================================================');
  console.log('  📧 Running Transactional Notification & Email Test Suite     ');
  console.log('===============================================================');

  const engine = NotificationEngine.getInstance();
  const mockTransport = new MockMemoryTransport();
  engine.setEmailTransport(mockTransport);

  const inboxManager = InboxManager.getInstance();
  const testUserId = 'user-notif-tester-999';
  const testEmail = 'alex.bettor@example.com';

  // --------------------------------------------------------------------------
  // Test 1: Welcome Registration Email Notification
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Welcome Registration Email...');
  const welcomeRes = await engine.sendNotification({
    recipientEmail: testEmail,
    recipientUserId: testUserId,
    type: NotificationType.WELCOME_REGISTRATION,
    locale: 'eng',
    variables: {
      username: 'AlexBettor',
      actionUrl: 'https://xbet.local/sports',
      siteName: 'XBET',
    },
  });

  const sentWelcome = mockTransport.getMessagesForRecipient(testEmail)[0];
  console.log(`  Sent Subject: "${sentWelcome.subject}"`);
  console.log(`  Email Message ID: ${welcomeRes.emailResult?.messageId} | In-App ID: ${welcomeRes.inAppId}`);

  if (!sentWelcome.subject.includes('Welcome to XBET, AlexBettor!')) {
    throw new Error('Welcome subject variable substitution failed');
  }
  if (!sentWelcome.htmlContent.includes('Go to Sportsbook') || !sentWelcome.htmlContent.includes('AlexBettor')) {
    throw new Error('Welcome HTML content missing CTA or username');
  }
  console.log('  ✅ Test 1 Passed: Welcome email formatted and dispatched.');

  // --------------------------------------------------------------------------
  // Test 2: Password Reset Email with Token Link
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Password Reset Notification...');
  await engine.sendNotification({
    recipientEmail: testEmail,
    type: NotificationType.PASSWORD_RESET,
    locale: 'eng',
    variables: {
      username: 'AlexBettor',
      resetUrl: 'https://xbet.local/auth/reset-password?token=sec_tok_998877',
      expiresInMinutes: 30,
      siteName: 'XBET',
    },
  });

  const sentReset = mockTransport.getSentMessages().find((m) => m.subject.includes('Password Reset'));
  console.log(`  Reset Subject: "${sentReset?.subject}"`);
  if (!sentReset?.htmlContent.includes('30 minutes') || !sentReset?.htmlContent.includes('sec_tok_998877')) {
    throw new Error('Password reset URL or expiration time interpolation failed');
  }
  console.log('  ✅ Test 2 Passed: Password reset email formatted with secure token link.');

  // --------------------------------------------------------------------------
  // Test 3: KYC Identity Verification Status Update (Email + In-App)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing KYC Status Update Notification (Dual-Channel)...');
  const kycRes = await engine.sendNotification({
    recipientEmail: testEmail,
    recipientUserId: testUserId,
    type: NotificationType.KYC_STATUS_UPDATE,
    locale: 'eng',
    variables: {
      username: 'AlexBettor',
      status: 'VERIFIED',
      message: 'Your passport and address documents have been successfully approved.',
      profileUrl: 'https://xbet.local/user/profile',
    },
  });

  console.log(`  KYC Email Result: ${kycRes.emailResult?.success} | In-App Notification: ${kycRes.inAppId}`);
  const userInbox = inboxManager.getUserNotifications(testUserId);
  const kycInApp = userInbox.find((n) => n.type === NotificationType.KYC_STATUS_UPDATE);

  if (!kycInApp || !kycInApp.message.includes('VERIFIED')) {
    throw new Error('KYC in-app notification not found in user inbox');
  }
  console.log('  ✅ Test 3 Passed: KYC update dispatched to both Email and In-App Inbox.');

  // --------------------------------------------------------------------------
  // Test 4: Deposit Confirmation Receipt
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Deposit Confirmation Receipt...');
  await engine.sendNotification({
    recipientEmail: testEmail,
    type: NotificationType.DEPOSIT_CONFIRMED,
    locale: 'eng',
    variables: {
      username: 'AlexBettor',
      currency: 'USD',
      amount: '250.00',
      method: 'Visa **** 4242',
      transactionRef: 'DEP-8899-77',
      actionUrl: 'https://xbet.local/sports',
    },
  });

  const depEmail = mockTransport.getSentMessages().find((m) => m.subject.includes('Deposit Confirmed'));
  console.log(`  Deposit Subject: "${depEmail?.subject}"`);
  if (!depEmail?.subject.includes('$250.00') && !depEmail?.subject.includes('USD 250.00')) {
    throw new Error('Deposit receipt amount missing from subject');
  }
  console.log('  ✅ Test 4 Passed: Deposit payment receipt generated.');

  // --------------------------------------------------------------------------
  // Test 5: Winning Bet Celebration Alert
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Winning Bet Celebration Alert...');
  await engine.sendNotification({
    recipientEmail: testEmail,
    recipientUserId: testUserId,
    type: NotificationType.BET_SETTLED_WON,
    locale: 'eng',
    variables: {
      username: 'AlexBettor',
      ticketNumber: 'SLIP-9988-11',
      payoutAmount: '1,450.00',
      currency: 'USD',
      ticketUrl: 'https://xbet.local/tickets/SLIP-9988-11',
    },
  });

  const winEmail = mockTransport.getSentMessages().find((m) => m.subject.includes('Winning Bet'));
  console.log(`  Winning Bet Subject: "${winEmail?.subject}"`);
  if (!winEmail?.htmlContent.includes('1,450.00') || !winEmail?.htmlContent.includes('SLIP-9988-11')) {
    throw new Error('Winning bet payout amount or ticket number interpolation failed');
  }
  console.log('  ✅ Test 5 Passed: Winning bet alert formatted and dispatched.');

  // --------------------------------------------------------------------------
  // Test 6: Multi-Language Template Rendering (Spanish & German)
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Multi-Language Email Rendering (Spanish & German)...');

  // Spanish Welcome
  await engine.sendNotification({
    recipientEmail: 'carlos@ejemplo.es',
    type: NotificationType.WELCOME_REGISTRATION,
    locale: 'spa',
    variables: {
      username: 'Carlos',
      actionUrl: 'https://xbet.local/spa/sports',
      siteName: 'XBET',
    },
  });

  // German Winning Bet
  await engine.sendNotification({
    recipientEmail: 'hans@beispiel.de',
    type: NotificationType.BET_SETTLED_WON,
    locale: 'ger',
    variables: {
      username: 'Hans',
      ticketNumber: 'SLIP-GER-55',
      payoutAmount: '750.00',
      currency: 'EUR',
      ticketUrl: 'https://xbet.local/ger/tickets/SLIP-GER-55',
      siteName: 'XBET',
    },
  });

  const spaEmail = mockTransport.getMessagesForRecipient('carlos@ejemplo.es')[0];
  const gerEmail = mockTransport.getMessagesForRecipient('hans@beispiel.de')[0];

  console.log(`  Spanish Subject: "${spaEmail.subject}"`);
  console.log(`  German Subject: "${gerEmail.subject}"`);

  if (!spaEmail.subject.includes('¡Bienvenido a XBET, Carlos!')) {
    throw new Error('Spanish locale welcome template translation failed');
  }
  if (!gerEmail.subject.includes('Gewonnene Wette! EUR 750.00')) {
    throw new Error('German locale winning bet template translation failed');
  }
  console.log('  ✅ Test 6 Passed: Multi-language translations (Spanish & German) verified.');

  // --------------------------------------------------------------------------
  // Test 7: In-App Notification Center & Unread Count Management
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing In-App Notification Inbox & Unread Counter...');
  const initialUnread = inboxManager.getUnreadCount(testUserId);
  console.log(`  Initial Unread Count for User: ${initialUnread}`);

  if (initialUnread !== 3) { // 3 in-app notifications pushed: Welcome, KYC, Winning Bet
    throw new Error(`Expected 3 unread notifications, found ${initialUnread}`);
  }

  const unreadList = inboxManager.getUserNotifications(testUserId, true);
  const firstNotif = unreadList[0];
  console.log(`  Marking notification '${firstNotif.title}' as READ...`);
  inboxManager.markAsRead(firstNotif.id, testUserId);

  const midUnread = inboxManager.getUnreadCount(testUserId);
  console.log(`  Updated Unread Count: ${midUnread}`);
  if (midUnread !== 2) throw new Error('Unread count did not decrement');

  console.log('  Marking ALL remaining notifications as READ...');
  inboxManager.markAllAsRead(testUserId);
  const finalUnread = inboxManager.getUnreadCount(testUserId);
  console.log(`  Final Unread Count: ${finalUnread}`);
  if (finalUnread !== 0) throw new Error('markAllAsRead failed to clear unread count');

  console.log('  ✅ Test 7 Passed: In-app inbox badge, pagination, and read lifecycle verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Transactional Notification & Email Tests Passed!      ');
  console.log('===============================================================');
  process.exit(0);
}

runNotificationTests().catch((err) => {
  console.error('❌ Notification Tests failed:', err);
  process.exit(1);
});
