import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { LineClient } from '@line-crm/line-sdk';
import { getLineAccounts, getUnsentFollowUpQuotes, markFollowSent } from '@line-crm/db';
import { processStepDeliveries } from './services/step-delivery.js';
import { processScheduledBroadcasts } from './services/broadcast.js';
import { processReminderDeliveries } from './services/reminder-delivery.js';
import { checkAccountHealth } from './services/ban-monitor.js';
import { authMiddleware } from './middleware/auth.js';
import { webhook } from './routes/webhook.js';
import { friends } from './routes/friends.js';
import { tags } from './routes/tags.js';
import { scenarios } from './routes/scenarios.js';
import { broadcasts } from './routes/broadcasts.js';
import { users } from './routes/users.js';
import { lineAccounts } from './routes/line-accounts.js';
import { conversions } from './routes/conversions.js';
import { affiliates } from './routes/affiliates.js';
import { openapi } from './routes/openapi.js';
import { liffRoutes } from './routes/liff.js';
// Round 3 ルート
import { webhooks } from './routes/webhooks.js';
import { calendar } from './routes/calendar.js';
import { reminders } from './routes/reminders.js';
import { scoring } from './routes/scoring.js';
import { templates } from './routes/templates.js';
import { chats } from './routes/chats.js';
import { notifications } from './routes/notifications.js';
import { stripe } from './routes/stripe.js';
import { health } from './routes/health.js';
import { automations } from './routes/automations.js';
import { richMenus } from './routes/rich-menus.js';
import { trackedLinks } from './routes/tracked-links.js';
import { forms } from './routes/forms.js';
import { adPlatforms } from './routes/ad-platforms.js';
import { staff } from './routes/staff.js';
import { repairRoutes } from './routes/repair.js';
import { funnelRoutes } from './routes/funnel.js';
import { crossAnalysisRoutes } from './routes/cross-analysis.js';
import { marks } from './routes/marks.js';
import { reservationRoutes } from './routes/reservations.js';

export type Env = {
  Bindings: {
    DB: D1Database;
    LINE_CHANNEL_SECRET: string;
    LINE_CHANNEL_ACCESS_TOKEN: string;
    API_KEY: string;
    LIFF_URL: string;
    LINE_CHANNEL_ID: string;
    LINE_LOGIN_CHANNEL_ID: string;
    LINE_LOGIN_CHANNEL_SECRET: string;
    WORKER_URL: string;
    X_HARNESS_URL?: string;  // Optional: X Harness API URL for account linking
    CHATWORK_API_TOKEN?: string;
    CHATWORK_ROOM_ID?: string;
    JWT_SECRET?: string;
    GOOGLE_REFRESH_TOKEN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
  };
  Variables: {
    staff: { id: string; name: string; role: 'owner' | 'admin' | 'staff'; assignedStores?: string[]; assignedTags?: string[] };
  };
};

const app = new Hono<Env>();

// CORS — allow all origins for MVP
app.use('*', cors({ origin: '*' }));

// Auth middleware — skips /webhook and /docs automatically
app.use('*', authMiddleware);

// Mount route groups — MVP & Round 2
app.route('/', webhook);
app.route('/', friends);
app.route('/', tags);
app.route('/', scenarios);
app.route('/', broadcasts);
app.route('/', users);
app.route('/', lineAccounts);
app.route('/', conversions);
app.route('/', affiliates);
app.route('/', openapi);
app.route('/', liffRoutes);

// Mount route groups — Round 3
app.route('/', webhooks);
app.route('/', calendar);
app.route('/', reminders);
app.route('/', scoring);
app.route('/', templates);
app.route('/', chats);
app.route('/', notifications);
app.route('/', stripe);
app.route('/', health);
app.route('/', automations);
app.route('/', richMenus);
app.route('/', trackedLinks);
app.route('/', forms);
app.route('/', adPlatforms);
app.route('/', staff);
app.route('/', repairRoutes);
app.route('/', funnelRoutes);
app.route('/', crossAnalysisRoutes);
app.route('/', marks);
app.route('/', reservationRoutes);

// Short link: /r/:ref → landing page with LINE open button
app.get('/r/:ref', (c) => {
  const ref = c.req.param('ref');
  const liffUrl = c.env.LIFF_URL;
  if (!liffUrl) {
    return c.json({ error: 'LIFF_URL is not configured. Set it via wrangler secret put LIFF_URL.' }, 500);
  }
  const target = `${liffUrl}?ref=${encodeURIComponent(ref)}`;

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LINE Harness</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hiragino Sans',system-ui,sans-serif;background:#0d1117;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{text-align:center;max-width:400px;width:90%;padding:48px 24px}
h1{font-size:28px;font-weight:800;margin-bottom:8px}
.sub{font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:40px}
.btn{display:block;width:100%;padding:18px;border:none;border-radius:12px;font-size:18px;font-weight:700;text-decoration:none;text-align:center;color:#fff;background:#06C755;transition:opacity .15s}
.btn:active{opacity:.85}
.note{font-size:12px;color:rgba(255,255,255,0.3);margin-top:24px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
<h1>LINE Harness</h1>
<p class="sub">L社 / U社 の無料代替 OSS</p>
<a href="${target}" class="btn">LINE で体験する</a>
<p class="note">友だち追加するだけで<br>ステップ配信・フォーム・自動返信を体験できます</p>
</div>
</body>
</html>`);
});

// 404 fallback
app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

function buildFollowUpFlex() {
  return {
    type: 'flex' as const,
    altText: '【限定】修理料金 1,500円OFFのご案内',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FF6B35',
        contents: [
          { type: 'text', text: '期間限定オファー', color: '#FFFFFF', size: 'sm', weight: 'bold' },
          { type: 'text', text: '1,500円OFF', color: '#FFFFFF', size: 'xxl', weight: 'bold' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '昨日はお見積りいただきありがとうございました！',
            wrap: true,
            size: 'sm',
            color: '#555555',
          },
          {
            type: 'text',
            text: '今だけの特別クーポンをご用意しました🎉\n修理料金から1,500円OFFでご対応いたします。',
            wrap: true,
            size: 'sm',
            color: '#333333',
          },
          {
            type: 'text',
            text: '※本日中にご依頼の方が対象となります',
            wrap: true,
            size: 'xs',
            color: '#AAAAAA',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#FF6B35',
            action: {
              type: 'postback',
              label: '今すぐ修理を依頼する',
              data: 'action=start_repair',
              displayText: '修理を依頼する',
            },
          },
        ],
      },
    },
  };
}

async function processRepairFollowUps(db: D1Database, defaultToken: string): Promise<void> {
  const nowUtc = Date.now();
  const jstNowMs = nowUtc + 9 * 60 * 60 * 1000;
  const jstToday = new Date(jstNowMs).toISOString().slice(0, 10);
  const jstYesterdayMs = jstNowMs - 24 * 60 * 60 * 1000;
  const jstYesterday = new Date(jstYesterdayMs).toISOString().slice(0, 10);

  const quotes = await getUnsentFollowUpQuotes(db, `${jstYesterday}T00:00:00`, `${jstToday}T00:00:00`);
  const lineClient = new LineClient(defaultToken);
  const flexMsg = buildFollowUpFlex();

  const sentFriendIds = new Set<string>();
  for (const quote of quotes) {
    if (sentFriendIds.has(quote.friend_id)) continue;
    sentFriendIds.add(quote.friend_id);
    try {
      await lineClient.pushMessage(quote.line_user_id, [flexMsg]);
      await markFollowSent(db, quote.id);
    } catch (err) {
      console.error(`Follow-up send error for quote ${quote.id}:`, err);
    }
  }
}

// Scheduled handler for cron triggers — runs for all active LINE accounts
async function scheduled(
  event: ScheduledEvent,
  env: Env['Bindings'],
  _ctx: ExecutionContext,
): Promise<void> {
  // Get all active accounts from DB, plus the default env account
  const dbAccounts = await getLineAccounts(env.DB);
  const activeTokens = new Set<string>();

  // Default account from env
  activeTokens.add(env.LINE_CHANNEL_ACCESS_TOKEN);

  // DB accounts
  for (const account of dbAccounts) {
    if (account.is_active) {
      activeTokens.add(account.channel_access_token);
    }
  }

  // Run delivery for each account
  const jobs = [];
  for (const token of activeTokens) {
    const lineClient = new LineClient(token);
    jobs.push(
      processStepDeliveries(env.DB, lineClient, env.WORKER_URL),
      processScheduledBroadcasts(env.DB, lineClient, env.WORKER_URL),
      processReminderDeliveries(env.DB, lineClient),
    );
  }
  jobs.push(checkAccountHealth(env.DB));

  // Follow-up message: 毎日 JST 10:00 (UTC 01:00) に前日見積りユーザーへ 1,500円OFF を送信
  // event.cron で発火したスケジュールを特定し、専用 cron のみで実行（*/5 の毎回実行を防ぐ）
  if (event.cron === '0 1 * * *') {
    jobs.push(processRepairFollowUps(env.DB, env.LINE_CHANNEL_ACCESS_TOKEN));
  }

  await Promise.allSettled(jobs);
}

export default {
  fetch: app.fetch,
  scheduled,
};
