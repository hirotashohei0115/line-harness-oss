import { Hono } from 'hono';
import {
  getStoreHours,
  getAllStoreHours,
  upsertStoreHour,
  getBookedTimes,
  createStoreReservation,
  listStoreReservations,
  getStoreReservation,
  updateReservationStatus,
  deleteStoreReservation,
  upsertChatOnMessage,
  jstNow,
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import { sendChatworkMessage, jstTimestamp } from '../lib/chatwork.js';
import { createCalendarEvent, STORE_CALENDAR_IDS } from '../lib/google-calendar.js';
import type { Env } from '../index.js';

const reservationRoutes = new Hono<Env>();

const STORE_CHATWORK_CONFIG: Record<string, { roomId: string; managerAccountId: string | null; storeAccountId: string | null }> = {
  'aomori':     { roomId: '282185894', managerAccountId: '4990024',  storeAccountId: '10740725' },
  'morioka':    { roomId: '143977136', managerAccountId: '3864937',  storeAccountId: '6955860'  },
  'utsunomiya': { roomId: '198849506', managerAccountId: '10048092', storeAccountId: '5205467'  },
  'shobu':      { roomId: '243564267', managerAccountId: '6401378',  storeAccountId: '6380351'  },
  'narita':     { roomId: '177956614', managerAccountId: null,       storeAccountId: '4581697'  },
  'makuhari':   { roomId: '275467046', managerAccountId: '7008476',  storeAccountId: '7120956'  },
  'kinshicho':  { roomId: '347607561', managerAccountId: '1669352',  storeAccountId: null       },
  'gotanda':    { roomId: '305105971', managerAccountId: '8870364',  storeAccountId: '3711854'  },
  'nagaoka':    { roomId: '433591904', managerAccountId: '11294514', storeAccountId: '11307739' },
  'gifu':       { roomId: '368537823', managerAccountId: '10218778', storeAccountId: '9589322'  },
  'kizugawa':   { roomId: '420332491', managerAccountId: '3069371',  storeAccountId: '11121070' },
  'oita':       { roomId: '288490480', managerAccountId: '10168426', storeAccountId: '7482587'  },
};

async function addTagToFriend(db: D1Database, friendId: string, tagName: string): Promise<void> {
  try {
    const tag = await db.prepare('SELECT id FROM tags WHERE name = ?').bind(tagName).first<{ id: string }>();
    if (!tag) return;
    await db.prepare('INSERT OR IGNORE INTO friend_tags (friend_id, tag_id) VALUES (?, ?)').bind(friendId, tag.id).run();
  } catch (err) {
    console.error('addTagToFriend error:', err);
  }
}

async function removeTagsByNames(db: D1Database, friendId: string, tagNames: string[]): Promise<void> {
  if (tagNames.length === 0) return;
  try {
    const placeholders = tagNames.map(() => '?').join(',');
    await db
      .prepare(`DELETE FROM friend_tags WHERE friend_id = ? AND tag_id IN (SELECT id FROM tags WHERE name IN (${placeholders}))`)
      .bind(friendId, ...tagNames)
      .run();
  } catch (err) {
    console.error('removeTagsByNames error:', err);
  }
}

const STORE_NAMES: Record<string, string> = {
  gotanda: '五反田店',
  kinshicho: '錦糸町店',
  narita: '成田店',
  makuhari: '幕張店',
  shobu: '菖蒲店',
  gifu: '岐阜店',
  utsunomiya: '宇都宮店',
  aomori: '青森店',
  morioka: '盛岡店',
  oita: '大分店',
  kizugawa: '木津川店',
  nagaoka: '長岡店',
};

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function generateTimeSlots(openTime: string, closeTime: string): string[] {
  const slots: string[] = [];
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const openTotal = openH * 60 + openM;
  const closeTotal = closeH * 60 + closeM;
  for (let t = openTotal; t < closeTotal; t += 30) {
    const h = Math.floor(t / 60).toString().padStart(2, '0');
    const m = (t % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
  }
  return slots;
}

// GET /api/store-hours/:storeKey — public
reservationRoutes.get('/api/store-hours/:storeKey', async (c) => {
  const storeKey = c.req.param('storeKey');
  const hours = await getStoreHours(c.env.DB, storeKey);
  return c.json({ success: true, data: hours });
});

// GET /api/reservations/slots?storeKey=&date= — public
reservationRoutes.get('/api/reservations/slots', async (c) => {
  const storeKey = c.req.query('storeKey') ?? '';
  const date = c.req.query('date') ?? '';
  if (!storeKey || !date) return c.json({ success: false, error: 'storeKey and date required' }, 400);

  // Parse YYYY-MM-DD directly with Date.UTC to avoid local-timezone getDay() mismatches
  const dateParts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateParts) return c.json({ success: false, error: 'Invalid date format (expected YYYY-MM-DD)' }, 400);
  const dayOfWeek = new Date(Date.UTC(+dateParts[1], +dateParts[2] - 1, +dateParts[3])).getUTCDay();

  const hours = await getStoreHours(c.env.DB, storeKey);
  const dayHours = hours.find((h) => h.day_of_week === dayOfWeek);

  if (!dayHours) {
    // No hours config for this store yet — return all default slots rather than blocking the user
    const defaultSlots = generateTimeSlots('10:00', '19:00');
    return c.json({ success: true, data: { slots: defaultSlots } });
  }

  if (dayHours.is_closed) {
    return c.json({ success: true, data: { slots: [] } });
  }

  const allSlots = generateTimeSlots(dayHours.open_time, dayHours.close_time);
  const booked = await getBookedTimes(c.env.DB, storeKey, date);
  const bookedSet = new Set(booked);
  const availableSlots = allSlots.filter((s) => !bookedSet.has(s));

  return c.json({ success: true, data: { slots: availableSlots } });
});

// GET /api/repair-info/:lineUserId — public (pre-fill form from repair flow)
reservationRoutes.get('/api/repair-info/:lineUserId', async (c) => {
  const lineUserId = c.req.param('lineUserId');
  const friend = await c.env.DB
    .prepare('SELECT id, display_name FROM friends WHERE line_user_id = ? LIMIT 1')
    .bind(lineUserId)
    .first<{ id: string; display_name: string | null }>();

  if (!friend) return c.json({ success: true, data: null });

  const attrRows = await c.env.DB
    .prepare('SELECT key, value FROM friend_attributes WHERE friend_id = ? AND key IN (?, ?, ?, ?, ?, ?)')
    .bind(friend.id, 'repair_store', 'repair_model_name', 'repair_symptom_id', 'repair_product_name', 'repair_year', 'repair_inch_size')
    .all<{ key: string; value: string }>();

  const attrs: Record<string, string> = {};
  for (const row of attrRows.results) attrs[row.key] = row.value;

  // Look up symptom name if we have an ID
  let symptomName = '';
  if (attrs['repair_symptom_id']) {
    const sym = await c.env.DB
      .prepare('SELECT name FROM repair_symptoms WHERE id = ? LIMIT 1')
      .bind(attrs['repair_symptom_id'])
      .first<{ name: string }>();
    symptomName = sym?.name ?? '';
  }

  return c.json({
    success: true,
    data: {
      name: friend.display_name ?? '',
      storeKey: attrs['repair_store'] ? Object.entries(STORE_NAMES).find(([, v]) => v === attrs['repair_store'])?.[0] ?? '' : '',
      modelName: attrs['repair_model_name'] ?? '',
      productName: attrs['repair_product_name'] ?? '',
      year: attrs['repair_year'] ?? '',
      inchSize: attrs['repair_inch_size'] ?? '',
      symptomName,
    },
  });
});

// POST /api/reservations — public (create reservation)
reservationRoutes.post('/api/reservations', async (c) => {
  const body = await c.req.json<{
    lineUserId: string;
    storeKey: string;
    date: string;
    time: string;
    name: string;
    phone?: string;
    notes?: string;
  }>();

  const { lineUserId, storeKey, date, time, name } = body;
  if (!lineUserId || !storeKey || !date || !time || !name) {
    return c.json({ success: false, error: 'Missing required fields' }, 400);
  }

  const friend = await c.env.DB
    .prepare('SELECT id FROM friends WHERE line_user_id = ? LIMIT 1')
    .bind(lineUserId)
    .first<{ id: string }>();

  const reservation = await createStoreReservation(c.env.DB, {
    friendId: friend?.id ?? null,
    lineUserId,
    storeKey,
    date,
    time,
    name,
    phone: body.phone ?? '',
    notes: body.notes ?? '',
  });

  // Set mark_04 on friend, add 店舗持込 tag, remove postal tags
  if (friend?.id) {
    await c.env.DB
      .prepare('UPDATE friends SET contact_mark_id = ? WHERE id = ?')
      .bind('mark_04', friend.id)
      .run();
    await removeTagsByNames(c.env.DB, friend.id, [
      '郵送依頼', '郵送（盛岡）', '郵送（菖蒲）', '郵送（岐阜）', '郵送（大分）',
      '梱包キット希望する', '梱包キット希望しない',
    ]);
    await addTagToFriend(c.env.DB, friend.id, '店舗持込');
  }

  const storeName = STORE_NAMES[storeKey] ?? storeKey;
  const [y, mo, d] = date.split('-');
  const dateDisplay = `${y}年${Number(mo)}月${Number(d)}日`;
  const dateObj = new Date(date + 'T00:00:00+09:00');
  const dayName = DAY_NAMES[dateObj.getDay()];

  // LINE confirmation message
  const confirmText = `✅ 来店予約が完了しました！\n\n📍 店舗：リペアマスター${storeName}\n📅 日時：${dateDisplay}（${dayName}）${time}〜\n👤 お名前：${name} 様${body.phone ? `\n📞 電話番号：${body.phone}` : ''}${body.notes ? `\n📝 ご要望：${body.notes}` : ''}\n\nご来店をお待ちしております！\n※ご不明な点がございましたらLINEにてお問い合わせください。`;
  try {
    const lineToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (lineToken) {
      const lineClient = new LineClient(lineToken);
      await lineClient.pushMessage(lineUserId, [{ type: 'text', text: confirmText }]);
    }
  } catch (err) {
    console.error('LINE confirmation send error:', err);
  }

  // チャットに予約完了メッセージを保存
  if (friend?.id) {
    try {
      await c.env.DB
        .prepare(`INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, is_read, created_at) VALUES (?, ?, 'outgoing', 'text', ?, NULL, NULL, 1, ?)`)
        .bind(crypto.randomUUID(), friend.id, confirmText, jstNow())
        .run();
      await upsertChatOnMessage(c.env.DB, friend.id);
    } catch (err) {
      console.error('reservation chat log error:', err);
    }
  }

  // Fetch latest repair quote for price/delivery info (used in both Chatwork and Calendar)
  const quote = friend?.id
    ? await c.env.DB
        .prepare('SELECT price_from, price_to, delivery_days_from, delivery_days_to FROM repair_quotes WHERE friend_id = ? ORDER BY created_at DESC LIMIT 1')
        .bind(friend.id)
        .first<{ price_from: number | null; price_to: number | null; delivery_days_from: number | null; delivery_days_to: number | null }>()
    : null;
  let priceText = '未見積もり';
  if (quote?.price_from != null && quote.price_to != null) {
    priceText = `${quote.price_from.toLocaleString()}〜${quote.price_to.toLocaleString()}円`;
  } else if (quote?.price_from != null) {
    priceText = `${quote.price_from.toLocaleString()}円〜`;
  }
  let deliveryText = '未定';
  if (quote?.delivery_days_from != null && quote.delivery_days_to != null) {
    deliveryText = `${quote.delivery_days_from}〜${quote.delivery_days_to}日`;
  } else if (quote?.delivery_days_from != null) {
    deliveryText = `${quote.delivery_days_from}日〜`;
  }

  // Chatwork notification — await to ensure delivery before response (Worker keepalive)
  const cwToken = c.env.CHATWORK_API_TOKEN;
  const reservationInfo = `店舗：リペアマスター${storeName}\n日時：${dateDisplay}（${dayName}）${time}〜\nお名前：${name}様\n電話番号：${body.phone || '未入力'}\n機種/症状：${body.notes || '未入力'}\n見積もり金額：${priceText}\n納期目安：${deliveryText}\n管理画面：https://macbook-repair-admin.vercel.app`;

  // ① 管理者向け通知（既存ルームID）
  const cwRoom = c.env.CHATWORK_ROOM_ID;
  if (cwToken && cwRoom) {
    const cwMsg = `[info][title]🏪 来店予約が入りました[/title]${reservationInfo}[/info]`;
    await sendChatworkMessage(cwToken, cwRoom, cwMsg);
  }

  // ② 店舗向け通知（各店舗ルームへメンション付き）
  const storeConfig = STORE_CHATWORK_CONFIG[storeKey];
  if (cwToken && storeConfig) {
    const mentions = [storeConfig.managerAccountId, storeConfig.storeAccountId]
      .filter(Boolean)
      .map(id => `[To:${id}]`)
      .join('');
    const storeCwMsg = `${mentions}\n[info][title]🏪 来店予約が入りました[/title]${reservationInfo}[/info]`;
    await sendChatworkMessage(cwToken, storeConfig.roomId, storeCwMsg);
  }

  // Google Calendar event
  try {
    const calendarId = STORE_CALENDAR_IDS[storeKey];
    if (calendarId && c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET && c.env.GOOGLE_REFRESH_TOKEN) {

      const [hh, mm] = time.split(':').map(Number);
      const startDateTime = `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`;
      const endHh = hh + 1;
      const endDateTime = `${date}T${String(endHh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`;

      await createCalendarEvent(c.env, calendarId, {
        title: `【来店予約】${name}様 - リペアマスター${storeName}`,
        startDateTime,
        endDateTime,
        description: `お名前：${name}\n電話番号：${body.phone || '未入力'}\n機種/症状：${body.notes || '未入力'}\n修理費用：${priceText}\n納期目安：${deliveryText}`,
      });
    }
  } catch (err) {
    console.error('Google Calendar event creation error:', err);
  }

  return c.json({ success: true, data: reservation });
});

// ─── Protected routes (require auth) ─────────────────────────

// GET /api/reservations
reservationRoutes.get('/api/reservations', async (c) => {
  const storeKey = c.req.query('storeKey');
  const date = c.req.query('date');
  const status = c.req.query('status');
  const reservations = await listStoreReservations(c.env.DB, { storeKey, date, status });
  return c.json({ success: true, data: reservations });
});

// GET /api/reservations/:id
reservationRoutes.get('/api/reservations/:id', async (c) => {
  const id = c.req.param('id');
  const reservation = await getStoreReservation(c.env.DB, id);
  if (!reservation) return c.json({ success: false, error: 'Not found' }, 404);
  return c.json({ success: true, data: reservation });
});

// PATCH /api/reservations/:id
reservationRoutes.patch('/api/reservations/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string }>();
  if (body.status) {
    await updateReservationStatus(c.env.DB, id, body.status);
  }
  const updated = await getStoreReservation(c.env.DB, id);
  return c.json({ success: true, data: updated });
});

// DELETE /api/reservations/:id
reservationRoutes.delete('/api/reservations/:id', async (c) => {
  const id = c.req.param('id');
  await deleteStoreReservation(c.env.DB, id);
  return c.json({ success: true });
});

// GET /api/store-hours
reservationRoutes.get('/api/store-hours', async (c) => {
  const hours = await getAllStoreHours(c.env.DB);
  return c.json({ success: true, data: hours });
});

// PUT /api/store-hours/:storeKey
reservationRoutes.put('/api/store-hours/:storeKey', async (c) => {
  const storeKey = c.req.param('storeKey');
  const body = await c.req.json<{
    hours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[];
  }>();
  for (const h of body.hours) {
    await upsertStoreHour(c.env.DB, storeKey, h.dayOfWeek, h.openTime, h.closeTime, h.isClosed);
  }
  const updated = await getStoreHours(c.env.DB, storeKey);
  return c.json({ success: true, data: updated });
});

export { reservationRoutes };
