import { Hono } from 'hono';
import { verifySignature, LineClient } from '@line-crm/line-sdk';
import type { WebhookRequestBody, WebhookEvent, TextEventMessage } from '@line-crm/line-sdk';
import {
  upsertFriend,
  updateFriendFollowStatus,
  getFriendByLineUserId,
  getScenarios,
  enrollFriendInScenario,
  getScenarioSteps,
  advanceFriendScenario,
  completeFriendScenario,
  upsertChatOnMessage,
  getLineAccounts,
  jstNow,
  getRepairSymptomsByProduct,
  getRepairPrice,
  createRepairQuote,
  updateRepairQuoteRequestType,
  setFriendAttribute,
  getFriendAttribute,
} from '@line-crm/db';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage, expandVariables } from '../services/step-delivery.js';
import type { Env } from '../index.js';

const webhook = new Hono<Env>();

webhook.post('/webhook', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('X-Line-Signature') ?? '';
  const db = c.env.DB;

  let body: WebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as WebhookRequestBody;
  } catch {
    console.error('Failed to parse webhook body');
    return c.json({ status: 'ok' }, 200);
  }

  // Multi-account: resolve credentials from DB by destination (channel user ID)
  // or fall back to environment variables (default account)
  let channelSecret = c.env.LINE_CHANNEL_SECRET;
  let channelAccessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
  let matchedAccountId: string | null = null;

  if ((body as { destination?: string }).destination) {
    const accounts = await getLineAccounts(db);
    for (const account of accounts) {
      if (!account.is_active) continue;
      const isValid = await verifySignature(account.channel_secret, rawBody, signature);
      if (isValid) {
        channelSecret = account.channel_secret;
        channelAccessToken = account.channel_access_token;
        matchedAccountId = account.id;
        break;
      }
    }
  }

  // Verify with resolved secret
  const valid = await verifySignature(channelSecret, rawBody, signature);
  if (!valid) {
    console.error('Invalid LINE signature');
    return c.json({ status: 'ok' }, 200);
  }

  const lineClient = new LineClient(channelAccessToken);

  // 非同期処理 — LINE は ~1s 以内のレスポンスを要求
  const processingPromise = (async () => {
    for (const event of body.events) {
      try {
        await handleEvent(db, lineClient, event, channelAccessToken, matchedAccountId, c.env.WORKER_URL || new URL(c.req.url).origin);
      } catch (err) {
        console.error('Error handling webhook event:', err);
      }
    }
  })();

  c.executionCtx.waitUntil(processingPromise);

  return c.json({ status: 'ok' }, 200);
});

// ---- Repair Flow Constants ----

const MAIL_REPAIR_FORM_URL = 'https://forms.gle/XXXXXXXXXXXXXXXX';

const STORES = [
  {
    key: 'gotanda',
    shortName: '五反田店',
    name: 'リペアマスター五反田店',
    zip: '〒141-0031',
    address: '東京都品川区西五反田1丁目33-10 西五反田サインタワー9F',
    tel: '0120-025-088',
    hours: '10:00~20:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'kinshicho',
    shortName: '錦糸町店',
    name: 'リペアマスター錦糸町店',
    zip: '〒130-0013',
    address: '東京都墨田区錦糸3丁目3-3 錦糸ビル内3階',
    tel: '03-5637-8797',
    hours: '10:00~19:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'narita',
    shortName: '成田店',
    name: 'リペアマスター成田店',
    zip: '〒286-0029',
    address: '千葉県成田市ウイング土屋24 イオンモール成田店内1F',
    tel: '070-1595-6404',
    hours: '10:00~20:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'makuhari',
    shortName: '幕張店',
    name: 'リペアマスター幕張店',
    zip: '〒262-0032',
    address: '千葉県千葉市花見川区幕張町4丁目417-25 イトーヨーカドー幕張店内1F',
    tel: '070-3209-9235',
    hours: '10:00~19:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'shobu',
    shortName: '菖蒲店',
    name: 'リペアマスター菖蒲店',
    zip: '〒346-0106',
    address: '埼玉県久喜市菖蒲町菖蒲6005-1 モラージュ菖蒲内1F',
    tel: '070-1271-7186',
    hours: '10:00~19:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'gifu',
    shortName: '岐阜店',
    name: 'リペアマスター岐阜店',
    zip: '〒501-0497',
    address: '岐阜県本巣市三橋1100 モレラ岐阜2F',
    tel: '070-3131-6181',
    hours: '10:00~19:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'utsunomiya',
    shortName: '宇都宮店',
    name: 'リペアマスターベルモール宇都宮店',
    zip: '〒321-8555',
    address: '栃木県宇都宮市陽東6丁目2-1 ベルモール内2F ダイワンテレコム内',
    tel: '070-1307-5363',
    hours: '10:00~19:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'aomori',
    shortName: '青森店',
    name: 'リペアマスター青森店',
    zip: '〒030-0845',
    address: '青森県青森市緑3丁目9-2 サンロード青森内2F',
    tel: '070-3209-7849',
    hours: '10:00~19:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'morioka',
    shortName: '盛岡店',
    name: 'リペアマスター盛岡店',
    zip: '〒020-0034',
    address: '岩手県盛岡市盛岡駅前通1-44 フェザン本館内1F',
    tel: '080-3918-7346',
    hours: '10:00~19:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'oita',
    shortName: '大分店',
    name: 'リペアマスター大分店',
    zip: '〒870-1155',
    address: '大分県大分市玉沢楠本755-1 トキハわさだタウン3街区1階',
    tel: '070-1261-6924',
    hours: '10:00~18:30',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'kizugawa',
    shortName: '木津川店',
    name: 'リペアマスター木津川店',
    zip: '〒619-0216',
    address: '京都府木津川市州見台1丁目1-1-1 ガーデンモール木津川1階',
    tel: '070-6922-8143',
    hours: '10:00~20:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
  {
    key: 'nagaoka',
    shortName: '長岡店',
    name: 'リペアマスター長岡リバーサイド千秋店',
    zip: '〒940-2108',
    address: '新潟県長岡市千秋2丁目278 リバーサイド千秋2階',
    tel: '070-3229-5869',
    hours: '10:00~20:00',
    reservationUrl: 'https://forms.gle/XXXXXXXXXXXXXXXX',
  },
] as const;

type Store = typeof STORES[number];

// ---- Repair Flow Flex builders ----

function buildProductSelectFlex(): string {
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
      contents: [
        { type: 'text', text: '機種を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'text', text: 'お手持ちのMacBookの種類をお選びください', size: 'sm', color: '#64748b', wrap: true, margin: 'md' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            { type: 'button', action: { type: 'postback', label: 'MacBook Air', data: 'action=select_product&product=air&name=MacBook%20Air' }, style: 'primary', color: '#00B900' },
            { type: 'button', action: { type: 'postback', label: 'MacBook Pro', data: 'action=select_product&product=pro&name=MacBook%20Pro' }, style: 'primary', color: '#00B900', margin: 'sm' },
            { type: 'button', action: { type: 'postback', label: 'その他', data: 'action=select_product&product=other&name=%E3%81%9D%E3%81%AE%E4%BB%96' }, style: 'secondary', margin: 'sm' },
          ],
        },
      ],
    },
  });
}

function buildModelMethodFlex(productName: string, productKey: string): string {
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
      contents: [
        { type: 'text', text: productName, weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'text', text: 'モデルの特定方法をお選びください', size: 'sm', color: '#64748b', wrap: true, margin: 'md' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            { type: 'button', action: { type: 'postback', label: 'モデル名で選ぶ', data: `action=choose_model_method&product_key=${productKey}` }, style: 'primary', color: '#00B900' },
            { type: 'button', action: { type: 'postback', label: '年式で選ぶ', data: 'action=choose_year_method' }, style: 'primary', color: '#00B900', margin: 'sm' },
            { type: 'button', action: { type: 'postback', label: 'わからない', data: 'action=skip_model' }, style: 'secondary', margin: 'sm' },
          ],
        },
      ],
    },
  });
}

function buildModelSelectFlex(productKey: string): string {
  const modelsByProduct: Record<string, string[]> = {
    air: ['A2941', 'A2681', 'A2337', 'A2179', 'A1932', 'A1466', 'A1369'],
    pro: ['A2338', 'A2141', 'A1990', 'A1989', 'A1708', 'A1707', 'A1502'],
  };
  const models = modelsByProduct[productKey] ?? [];
  const otherButton = {
    type: 'button',
    action: { type: 'postback', label: 'その他・分からない', data: 'action=select_model&model_name=%E3%81%9D%E3%81%AE%E4%BB%96' },
    style: 'secondary',
  };

  // Split into bubbles of 4 buttons each to stay within LINE's rendering limit
  const chunks: string[][] = [];
  for (let i = 0; i < models.length; i += 4) {
    chunks.push(models.slice(i, i + 4));
  }

  const bubbles = chunks.map((chunk, idx) => {
    const isLast = idx === chunks.length - 1;
    return {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
        contents: [
          { type: 'text', text: 'モデル番号を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
          { type: 'separator', margin: 'lg' },
          {
            type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
            contents: [
              ...chunk.map((m) => ({
                type: 'button',
                action: { type: 'postback', label: m, data: `action=select_model&model_name=${encodeURIComponent(m)}` },
                style: 'primary',
                color: '#00B900',
              })),
              ...(isLast ? [otherButton] : []),
            ],
          },
        ],
      },
    };
  });

  return JSON.stringify({ type: 'carousel', contents: bubbles });
}

function buildYearSelectFlex(): string {
  const recentYears = [2025, 2024, 2023, 2022, 2021];
  const olderYears = [2020, 2019, 2018, 2017];
  const makeBubble = (years: number[], includeOther: boolean) => ({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
      contents: [
        { type: 'text', text: '年式を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            ...years.map((y) => ({
              type: 'button',
              action: { type: 'postback', label: `${y}年`, data: `action=select_year&year=${y}` },
              style: 'primary',
              color: '#00B900',
            })),
            ...(includeOther ? [{ type: 'button', action: { type: 'postback', label: 'その他の年式', data: 'action=select_year&year=0' }, style: 'secondary' }] : []),
          ],
        },
      ],
    },
  });
  return JSON.stringify({
    type: 'carousel',
    contents: [makeBubble(recentYears, false), makeBubble(olderYears, true)],
  });
}

function buildInchSelectFlex(): string {
  const sizes = ['13インチ', '14インチ', '15インチ', '16インチ'];
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
      contents: [
        { type: 'text', text: 'インチ数を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            ...sizes.map((s) => ({
              type: 'button',
              action: { type: 'postback', label: s, data: `action=select_inch&inch=${encodeURIComponent(s)}` },
              style: 'primary',
              color: '#00B900',
            })),
            { type: 'button', action: { type: 'postback', label: 'その他・分からない', data: 'action=select_inch&inch=%E3%81%9D%E3%81%AE%E4%BB%96' }, style: 'secondary' },
          ],
        },
      ],
    },
  });
}

function buildStoreSelectFlex(): string {
  const chunkSize = 5;
  const bubbles = [];
  for (let i = 0; i < STORES.length; i += chunkSize) {
    const chunk = STORES.slice(i, i + chunkSize);
    const isLast = i + chunkSize >= STORES.length;
    bubbles.push({
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
        contents: [
          { type: 'text', text: '店舗を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
          { type: 'separator', margin: 'lg' },
          {
            type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
            contents: [
              ...chunk.map((s) => ({
                type: 'button',
                action: { type: 'postback', label: s.shortName, data: `action=select_store&store_key=${s.key}` },
                style: 'primary',
                color: '#00B900',
              })),
              ...(isLast ? [{
                type: 'button',
                action: { type: 'postback', label: '該当店舗なし', data: 'action=select_store&store_key=none' },
                style: 'secondary',
              }] : []),
            ],
          },
        ],
      },
    });
  }
  return JSON.stringify({ type: 'carousel', contents: bubbles });
}

async function buildSymptomSelectFlex(db: D1Database, productId: string): Promise<string> {
  const symptoms = await getRepairSymptomsByProduct(db, productId);
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
      contents: [
        { type: 'text', text: '症状を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: symptoms.map((s) => ({
            type: 'button',
            action: { type: 'postback', label: s.name, data: `action=select_symptom&symptom_id=${s.id}&symptom_name=${encodeURIComponent(s.name)}` },
            style: 'primary',
            color: '#00B900',
          })),
        },
      ],
    },
  });
}

function buildQuoteFlex(params: {
  productName: string;
  symptomName: string;
  priceFrom: number;
  priceTo: number | null;
  deliveryFrom: number;
  deliveryTo: number | null;
  quoteId: string;
}): string {
  const priceStr = params.priceTo
    ? `¥${params.priceFrom.toLocaleString()}〜¥${params.priceTo.toLocaleString()}`
    : `¥${params.priceFrom.toLocaleString()}〜`;
  const deliveryStr = params.deliveryTo
    ? `${params.deliveryFrom}〜${params.deliveryTo}日`
    : `${params.deliveryFrom}日〜`;
  return JSON.stringify({
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#00B900',
      contents: [{ type: 'text', text: '修理見積り', color: '#ffffff', weight: 'bold', size: 'xl' }],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
      contents: [
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '機種', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: params.productName, size: 'sm', color: '#1e293b', weight: 'bold', flex: 3 },
        ]},
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '症状', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: params.symptomName, size: 'sm', color: '#1e293b', weight: 'bold', flex: 3, wrap: true },
        ]},
        { type: 'separator', margin: 'md' },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '修理費用', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: priceStr, size: 'sm', color: '#00B900', weight: 'bold', flex: 3 },
        ], margin: 'md' },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '納期目安', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: deliveryStr, size: 'sm', color: '#1e293b', weight: 'bold', flex: 3 },
        ]},
        { type: 'text', text: '※診断後に正式な費用をお伝えします', size: 'xs', color: '#94a3b8', wrap: true, margin: 'lg' },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
      contents: [
        { type: 'button', action: { type: 'postback', label: '郵送で依頼する', data: `action=request_type&type=mail&quote_id=${params.quoteId}` }, style: 'primary', color: '#00B900' },
        { type: 'button', action: { type: 'postback', label: '店舗に持込む', data: `action=request_type&type=store&quote_id=${params.quoteId}` }, style: 'primary', color: '#00B900' },
        { type: 'button', action: { type: 'postback', label: '質問・相談したい', data: `action=request_type&type=consult&quote_id=${params.quoteId}` }, style: 'secondary' },
      ],
    },
  });
}

async function handleEvent(
  db: D1Database,
  lineClient: LineClient,
  event: WebhookEvent,
  lineAccessToken: string,
  lineAccountId: string | null = null,
  workerUrl?: string,
): Promise<void> {
  if (event.type === 'follow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    // プロフィール取得 & 友だち登録/更新
    let profile;
    try {
      profile = await lineClient.getProfile(userId);
    } catch (err) {
      console.error('Failed to get profile for', userId, err);
    }

    const friend = await upsertFriend(db, {
      lineUserId: userId,
      displayName: profile?.displayName ?? null,
      pictureUrl: profile?.pictureUrl ?? null,
      statusMessage: profile?.statusMessage ?? null,
    });

    // Set line_account_id for multi-account tracking
    if (lineAccountId) {
      await db.prepare('UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL')
        .bind(lineAccountId, friend.id).run();
    }

    // ウェルカムメッセージ + 機種選択Flex
    try {
      await lineClient.replyMessage(event.replyToken, [
        { type: 'text', text: 'お見積りを作成させて頂きますのでお客様の端末情報を下記選択肢よりお選び下さい💻\n\n※修理時にデータに触れる事はございません！\nデータそのままで修理可能です✨' },
        buildMessage('flex', buildProductSelectFlex()),
      ]);
    } catch (err) {
      console.error('Failed to send welcome message:', err);
    }

    // friend_add シナリオに登録（このアカウントのシナリオのみ）
    const scenarios = await getScenarios(db);
    for (const scenario of scenarios) {
      // Only trigger scenarios belonging to this account (or unassigned for backward compat)
      const scenarioAccountMatch = !scenario.line_account_id || !lineAccountId || scenario.line_account_id === lineAccountId;
      if (scenario.trigger_type === 'friend_add' && scenario.is_active && scenarioAccountMatch) {
        try {
          const existing = await db
            .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
            .bind(friend.id, scenario.id)
            .first<{ id: string }>();
          if (!existing) {
            const friendScenario = await enrollFriendInScenario(db, friend.id, scenario.id);

            // Immediate delivery: if the first step has delay=0, send it now via replyMessage (free)
            const steps = await getScenarioSteps(db, scenario.id);
            const firstStep = steps[0];
            if (firstStep && firstStep.delay_minutes === 0 && friendScenario.status === 'active') {
              try {
                const expandedContent = expandVariables(firstStep.message_content, friend as { id: string; display_name: string | null; user_id: string | null });
                const message = buildMessage(firstStep.message_type, expandedContent);
                await lineClient.replyMessage(event.replyToken, [message]);
                console.log(`Immediate delivery: sent step ${firstStep.id} to ${userId}`);

                // Log outgoing message (replyMessage = 無料)
                const logId = crypto.randomUUID();
                await db
                  .prepare(
                    `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, created_at)
                     VALUES (?, ?, 'outgoing', ?, ?, NULL, ?, 'reply', ?)`,
                  )
                  .bind(logId, friend.id, firstStep.message_type, firstStep.message_content, firstStep.id, jstNow())
                  .run();

                // Advance or complete the friend_scenario
                const secondStep = steps[1] ?? null;
                if (secondStep) {
                  const nextDeliveryDate = new Date(Date.now() + 9 * 60 * 60_000);
                  nextDeliveryDate.setMinutes(nextDeliveryDate.getMinutes() + secondStep.delay_minutes);
                  // Enforce 9:00-21:00 JST delivery window
                  const h = nextDeliveryDate.getUTCHours();
                  if (h < 9 || h >= 21) {
                    if (h >= 21) nextDeliveryDate.setUTCDate(nextDeliveryDate.getUTCDate() + 1);
                    nextDeliveryDate.setUTCHours(9, 0, 0, 0);
                  }
                  await advanceFriendScenario(db, friendScenario.id, firstStep.step_order, nextDeliveryDate.toISOString().slice(0, -1) + '+09:00');
                } else {
                  await completeFriendScenario(db, friendScenario.id);
                }
              } catch (err) {
                console.error('Failed immediate delivery for scenario', scenario.id, err);
              }
            }
          }
        } catch (err) {
          console.error('Failed to enroll friend in scenario', scenario.id, err);
        }
      }
    }

    // イベントバス発火: friend_add
    await fireEvent(db, 'friend_add', { friendId: friend.id, eventData: { displayName: friend.display_name } }, lineAccessToken, lineAccountId);
    return;
  }

  if (event.type === 'unfollow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    await updateFriendFollowStatus(db, userId, false);
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const textMessage = event.message as TextEventMessage;
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    const incomingText = textMessage.text;
    const now = jstNow();
    const logId = crypto.randomUUID();

    // 受信メッセージをログに記録
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, ?)`,
      )
      .bind(logId, friend.id, incomingText, now)
      .run();

    // チャットを作成/更新（ユーザーの自発的メッセージのみ unread にする）
    // ボタンタップ等の自動応答キーワードは除外
    const autoKeywords = ['料金', '機能', 'API', 'フォーム', 'ヘルプ', 'UUID', 'UUID連携について教えて', 'UUID連携を確認', '配信時間', '導入支援を希望します', 'アカウント連携を見る', '体験を完了する', 'BAN対策を見る', '連携確認'];
    const isAutoKeyword = autoKeywords.some(k => incomingText === k);
    const isTimeCommand = /(?:配信時間|配信|届けて|通知)[はを]?\s*\d{1,2}\s*時/.test(incomingText);
    if (!isAutoKeyword && !isTimeCommand) {
      await upsertChatOnMessage(db, friend.id);
    }

    // 配信時間設定: 「配信時間は○時」「○時に届けて」等のパターンを検出
    const timeMatch = incomingText.match(/(?:配信時間|配信|届けて|通知)[はを]?\s*(\d{1,2})\s*時/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      if (hour >= 6 && hour <= 22) {
        // Save preferred_hour to friend metadata
        const existing = await db.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friend.id).first<{ metadata: string }>();
        const meta = JSON.parse(existing?.metadata || '{}');
        meta.preferred_hour = hour;
        await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(meta), jstNow(), friend.id).run();

        // Reply with confirmation
        try {
          const period = hour < 12 ? '午前' : '午後';
          const displayHour = hour <= 12 ? hour : hour - 12;
          await lineClient.replyMessage(event.replyToken, [
            buildMessage('flex', JSON.stringify({
              type: 'bubble',
              body: { type: 'box', layout: 'vertical', contents: [
                { type: 'text', text: '配信時間を設定しました', size: 'lg', weight: 'bold', color: '#1e293b' },
                { type: 'box', layout: 'vertical', contents: [
                  { type: 'text', text: `${period} ${displayHour}:00`, size: 'xxl', weight: 'bold', color: '#f59e0b', align: 'center' },
                  { type: 'text', text: `（${hour}:00〜）`, size: 'sm', color: '#64748b', align: 'center', margin: 'sm' },
                ], backgroundColor: '#fffbeb', cornerRadius: 'md', paddingAll: '20px', margin: 'lg' },
                { type: 'text', text: '今後のステップ配信はこの時間以降にお届けします。', size: 'xs', color: '#64748b', wrap: true, margin: 'lg' },
              ], paddingAll: '20px' },
            })),
          ]);
        } catch (err) {
          console.error('Failed to reply for time setting', err);
        }
        return;
      }
    }

    // Cross-account trigger: send message from another account via UUID
    if (incomingText === '体験を完了する' && lineAccountId) {
      try {
        const friendRecord = await db.prepare('SELECT user_id FROM friends WHERE id = ?').bind(friend.id).first<{ user_id: string | null }>();
        if (friendRecord?.user_id) {
          // Find the same user on other accounts
          const otherFriends = await db.prepare(
            'SELECT f.line_user_id, la.channel_access_token FROM friends f INNER JOIN line_accounts la ON la.id = f.line_account_id WHERE f.user_id = ? AND f.line_account_id != ? AND f.is_following = 1'
          ).bind(friendRecord.user_id, lineAccountId).all<{ line_user_id: string; channel_access_token: string }>();

          for (const other of otherFriends.results) {
            const otherClient = new LineClient(other.channel_access_token);
            await otherClient.pushMessage(other.line_user_id, [buildMessage('flex', JSON.stringify({
              type: 'bubble', size: 'giga',
              header: { type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#fffbeb',
                contents: [{ type: 'text', text: `${friend.display_name || ''}さんへ`, size: 'lg', weight: 'bold', color: '#1e293b' }],
              },
              body: { type: 'box', layout: 'vertical', paddingAll: '20px',
                contents: [
                  { type: 'text', text: '別アカウントからのアクションを検知しました。', size: 'sm', color: '#06C755', weight: 'bold', wrap: true },
                  { type: 'text', text: 'アカウント連携が正常に動作しています。体験ありがとうございました。', size: 'sm', color: '#1e293b', wrap: true, margin: 'md' },
                  { type: 'separator', margin: 'lg' },
                  { type: 'text', text: 'ステップ配信・フォーム即返信・アカウント連携・リッチメニュー・自動返信 — 全て無料、全てOSS。', size: 'xs', color: '#64748b', wrap: true, margin: 'lg' },
                ],
              },
              footer: { type: 'box', layout: 'vertical', paddingAll: '16px',
                contents: [
                  { type: 'button', action: { type: 'message', label: '導入について相談する', text: '導入支援を希望します' }, style: 'primary', color: '#06C755' },
                  ...(c.env.LIFF_URL ? [{ type: 'button', action: { type: 'uri', label: 'フィードバックを送る', uri: `${c.env.LIFF_URL}?page=form` }, style: 'secondary', margin: 'sm' }] : []),
                ],
              },
            }))]);
          }

          // Reply on Account ② confirming
          await lineClient.replyMessage(event.replyToken, [buildMessage('flex', JSON.stringify({
            type: 'bubble',
            body: { type: 'box', layout: 'vertical', paddingAll: '20px',
              contents: [
                { type: 'text', text: 'Account ① にメッセージを送りました', size: 'sm', color: '#06C755', weight: 'bold', align: 'center' },
                { type: 'text', text: 'Account ① のトーク画面を確認してください', size: 'xs', color: '#64748b', align: 'center', margin: 'md' },
              ],
            },
          }))]);
          return;
        }
      } catch (err) {
        console.error('Cross-account trigger error:', err);
      }
    }

    // 自動返信チェック（このアカウントのルール + グローバルルールのみ）
    // NOTE: Auto-replies use replyMessage (free, no quota) instead of pushMessage
    // The replyToken is only valid for ~1 minute after the message event
    const autoReplies = await db
      .prepare(`SELECT * FROM auto_replies WHERE is_active = 1 AND (line_account_id IS NULL${lineAccountId ? ` OR line_account_id = '${lineAccountId}'` : ''}) ORDER BY created_at ASC`)
      .all<{
        id: string;
        keyword: string;
        match_type: 'exact' | 'contains';
        response_type: string;
        response_content: string;
        is_active: number;
        created_at: string;
      }>();

    let matched = false;
    for (const rule of autoReplies.results) {
      const isMatch =
        rule.match_type === 'exact'
          ? incomingText === rule.keyword
          : incomingText.includes(rule.keyword);

      if (isMatch) {
        try {
          // Expand template variables ({{name}}, {{uid}}, {{auth_url:CHANNEL_ID}})
          const expandedContent = expandVariables(rule.response_content, friend as { id: string; display_name: string | null; user_id: string | null }, workerUrl);
          const replyMsg = buildMessage(rule.response_type, expandedContent);
          await lineClient.replyMessage(event.replyToken, [replyMsg]);

          // 送信ログ（replyMessage = 無料）
          const outLogId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, created_at)
               VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, 'reply', ?)`,
            )
            .bind(outLogId, friend.id, rule.response_type, rule.response_content, jstNow())
            .run();
        } catch (err) {
          console.error('Failed to send auto-reply', err);
        }

        matched = true;
        break;
      }
    }

    // イベントバス発火: message_received
    await fireEvent(db, 'message_received', {
      friendId: friend.id,
      eventData: { text: incomingText, matched },
    }, lineAccessToken, lineAccountId);

    return;
  }

  if (event.type === 'postback') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    const params = new URLSearchParams(event.postback.data);
    const action = params.get('action');

    if (action === 'select_product') {
      const productKey = params.get('product') ?? '';
      const productName = params.get('name') ?? '';
      const productIdMap: Record<string, string> = {
        air:   'prod-air-0001-0000-0000-000000000001',
        pro:   'prod-pro-0001-0000-0000-000000000002',
        other: 'prod-oth-0001-0000-0000-000000000003',
      };
      const productId = productIdMap[productKey] ?? productIdMap['other'];
      await setFriendAttribute(db, friend.id, 'repair_product_id', productId);
      await setFriendAttribute(db, friend.id, 'repair_product_name', productName);
      await setFriendAttribute(db, friend.id, 'repair_product_key', productKey);
      try {
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', buildModelMethodFlex(productName, productKey)),
        ]);
      } catch (err) {
        console.error('Failed to send model method flex:', err);
      }
      return;
    }

    if (action === 'choose_model_method') {
      const productKey = params.get('product_key')
        ?? (await getFriendAttribute(db, friend.id, 'repair_product_key'))
        ?? 'other';
      try {
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', buildModelSelectFlex(productKey)),
        ]);
      } catch (err) {
        console.error('Failed to send model select flex:', err);
      }
      return;
    }

    if (action === 'select_model') {
      const modelName = params.get('model_name') ?? '';
      if (modelName) {
        await setFriendAttribute(db, friend.id, 'repair_model_name', modelName);
      }
      const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id'))
        ?? 'prod-oth-0001-0000-0000-000000000003';
      try {
        const symptomFlex = await buildSymptomSelectFlex(db, productId);
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', symptomFlex),
        ]);
      } catch (err) {
        console.error('Failed to send symptom flex after model select:', err);
      }
      return;
    }

    if (action === 'choose_year_method') {
      try {
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', buildYearSelectFlex()),
        ]);
      } catch (err) {
        console.error('Failed to send year select flex:', err);
      }
      return;
    }

    if (action === 'skip_model') {
      const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id'))
        ?? 'prod-oth-0001-0000-0000-000000000003';
      try {
        const symptomFlex = await buildSymptomSelectFlex(db, productId);
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', symptomFlex),
        ]);
      } catch (err) {
        console.error('Failed to send symptom flex:', err);
      }
      return;
    }

    if (action === 'select_year') {
      const year = parseInt(params.get('year') ?? '0', 10);
      if (year > 0) {
        await setFriendAttribute(db, friend.id, 'repair_year', String(year));
      }
      try {
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', buildInchSelectFlex()),
        ]);
      } catch (err) {
        console.error('Failed to send inch select flex:', err);
      }
      return;
    }

    if (action === 'select_inch') {
      const inch = params.get('inch') ?? '';
      if (inch) {
        await setFriendAttribute(db, friend.id, 'repair_inch_size', inch);
      }
      const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id'))
        ?? 'prod-oth-0001-0000-0000-000000000003';
      try {
        const symptomFlex = await buildSymptomSelectFlex(db, productId);
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', symptomFlex),
        ]);
      } catch (err) {
        console.error('Failed to send symptom flex after inch:', err);
      }
      return;
    }

    if (action === 'select_symptom') {
      const symptomId = params.get('symptom_id') ?? '';
      const symptomName = params.get('symptom_name') ?? '';
      const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id'))
        ?? 'prod-oth-0001-0000-0000-000000000003';
      const productName = (await getFriendAttribute(db, friend.id, 'repair_product_name')) ?? 'MacBook';
      const modelName = await getFriendAttribute(db, friend.id, 'repair_model_name');
      const yearStr = await getFriendAttribute(db, friend.id, 'repair_year');

      await setFriendAttribute(db, friend.id, 'repair_symptom_id', symptomId);

      const price = await getRepairPrice(db, productId, symptomId);

      try {
        if (price) {
          const quote = await createRepairQuote(db, {
            friendId: friend.id,
            productId,
            symptomId,
            modelName: modelName ?? productName,
            year: yearStr ? parseInt(yearStr, 10) : null,
            priceFrom: price.price_from,
            priceTo: price.price_to,
            deliveryDaysFrom: price.delivery_days_from,
            deliveryDaysTo: price.delivery_days_to,
          });
          await setFriendAttribute(db, friend.id, 'repair_quote_id', quote.id);
          await lineClient.replyMessage(event.replyToken, [
            buildMessage('flex', buildQuoteFlex({
              productName,
              symptomName,
              priceFrom: price.price_from,
              priceTo: price.price_to,
              deliveryFrom: price.delivery_days_from,
              deliveryTo: price.delivery_days_to,
              quoteId: quote.id,
            })),
          ]);
        } else {
          await lineClient.replyMessage(event.replyToken, [
            { type: 'text', text: `${symptomName}についてのお見積りを承りました。担当者より詳細をご連絡いたします。` },
          ]);
        }
      } catch (err) {
        console.error('Failed to send quote flex:', err);
      }
      return;
    }

    if (action === 'request_type') {
      const type = params.get('type') as 'mail' | 'store' | 'consult' | null;
      const quoteId = params.get('quote_id') ?? '';
      if (type && quoteId) {
        await updateRepairQuoteRequestType(db, quoteId, type);
      }

      try {
        if (type === 'mail') {
          await lineClient.replyMessage(event.replyToken, [
            { type: 'text', text: '下記ボタンよりお申し込みをよろしくお願い申し上げます！' },
            buildMessage('flex', JSON.stringify({
              type: 'bubble',
              body: {
                type: 'box', layout: 'vertical', paddingAll: '20px',
                contents: [
                  { type: 'button', action: { type: 'uri', label: '郵送修理ご依頼フォーム', uri: MAIL_REPAIR_FORM_URL }, style: 'primary', color: '#00B900' },
                ],
              },
            })),
          ]);
        } else if (type === 'store') {
          await lineClient.replyMessage(event.replyToken, [
            buildMessage('flex', buildStoreSelectFlex()),
          ]);
        } else {
          await lineClient.replyMessage(event.replyToken, [
            { type: 'text', text: 'ご質問・ご相談を承りました。担当者よりご連絡いたしますので、しばらくお待ちください。' },
          ]);
        }
      } catch (err) {
        console.error('Failed to reply for request_type:', err);
      }
      return;
    }

    if (action === 'select_store') {
      const storeKey = params.get('store_key') ?? '';

      if (storeKey === 'none') {
        try {
          await lineClient.replyMessage(event.replyToken, [
            { type: 'text', text: 'ご希望の店舗が見つからない場合は、お気軽にご相談ください。' },
          ]);
        } catch (err) {
          console.error('Failed to reply for no store:', err);
        }
        return;
      }

      const store = STORES.find((s) => s.key === storeKey);
      if (!store) return;

      await setFriendAttribute(db, friend.id, 'repair_store', store.shortName);

      const storeInfoText =
        `${store.shortName}での店頭修理をご希望ですね！✨\n` +
        `下記店舗情報となります🙇‍♂️\n\n` +
        `${store.name}\n` +
        `住所：\n${store.zip}\n${store.address}\n` +
        `電話番号：${store.tel}\n` +
        `営業時間：${store.hours}\n\n` +
        `ご来店のご予約は下記のボタンからお進みください！`;

      try {
        await lineClient.replyMessage(event.replyToken, [
          { type: 'text', text: storeInfoText },
          buildMessage('flex', JSON.stringify({
            type: 'bubble',
            body: {
              type: 'box', layout: 'vertical', paddingAll: '20px',
              contents: [
                { type: 'button', action: { type: 'uri', label: '来店予約する', uri: store.reservationUrl }, style: 'primary', color: '#00B900' },
              ],
            },
          })),
        ]);
      } catch (err) {
        console.error('Failed to reply for store selection:', err);
      }
      return;
    }

    return;
  }
}

export { webhook };
