import { AuthTokenManager, UserRole } from '../../core-types/src/auth.ts';
const staffToken=AuthTokenManager.createSession({id:'test-staff',username:'test-staff',role:UserRole.ADMINISTRATOR});
/**
 * Test Suite for SMS Transports, In-App Inbox, and Background Queue Processing
 */

import { NotificationEngine, NotificationType } from '../src/notifications/notification-engine.ts';
import { NotificationQueue } from '../src/notifications/queue/notification-queue.ts';
import { InboxManager } from '../src/notifications/inbox-manager.ts';
import { MockSmsTransport } from '../src/notifications/transports/sms-transport.ts';
import { LegacyBridgeHttpServer } from '../src/server.ts';
import { EventEmitter } from 'events';
import { IncomingMessage, ServerResponse } from 'http';

class MockRequest extends EventEmitter {
  public method: string;
  public url: string;
  public headers: Record<string, string>;

  constructor(method: string, url: string, headers: Record<string, string> = {}, body?: any) {
    super();
    this.method = method;
    this.url = url;
    this.headers = {authorization:`Bearer ${staffToken}`,...headers};

    if (body) {
      setImmediate(() => {
        this.emit('data', JSON.stringify(body));
        this.emit('end');
      });
    } else {
      setImmediate(() => {
        this.emit('end');
      });
    }
  }
}

class MockResponse extends EventEmitter {
  public statusCode: number = 200;
  public headers: Record<string, string> = {};
  public body: string = '';

  public setHeader(key: string, value: string): void {
    this.headers[key.toLowerCase()] = value;
  }

  public writeHead(status: number, headers?: Record<string, string>): void {
    this.statusCode = status;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this.setHeader(k, v);
      }
    }
  }

  public end(data?: string): void {
    if (data) this.body = data;
    this.emit('finish');
  }
}

async function runNotificationQueueTests() {
  console.log('===============================================================');
  console.log('  📬 Running SMS Transport, In-App Inbox & Queue Worker Suite');
  console.log('===============================================================');

  const server = new LegacyBridgeHttpServer();
  const queue = NotificationQueue.getInstance();
  const inbox = InboxManager.getInstance();
  const smsTransport = new MockSmsTransport();
  queue.setSmsTransport(smsTransport);

  const executeRequest = (method: string, path: string, body?: any): Promise<{ status: number; body: any }> => {
    return new Promise((resolve) => {
      const req = new MockRequest(method, path, { 'content-type': 'application/json' }, body) as unknown as IncomingMessage;
      const res = new MockResponse() as unknown as ServerResponse;

      (res as any).on('finish', () => {
        let parsedBody = (res as any).body;
        try {
          parsedBody = JSON.parse(parsedBody);
        } catch {}
        resolve({ status: (res as any).statusCode, body: parsedBody });
      });

      server.handleRequest(req, res);
    });
  };

  const testUserId = 'usr-sms-test-101';

  // --------------------------------------------------------------------------
  // Test 1: Direct Multi-Channel Transactional Notification (Email + In-App)
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Multi-Channel Transactional Notification (Winning Bet)...');
  const directSendRes = await executeRequest('POST', '/api/v1/notifications/send', {
    type: NotificationType.BET_SETTLED_WON,
    recipientEmail: 'winner@xbet.local',
    recipientUserId: testUserId,
    locale: 'eng',
    variables: {
      username: 'lucky_player',
      ticketNumber: 'SLIP-998877',
      currency: 'USD',
      payoutAmount: '350.00',
      siteName: 'XBET',
    },
  });

  console.log(`  Send Status: ${directSendRes.status} | Success: ${directSendRes.body.success}`);
  if (directSendRes.status !== 200 || !directSendRes.body.result?.inAppId) {
    throw new Error('Direct notification dispatch failed');
  }
  console.log('  ✅ Test 1 Passed: Multi-channel email & in-app notification sent.');

  // --------------------------------------------------------------------------
  // Test 2: In-App Notifications Inbox & Read Status Management
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing In-App Inbox Query & Read Action...');
  const inboxRes = await executeRequest('GET', `/api/v1/notifications/inbox/${testUserId}`);
  console.log(`  Inbox Notifications: ${inboxRes.body.count} | Unread: ${inboxRes.body.unreadCount}`);
  if (inboxRes.body.count < 1 || inboxRes.body.unreadCount < 1) {
    throw new Error('User inbox missing notification');
  }

  const notifId = inboxRes.body.notifications[0].id;
  const readRes = await executeRequest('POST', `/api/v1/notifications/inbox/${notifId}/read`);
  console.log(`  Mark as Read Status: ${readRes.status} | Notification Read: ${readRes.body.notification.isRead}`);
  if (!readRes.body.notification.isRead) throw new Error('Mark as read failed');
  console.log('  ✅ Test 2 Passed: In-app inbox and read status tracking verified.');

  // --------------------------------------------------------------------------
  // Test 3: Background Notification Queue Processing (SMS Delivery)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Background Notification Queue for SMS...');
  const smsJobRes = await executeRequest('POST', '/api/v1/notifications/queue/sms', {
    id: 'sms-otp-99',
    toPhoneNumber: '+447911123456',
    body: 'Your XBET withdrawal security PIN is 749201. Valid for 5 minutes.',
  });

  console.log(`  SMS Enqueued Status: ${smsJobRes.status} | Job ID: ${smsJobRes.body.jobId}`);
  if (smsJobRes.status !== 202) throw new Error('SMS queueing failed');

  // Allow queue tick
  await new Promise((r) => setTimeout(r, 50));

  const sentSms = smsTransport.getMessagesForPhone('+447911123456');
  console.log(`  SMS Delivered via Transport: ${sentSms.length}`);
  if (sentSms.length !== 1 || !sentSms[0].body.includes('749201')) {
    throw new Error('SMS delivery failed');
  }
  console.log('  ✅ Test 3 Passed: Background SMS queue worker processed delivery.');

  console.log('\n===============================================================');
  console.log('  🎉 All Notification Transport & Queue Tests Passed!         ');
  console.log('===============================================================');
}

runNotificationQueueTests().catch((err) => {
  console.error('❌ Notification queue test failed:', err);
  process.exit(1);
});
