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
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import { sendChatworkMessage, jstTimestamp } from '../lib/chatwork.js';
import type { Env } from '../index.js';

const reservationRoutes = new Hono<Env>();

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
    .prepare('SELECT key, value FROM friend_attributes WHERE friend_id = ? AND key IN (?, ?, ?, ?, ?)')
    .bind(friend.id, 'repair_store', 'repair_model_name', 'repair_symptom_id', 'repair_product_name', 'repair_year')
    .all<{ key: string; value: string }>();

  const attrs: Record<string, string> = {};
  for (const row of attrRows.results) attrs[row.key] = row.value;

  return c.json({
    success: true,
    data: {
      name: friend.display_name ?? '',
      storeKey: attrs['repair_store'] ? Object.entries(STORE_NAMES).find(([, v]) => v === attrs['repair_store'])?.[0] ?? '' : '',
      modelName: attrs['repair_model_name'] ?? '',
      productName: attrs['repair_product_name'] ?? '',
      year: attrs['repair_year'] ?? '',
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

  // Set mark_04 on friend
  if (friend?.id) {
    await c.env.DB
      .prepare('UPDATE friends SET contact_mark_id = ? WHERE id = ?')
      .bind('mark_04', friend.id)
      .run();
  }

  const storeName = STORE_NAMES[storeKey] ?? storeKey;
  const [y, mo, d] = date.split('-');
  const dateDisplay = `${y}年${Number(mo)}月${Number(d)}日`;
  const dateObj = new Date(date + 'T00:00:00+09:00');
  const dayName = DAY_NAMES[dateObj.getDay()];

  // LINE confirmation message
  try {
    const lineToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (lineToken) {
      const lineClient = new LineClient(lineToken);
      const confirmText = `✅ 来店予約が完了しました！\n\n📍 店舗：リペアマスター${storeName}\n📅 日時：${dateDisplay}（${dayName}）${time}〜\n👤 お名前：${name} 様${body.phone ? `\n📞 電話番号：${body.phone}` : ''}${body.notes ? `\n📝 ご要望：${body.notes}` : ''}\n\nご来店をお待ちしております！\n※ご不明な点がございましたらLINEにてお問い合わせください。`;
      await lineClient.pushMessage(lineUserId, [{ type: 'text', text: confirmText }]);
    }
  } catch (err) {
    console.error('LINE confirmation send error:', err);
  }

  // Chatwork notification
  const cwToken = c.env.CHATWORK_API_TOKEN;
  const cwRoom = c.env.CHATWORK_ROOM_ID;
  if (cwToken && cwRoom) {
    const cwMsg = `[info][title]📅 来店予約が入りました[/title]お名前：${name} 様\n店舗：リペアマスター${storeName}\n日時：${dateDisplay}（${dayName}）${time}〜${body.phone ? `\n電話番号：${body.phone}` : ''}${body.notes ? `\nご要望：${body.notes}` : ''}\n時刻：${jstTimestamp()}\n管理画面：https://macbook-repair-admin.vercel.app/reservations[/info]`;
    sendChatworkMessage(cwToken, cwRoom, cwMsg).catch(() => {});
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
