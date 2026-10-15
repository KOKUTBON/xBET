import { AuthMiddleware, UserRole } from '../../core-types/src/auth.ts';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { LegacyRouter } from './router/legacy-router.ts';
import { UserManager, KycStatus } from './users/user-manager.ts';
import { SessionManager } from './auth/jwt-session.ts';
import { DashboardService } from './dashboard/dashboard-service.ts';
import { FinancialReportingEngine } from './reporting/financial-reporting-engine.ts';
import { RbacAuditManager } from './security/rbac-audit-manager.ts';
import { PaymentMethod, PaymentGatewayRegistry } from './payments/payment-gateway.ts';
import { DepositManager } from './payments/deposit-manager.ts';
import { PaymentWebhookDispatcher } from './payments/payment-webhook-dispatcher.ts';
import { BonusCodeRegistry } from './bonus/bonus-codes.ts';
import { RolloverTracker } from './bonus/rollover-tracker.ts';
import { ReservationTicketManager } from './tickets/reservation-ticket-manager.ts';
import { SupportManager } from './support/support-manager.ts';
import { TicketCategory } from './support/support-types.ts';
import { CmsManager } from './cms/cms-manager.ts';
import { LocaleManager } from './i18n/locale-manager.ts';
import { SportsMenuBuilder } from './navigation/sports-menu.ts';
import { CountriesMenuBuilder } from './navigation/countries-menu.ts';
import { RiskEngine } from './risk/risk-engine.ts';
import { PlatformSettingsManager } from './settings/platform-settings.ts';
import { ResponsibleGamingManager } from './responsible-gaming/responsible-gaming-manager.ts';
import { MaintenanceCommissionEngine } from './cron/maintenance-commission-engine.ts';
import { CronScheduler } from './cron/cron-scheduler.ts';
import { WithdrawManager } from './payments/withdraw-manager.ts';
import { NotificationEngine } from './notifications/notification-engine.ts';
import { NotificationQueue } from './notifications/queue/notification-queue.ts';
import { InboxManager } from './notifications/inbox-manager.ts';

const PORT = parseInt(process.env.PORT || '4003', 10);
const HOST = process.env.HOST || '0.0.0.0';

export class LegacyBridgeHttpServer {
  private userManager = UserManager.getInstance();
  private notificationEngine = NotificationEngine.getInstance();
  private notificationQueue = NotificationQueue.getInstance();
  private inboxManager = InboxManager.getInstance();
  private dashboardService = DashboardService.getInstance();
  private reportingEngine = FinancialReportingEngine.getInstance();
  private rbacAuditManager = RbacAuditManager.getInstance();
  private depositManager = DepositManager.getInstance();
  private withdrawManager = WithdrawManager.getInstance();
  private webhookDispatcher = PaymentWebhookDispatcher.getInstance();
  private rolloverTracker = RolloverTracker.getInstance();
  private reservationManager = ReservationTicketManager.getInstance();
  private supportManager = SupportManager.getInstance();
  private cmsManager = CmsManager.getInstance();
  private localeManager = LocaleManager.getInstance();
  private riskEngine = RiskEngine.getInstance();
  private settingsManager = PlatformSettingsManager.getInstance();
  private rgManager = ResponsibleGamingManager.getInstance();
  private commissionEngine = MaintenanceCommissionEngine.getInstance();
  private cronScheduler = CronScheduler.getInstance();

  private sendJson(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(body,(key,value)=>key==='passwordHash'?undefined:value));
  }

  private async parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
    });
  }

  public async handleRequest(req: IncomingMessage, res: ServerResponse) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    try {
      // 1. Health Check
      if (pathname === '/api/v1/health') {
        return this.sendJson(res, 200, {
          service: 'legacy-bridge',
          status: 'HEALTHY',
          timestamp: new Date().toISOString(),
          activeModules: ['auth', 'rbac', 'payments', 'cms', 'reporting', 'support', 'cron'],
        });
      }

      if (process.env.XBET_PILOT_MODE === 'true') {
        if (!AuthMiddleware.requireAuth(req,res)) return;
        return this.sendJson(res,503,{error:'PILOT_FEATURE_DISABLED'});
      }
      if (pathname.startsWith('/aaa/') || pathname.startsWith('/api/v1/aaa/')) {
        return this.sendJson(res,410,{error:'LEGACY_AUTH_DISABLED'});
      }
      // 2. Authentication Endpoints
      if ((pathname === '/aaa/login' || pathname === '/api/v1/aaa/login') && method === 'POST') {
        const body = await this.parseBody(req);
        const username = String(body.username || 'guest');
        const shard = String(body.shard || 'main');
        const part = Number(body.part || 1);
        const userObj = {
          id: '33333333-3333-3333-3333-333333333333',
          username,
          role: 10, // 10 = Manager role
          shard,
          part,
          exp: Math.floor(Date.now() / 1000) + 86400 * 30,
        };
        const rToken = Buffer.from(JSON.stringify(userObj)).toString('base64url');
        const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${rToken}.signature`;
        return this.sendJson(res, 200, { success: true, rToken: token, user: userObj });
      }

      if ((pathname === '/aaa/token_l' || pathname === '/aaa/token_s') && method === 'POST') {
        const tokenStr = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', role: 10 })).toString('base64url')}.sig`;
        return this.sendJson(res, 200, { lToken: tokenStr, sToken: tokenStr });
      }

      if (pathname === '/aaa/login_trust' && method === 'POST') {
        const tokenStr = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', role: 10 })).toString('base64url')}.sig`;
        return this.sendJson(res, 200, { success: true, rToken: tokenStr });
      }

      if ((pathname === '/aaa/logout' || pathname === '/aaa/u_logout') && method === 'POST') {
        return this.sendJson(res, 200, { success: true, message: 'Logged out' });
      }

      // 2b. Standard API Auth Endpoints
      if (pathname === '/api/v1/auth/register' && method === 'POST') {
        const body = await this.parseBody(req);
        if (body.role || body.userId) return this.sendJson(res,400,{error:'SERVER_IDENTITY_REQUIRED'});
        const user = this.userManager.registerUser({
          username: String(body.username || ''),
          email: String(body.email || ''),
          password: String(body.password || ''),
          role: UserRole.PLAYER,
          currencyCode: String(body.currencyCode || 'USD'),
        });
        const { token } = this.userManager.authenticate(user.username, String(body.password));
        return this.sendJson(res, 201, { success: true, user, token });
      }

      if (pathname === '/api/v1/auth/login' && method === 'POST') {
        const body = await this.parseBody(req);
        const auth = this.userManager.authenticate(String(body.username || ''), String(body.password || ''));
        const loginCheck = this.rgManager.canLogin(auth.user.id);
        if (!loginCheck.allowed) {
          return this.sendJson(res, 403, { error: 'LOGIN_BLOCKED', message: loginCheck.reason });
        }
        return this.sendJson(res, 200, { success: true, user: auth.user, token: auth.token });
      }

      if (pathname === '/api/v1/auth/me' && method === 'GET') {
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
        const session = SessionManager.verifySession(token);
        if (!session) {
          return this.sendJson(res, 401, { error: 'UNAUTHORIZED: Invalid or expired session token' });
        }
        const user = this.userManager.getUserById(session.userId);
        return this.sendJson(res, 200, { user, session });
      }

      if (!AuthMiddleware.requireAuth(req,res,UserRole.ADMINISTRATOR)) return;

      // 3. User Management
      if (pathname === '/api/v1/users' && method === 'GET') {
        const users = this.userManager.getAllUsers().map(({ passwordHash, ...u }) => u);
        return this.sendJson(res, 200, { count: users.length, users });
      }

      if (pathname.startsWith('/api/v1/users/') && pathname.endsWith('/kyc') && method === 'POST') {
        const userId = pathname.split('/')[4];
        const body = await this.parseBody(req);
        const updated = this.userManager.updateKycStatus(userId, body.status as KycStatus);
        return this.sendJson(res, 200, { success: true, user: updated });
      }

      // 4. Admin & Backoffice Dashboard
      if (pathname === '/api/v1/admin/dashboard' && method === 'GET') {
        const metrics = this.dashboardService.getAdministratorMetrics();
        return this.sendJson(res, 200, { metrics });
      }

      if (pathname === '/api/v1/admin/reports/financial' && method === 'GET') {
        const report = this.reportingEngine.generateFinancialSummary();
        return this.sendJson(res, 200, { report });
      }

      if (pathname === '/api/v1/admin/audit-logs' && method === 'GET') {
        const logs = this.rbacAuditManager.getAuditLogs();
        return this.sendJson(res, 200, { count: logs.length, logs });
      }

      if (pathname === '/api/v1/admin/cron/tasks' && method === 'GET') {
        const tasks = this.cronScheduler.getJobs();
        const health = await this.cronScheduler.runHealthChecks();
        return this.sendJson(res, 200, { tasks, health });
      }

      if (pathname.startsWith('/api/v1/admin/cron/run/') && method === 'POST') {
        const jobId = pathname.split('/')[5];
        const result = await this.cronScheduler.triggerJob(jobId);
        return this.sendJson(res, 200, { success: true, result });
      }

      if (pathname === '/api/v1/admin/commissions/history' && method === 'GET') {
        const agentId = url.searchParams.get('agentId') || undefined;
        const history = this.commissionEngine.getCommissionHistory(agentId);
        return this.sendJson(res, 200, { count: history.length, commissions: history });
      }

      if (pathname === '/api/v1/admin/commissions/settle' && method === 'POST') {
        const body = await this.parseBody(req);
        const period = (body.period as any) || 'daily';
        const reports = (body.reports as any) || [];
        const settled = this.commissionEngine.settleAgentCommissions(period, reports);
        return this.sendJson(res, 200, { success: true, count: settled.length, settled });
      }

      // 5. Payments & Webhooks
      if (pathname === '/api/v1/payments/deposit' && method === 'POST') {
        const body = await this.parseBody(req);
        const userId = String(body.userId || 'usr-demo');
        const amount = Number(body.amount || 50);

        const depositCheck = this.rgManager.canDeposit(userId, amount);
        if (!depositCheck.allowed) {
          return this.sendJson(res, 400, {
            error: 'RESPONSIBLE_GAMING_LIMIT_EXCEEDED',
            message: depositCheck.reason,
          });
        }

        const deposit = this.depositManager.createDeposit({
          userId,
          amount,
          currencyCode: String(body.currencyCode || 'USD'),
          method: (body.method as PaymentMethod) || PaymentMethod.CREDIT_CARD,
          bonusCode: body.bonusCode ? String(body.bonusCode) : undefined,
        });
        this.rgManager.recordDeposit(userId, amount);
        return this.sendJson(res, 200, { deposit });
      }

      if (pathname.startsWith('/api/v1/payments/webhooks/') && method === 'POST') {
        const gateway = pathname.split('/')[4];
        const body = await this.parseBody(req);
        const headers: Record<string, string> = {};
        for (const [key, val] of Object.entries(req.headers)) {
          if (typeof val === 'string') headers[key.toLowerCase()] = val;
        }
        const processed = await this.webhookDispatcher.handleWebhook(gateway, headers, body);
        return this.sendJson(res, processed.statusCode || 200, { success: processed.success, processed });
      }

      if (pathname === '/api/v1/payments/sandbox/simulate' && method === 'POST') {
        const body = await this.parseBody(req);
        const simulation = this.webhookDispatcher.simulateSandboxDeposit({
          userId: String(body.userId || 'usr-sandbox-player-101'),
          provider: String(body.provider || 'stripe'),
          amount: Number(body.amount || 100),
          currencyCode: String(body.currencyCode || 'USD'),
        });
        return this.sendJson(res, 200, { success: true, simulation });
      }

      // 5b. Withdrawal Requests & Admin Approval
      if (pathname === '/api/v1/payments/withdraw' && method === 'POST') {
        const body = await this.parseBody(req);
        const withdrawal = this.withdrawManager.requestWithdrawal({
          userId: String(body.userId || ''),
          method: (body.method as PaymentMethod) || PaymentMethod.CREDIT_CARD,
          amount: Number(body.amount || 0),
          payoutDetails: String(body.payoutDetails || ''),
          currencyCode: String(body.currencyCode || 'USD'),
        });
        return this.sendJson(res, 201, { success: true, withdrawal });
      }

      if (pathname.startsWith('/api/v1/payments/withdraw/user/') && method === 'GET') {
        const userId = pathname.split('/')[6];
        const userWithdrawals = this.withdrawManager.getUserWithdrawals(userId);
        return this.sendJson(res, 200, { count: userWithdrawals.length, withdrawals: userWithdrawals });
      }

      if (pathname === '/api/v1/admin/withdrawals/pending' && method === 'GET') {
        const pending = this.withdrawManager.getPendingWithdrawals();
        return this.sendJson(res, 200, { count: pending.length, withdrawals: pending });
      }

      if (pathname.startsWith('/api/v1/admin/withdrawals/') && pathname.endsWith('/approve') && method === 'POST') {
        const withdrawId = pathname.split('/')[5];
        const body = await this.parseBody(req);
        const approved = this.withdrawManager.approveWithdrawal(withdrawId, String(body.adminUserId || 'admin'));
        return this.sendJson(res, 200, { success: true, withdrawal: approved });
      }

      if (pathname.startsWith('/api/v1/admin/withdrawals/') && pathname.endsWith('/reject') && method === 'POST') {
        const withdrawId = pathname.split('/')[5];
        const body = await this.parseBody(req);
        const rejected = this.withdrawManager.rejectWithdrawal(
          withdrawId,
          String(body.adminUserId || 'admin'),
          String(body.reason || 'Compliance failure')
        );
        return this.sendJson(res, 200, { success: true, withdrawal: rejected });
      }

      if (pathname.startsWith('/api/v1/payments/withdraw/') && pathname.endsWith('/cancel') && method === 'POST') {
        const withdrawId = pathname.split('/')[5];
        const body = await this.parseBody(req);
        const cancelled = this.withdrawManager.cancelWithdrawal(withdrawId, String(body.userId || ''));
        return this.sendJson(res, 200, { success: true, withdrawal: cancelled });
      }

      // 6. Bonus Codes & Rollover
      if (pathname === '/api/v1/bonuses/claim' && method === 'POST') {
        const body = await this.parseBody(req);
        const code = String(body.code || '');
        const depositAmount = Number(body.depositAmount || 0);
        const bonusResult = BonusCodeRegistry.calculateBonus(code, depositAmount);
        return this.sendJson(res, 200, { success: !!bonusResult, bonus: bonusResult });
      }

      // 7. Retail Reservation Tickets
      if (pathname === '/api/v1/tickets/reservation' && method === 'POST') {
        const body = await this.parseBody(req);
        const reservation = this.reservationManager.createReservation({
          stake: Number(body.stake || body.totalStake || 10),
          currencyCode: String(body.currencyCode || 'USD'),
          legs: (body.legs as any) || [],
          ttlHours: Number(body.ttlHours || 24),
        });
        return this.sendJson(res, 201, { reservation });
      }

      // 8. Support Desk
      if (pathname === '/api/v1/support/tickets' && method === 'GET') {
        const tickets = this.supportManager.getQueue();
        const kpis = this.supportManager.getKpiMetrics();
        return this.sendJson(res, 200, { tickets, kpis });
      }

      if (pathname === '/api/v1/support/tickets' && method === 'POST') {
        const body = await this.parseBody(req);
        const ticket = this.supportManager.createTicket({
          userId: String(body.userId || ''),
          userName: String(body.userName || 'Bettor'),
          category: (body.category as TicketCategory) || TicketCategory.GENERAL_INQUIRY,
          subject: String(body.subject || 'Inquiry'),
          initialMessage: String(body.message || ''),
        });
        return this.sendJson(res, 201, { ticket });
      }

      // 8b. Transactional Notifications & Queue
      if (pathname === '/api/v1/notifications/send' && method === 'POST') {
        const body = await this.parseBody(req);
        const result = await this.notificationEngine.sendNotification(body as any);
        return this.sendJson(res, 200, { success: true, result });
      }

      if (pathname === '/api/v1/notifications/queue/email' && method === 'POST') {
        const body = await this.parseBody(req);
        const job = this.notificationQueue.enqueueEmail(body as any);
        return this.sendJson(res, 202, { success: true, jobId: job.id, status: job.status });
      }

      if (pathname === '/api/v1/notifications/queue/sms' && method === 'POST') {
        const body = await this.parseBody(req);
        const job = this.notificationQueue.enqueueSms(body as any);
        return this.sendJson(res, 202, { success: true, jobId: job.id, status: job.status });
      }

      if (pathname === '/api/v1/notifications/queue/stats' && method === 'GET') {
        const stats = this.notificationQueue.getStats();
        return this.sendJson(res, 200, { stats });
      }

      if (pathname.startsWith('/api/v1/notifications/inbox/') && method === 'GET') {
        const userId = pathname.split('/')[5];
        const notifications = this.inboxManager.getUserNotifications(userId);
        const unreadCount = this.inboxManager.getUnreadCount(userId);
        return this.sendJson(res, 200, { userId, unreadCount, count: notifications.length, notifications });
      }

      if (pathname.startsWith('/api/v1/notifications/inbox/') && pathname.endsWith('/read') && method === 'POST') {
        const notificationId = pathname.split('/')[5];
        const updated = this.inboxManager.markAsRead(notificationId);
        return this.sendJson(res, 200, { success: !!updated, notification: updated });
      }

      // 9. CMS, News, Slides & Navigation
      if (pathname === '/api/v1/cms/pages' && method === 'GET') {
        const lang = (url.searchParams.get('lang') || 'eng') as string;
        const pages = this.cmsManager.getPublishedPages(lang);
        return this.sendJson(res, 200, { pages });
      }

      if (pathname.startsWith('/api/v1/cms/pages/') && method === 'GET') {
        const slug = pathname.split('/')[4];
        const lang = (url.searchParams.get('lang') || 'eng') as string;
        const page = this.cmsManager.getPageBySlug(slug, lang);
        if (!page) return this.sendJson(res, 404, { error: 'PAGE_NOT_FOUND', slug });
        return this.sendJson(res, 200, { page });
      }

      if (pathname === '/api/v1/cms/news' && method === 'GET') {
        const lang = (url.searchParams.get('lang') || 'eng') as string;
        const category = url.searchParams.get('category') as any;
        const articles = this.cmsManager.getPublishedNews(lang, category);
        return this.sendJson(res, 200, { count: articles.length, articles });
      }

      if (pathname.startsWith('/api/v1/cms/news/') && method === 'GET') {
        const slug = pathname.split('/')[4];
        const lang = (url.searchParams.get('lang') || 'eng') as string;
        const article = this.cmsManager.getNewsBySlug(slug, lang);
        if (!article) return this.sendJson(res, 404, { error: 'NEWS_NOT_FOUND', slug });
        this.cmsManager.incrementNewsViews(slug);
        return this.sendJson(res, 200, { article });
      }

      if (pathname === '/api/v1/cms/news' && method === 'POST') {
        const body = await this.parseBody(req);
        const article = this.cmsManager.createNewsArticle(body);
        return this.sendJson(res, 201, { success: true, article });
      }

      if ((pathname === '/api/v1/cms/banners' || pathname === '/api/v1/cms/slides') && method === 'GET') {
        const zone = url.searchParams.get('zone') as any;
        const lang = (url.searchParams.get('lang') || 'eng') as string;
        const banners = this.cmsManager.getActiveBanners(zone, lang);
        return this.sendJson(res, 200, { count: banners.length, banners });
      }

      if ((pathname === '/api/v1/cms/banners' || pathname === '/api/v1/cms/slides') && method === 'POST') {
        const body = await this.parseBody(req);
        const banner = this.cmsManager.createBanner(body);
        return this.sendJson(res, 201, { success: true, banner });
      }

      if (pathname.startsWith('/api/v1/cms/slides/') && pathname.endsWith('/click') && method === 'POST') {
        const slideId = pathname.split('/')[4];
        const tracked = this.cmsManager.trackSlideClick(slideId);
        return this.sendJson(res, 200, { success: tracked });
      }

      if (pathname.startsWith('/api/v1/cms/menus/') && method === 'GET') {
        const zone = pathname.split('/')[4] as any;
        const lang = (url.searchParams.get('lang') || 'eng') as string;
        const menuTree = this.cmsManager.getMenuTree(zone, false, lang);
        return this.sendJson(res, 200, { zone, menuTree });
      }

      if (pathname === '/api/v1/i18n/menu' && method === 'GET') {
        const lang = (url.searchParams.get('lang') || 'eng') as any;
        const sports = SportsMenuBuilder.getSportsMenu(lang);
        const countries = CountriesMenuBuilder.getCountriesMenu(lang);
        return this.sendJson(res, 200, { sports, countries });
      }

      // 10. Platform Settings & Combi Boost Rules
      if (pathname === '/api/v1/sports/combi-boost-tiers' && method === 'GET') {
        const tiers = this.settingsManager.getSettings('tickets').combiBoostTiers;
        return this.sendJson(res, 200, { enabled: this.settingsManager.getSettings('tickets').enableCombiBonusBoost, tiers });
      }

      if (pathname.startsWith('/api/v1/settings/') && method === 'GET') {
        const category = pathname.split('/')[4] as any;
        if (category === 'all') {
          return this.sendJson(res, 200, { settings: this.settingsManager.getAllSettings() });
        }
        const categorySettings = this.settingsManager.getSettings(category);
        return this.sendJson(res, 200, { category, settings: categorySettings });
      }

      if (pathname.startsWith('/api/v1/settings/') && method === 'PUT') {
        const category = pathname.split('/')[4] as any;
        const body = await this.parseBody(req);
        const updated = this.settingsManager.updateSettings(category, body);
        return this.sendJson(res, 200, { success: true, category, settings: updated });
      }

      // 11. Responsible Gaming & Player Self-Protection
      if (pathname.startsWith('/api/v1/responsible-gaming/profile/') && method === 'GET') {
        const userId = pathname.split('/')[4];
        const profile = this.rgManager.getOrCreateProfile(userId);
        return this.sendJson(res, 200, { profile });
      }

      if (pathname === '/api/v1/responsible-gaming/limits' && method === 'POST') {
        const body = await this.parseBody(req);
        const userId = String(body.userId || '');
        const resProfile = this.rgManager.setDepositLimits(userId, body.limits || {});
        return this.sendJson(res, 200, { success: true, ...resProfile });
      }

      if (pathname === '/api/v1/responsible-gaming/cool-off' && method === 'POST') {
        const body = await this.parseBody(req);
        const userId = String(body.userId || '');
        const durationHours = Number(body.durationHours || 24);
        const coolOff = this.rgManager.setCoolOff(userId, durationHours, body.reason);
        return this.sendJson(res, 200, { success: true, coolOff });
      }

      if (pathname === '/api/v1/responsible-gaming/self-exclude' && method === 'POST') {
        const body = await this.parseBody(req);
        const userId = String(body.userId || '');
        const durationMonths = Number(body.durationMonths || 6);
        const isPermanent = Boolean(body.isPermanent);
        const exclusion = this.rgManager.setSelfExclusion(userId, durationMonths, isPermanent, body.reason);
        return this.sendJson(res, 200, { success: true, exclusion });
      }

      if (pathname.startsWith('/api/v1/responsible-gaming/reality-check/') && method === 'GET') {
        const userId = pathname.split('/')[4];
        const sessionStart = url.searchParams.get('sessionStart')
          ? new Date(url.searchParams.get('sessionStart')!)
          : new Date(Date.now() - 45 * 60 * 1000);
        const summary = this.rgManager.getRealityCheck(userId, sessionStart, {
          totalBets: 8,
          totalWagered: 160.0,
          totalWon: 195.0,
        });
        return this.sendJson(res, 200, { realityCheck: summary });
      }

      // (Removed external-provider .in gateway emulation — not part of this project.)

      // 13. Legacy URL Dispatcher (/legacy/*)
      if (pathname.startsWith('/legacy/')) {
        const legacyPath = pathname.replace(/^\/legacy/, '');
        const dispatchResult = LegacyRouter.handleRequest(legacyPath);
        return this.sendJson(res, dispatchResult.status, dispatchResult.body);
      }

      // Fallback
      return this.sendJson(res, 404, { error: 'NOT_FOUND', path: pathname });
    } catch (err: any) {
      console.error(`[LegacyBridgeHttpServer] Error processing ${method} ${pathname}:`, err);
      return this.sendJson(res, 400, { error: err.message || 'Internal server error' });
    }
  }
}

export function startServer(port = PORT, host = HOST) {
  const bridgeServer = new LegacyBridgeHttpServer();
  const server = createServer((req, res) => bridgeServer.handleRequest(req, res));

  server.listen(port, host, () => {
    console.log('================================================================');
    console.log(`  🏛️  xBET Legacy Bridge & Backoffice API listening on:`);
    console.log(`     👉 http://${host}:${port}`);
    console.log(`     👉 Health: http://${host}:${port}/api/v1/health`);
    console.log(`     👉 Dashboard: http://${host}:${port}/api/v1/admin/dashboard`);
    console.log('================================================================');
  });

  return server;
}

// Auto-run when executed directly
if (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))) {
  startServer();
}
