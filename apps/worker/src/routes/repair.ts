import { Hono } from 'hono';
import {
  getRepairProducts,
  getRepairSymptomsByProduct,
  getRepairPrice,
  createRepairQuote,
  getRepairQuotesByFriend,
  upsertChatOnMessage,
} from '@line-crm/db';
import type { RepairQuote } from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import { sendChatworkMessage, jstTimestamp } from '../lib/chatwork.js';
import type { Env } from '../index.js';

async function setContactMark(db: D1Database, friendId: string, markId: string): Promise<void> {
  try {
    await db.prepare('UPDATE friends SET contact_mark_id = ? WHERE id = ?').bind(markId, friendId).run();
  } catch (err) {
    console.error('setContactMark error:', err);
  }
}

async function addTagToFriend(db: D1Database, friendId: string, tagName: string): Promise<void> {
  try {
    const tag = await db.prepare('SELECT id FROM tags WHERE name = ?').bind(tagName).first<{ id: string }>();
    if (!tag) return;
    await db.prepare('INSERT OR IGNORE INTO friend_tags (friend_id, tag_id) VALUES (?, ?)').bind(friendId, tag.id).run();
  } catch (err) {
    console.error('addTagToFriend error:', err);
  }
}

function serializeQuote(q: RepairQuote) {
  return {
    id: q.id,
    friendId: q.friend_id,
    productId: q.product_id,
    modelId: q.model_id,
    symptomId: q.symptom_id,
    modelName: q.model_name,
    year: q.year,
    priceFrom: q.price_from,
    priceTo: q.price_to,
    deliveryDaysFrom: q.delivery_days_from,
    deliveryDaysTo: q.delivery_days_to,
    requestType: q.request_type,
    status: q.status,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
  };
}

const repairRoutes = new Hono<Env>();

// GET /api/repair/products
repairRoutes.get('/api/repair/products', async (c) => {
  try {
    const items = await getRepairProducts(c.env.DB);
    return c.json({
      success: true,
      data: items.map((p) => ({
        id: p.id,
        name: p.name,
        sortOrder: p.sort_order,
      })),
    });
  } catch (err) {
    console.error('GET /api/repair/products error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/repair/products/:productId/symptoms
repairRoutes.get('/api/repair/products/:productId/symptoms', async (c) => {
  try {
    const productId = c.req.param('productId');
    const items = await getRepairSymptomsByProduct(c.env.DB, productId);
    return c.json({
      success: true,
      data: items.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sort_order,
      })),
    });
  } catch (err) {
    console.error('GET /api/repair/products/:productId/symptoms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/repair/products/:productId/symptoms/:symptomId/price
repairRoutes.get(
  '/api/repair/products/:productId/symptoms/:symptomId/price',
  async (c) => {
    try {
      const productId = c.req.param('productId');
      const symptomId = c.req.param('symptomId');
      const price = await getRepairPrice(c.env.DB, productId, symptomId);
      if (!price) {
        return c.json({ success: false, error: 'Price not found' }, 404);
      }
      return c.json({
        success: true,
        data: {
          id: price.id,
          priceFrom: price.price_from,
          priceTo: price.price_to,
          deliveryDaysFrom: price.delivery_days_from,
          deliveryDaysTo: price.delivery_days_to,
          notes: price.notes,
        },
      });
    } catch (err) {
      console.error('GET /api/repair/products/:productId/symptoms/:symptomId/price error:', err);
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }
  },
);

// POST /api/repair/quotes
repairRoutes.post('/api/repair/quotes', async (c) => {
  let body: { friendId?: string; productId?: string; symptomId?: string; modelName?: string; year?: number; requestType?: 'mail' | 'store' | 'consult' };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  if (!body.friendId) {
    return c.json({ success: false, error: 'friendId is required' }, 400);
  }

  try {
    const price =
      body.productId && body.symptomId
        ? await getRepairPrice(c.env.DB, body.productId, body.symptomId)
        : null;

    const quote = await createRepairQuote(c.env.DB, {
      friendId: body.friendId,
      productId: body.productId ?? null,
      symptomId: body.symptomId ?? null,
      modelName: body.modelName ?? null,
      year: body.year ?? null,
      requestType: body.requestType ?? null,
      priceFrom: price?.price_from ?? null,
      priceTo: price?.price_to ?? null,
      deliveryDaysFrom: price?.delivery_days_from ?? null,
      deliveryDaysTo: price?.delivery_days_to ?? null,
    });
    return c.json({ success: true, data: serializeQuote(quote) }, 201);
  } catch (err) {
    console.error('POST /api/repair/quotes error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/repair/quotes/:friendId
repairRoutes.get('/api/repair/quotes/:friendId', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const quotes = await getRepairQuotesByFriend(c.env.DB, friendId);
    return c.json({ success: true, data: quotes.map(serializeQuote) });
  } catch (err) {
    console.error('GET /api/repair/quotes/:friendId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/repair/attributes/:friendId
repairRoutes.get('/api/repair/attributes/:friendId', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const rows = await c.env.DB.prepare(
      `SELECT key, value FROM friend_attributes WHERE friend_id = ? ORDER BY key`,
    ).bind(friendId).all<{ key: string; value: string }>();
    const attrs: Record<string, string> = {};
    for (const r of rows.results) attrs[r.key] = r.value;

    // repair_symptom_id から症状名を解決して repair_symptom_name として追加
    if (attrs.repair_symptom_id) {
      const symptom = await c.env.DB.prepare(
        `SELECT name FROM repair_symptoms WHERE id = ?`,
      ).bind(attrs.repair_symptom_id).first<{ name: string }>();
      if (symptom) attrs.repair_symptom_name = symptom.name;
    }

    return c.json({ success: true, data: attrs });
  } catch (err) {
    console.error('GET /api/repair/attributes/:friendId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/repair/mail-orders
repairRoutes.post('/api/repair/mail-orders', async (c) => {
  let body: {
    lineUserId?: string;
    name?: string;
    postalCode?: string;
    address?: string;
    phone?: string;
    packagingKit?: boolean;
    deliveryStore?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const { lineUserId, name, postalCode, address, phone, packagingKit, deliveryStore } = body;
  if (!lineUserId || !name || !postalCode || !address || !phone || !deliveryStore) {
    return c.json({ success: false, error: 'Missing required fields' }, 400);
  }

  try {
    // line_user_id から friend を特定
    const friend = await c.env.DB
      .prepare(`SELECT id FROM friends WHERE line_user_id = ? LIMIT 1`)
      .bind(lineUserId)
      .first<{ id: string }>();
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString().replace('T', 'T').slice(0, 23);
    await c.env.DB
      .prepare(
        `INSERT INTO mail_orders (id, friend_id, name, postal_code, address, phone, packaging_kit, delivery_store, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .bind(id, friend.id, name, postalCode, address, phone, packagingKit ? 1 : 0, deliveryStore, now, now)
      .run();

    // フォーム内容をチャットに表示（incoming メッセージとして記録）
    const formContent = `【郵送修理フォーム送信】\n━━━━━━━━━━\nお名前：${name}\n郵便番号：${postalCode}\nご住所：${address}\n電話番号：${phone}\n梱包キット：${packagingKit ? 'あり（無料）' : 'なし'}\n配送先：${deliveryStore}\n━━━━━━━━━━`;
    await c.env.DB
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, is_read, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, 0, ?)`,
      )
      .bind(crypto.randomUUID(), friend.id, formContent, now)
      .run();

    // チャット一覧に表示されるよう chats エントリを更新
    await upsertChatOnMessage(c.env.DB, friend.id);

    // フォーム送信完了マーク: 梱包キット希望→mark_27、それ以外→mark_03
    await setContactMark(c.env.DB, friend.id, packagingKit ? 'mark_27' : 'mark_03');

    // 自動タグ付与
    await addTagToFriend(c.env.DB, friend.id, packagingKit ? '梱包キット希望する' : '梱包キット希望しない');
    if (deliveryStore.includes('菖蒲')) {
      await addTagToFriend(c.env.DB, friend.id, '郵送（菖蒲）');
    } else if (deliveryStore.includes('盛岡')) {
      await addTagToFriend(c.env.DB, friend.id, '郵送（盛岡）');
    } else if (deliveryStore.includes('岐阜')) {
      await addTagToFriend(c.env.DB, friend.id, '郵送（岐阜）');
    } else if (deliveryStore.includes('大分')) {
      await addTagToFriend(c.env.DB, friend.id, '郵送（大分）');
    }

    // フォーム入力名で display_name を更新
    await c.env.DB
      .prepare(`UPDATE friends SET display_name = ?, updated_at = ? WHERE id = ?`)
      .bind(name, now, friend.id)
      .run();

    // LINEでお礼メッセージを送信
    const kitLabel = packagingKit ? 'あり（無料）' : 'なし';
    const storeInfo = deliveryStore.includes('盛岡')
      ? `リペアマスター盛岡店\n〒020-0034\n岩手県盛岡市盛岡駅前通1-44\n盛岡フェザン 本館1階\nTEL: 019-613-8665`
      : deliveryStore.includes('岐阜')
      ? `リペアマスターモレラ岐阜店\n〒501-0497\n岐阜県本巣市三橋1100\nモレラ岐阜店 2F\nTEL: 070-3131-6181`
      : deliveryStore.includes('大分')
      ? `リペアマスター大分店\n〒870-1155\n大分県大分市玉沢楠本755-1\nトキハわさだタウン3街区 1F\nTEL: 070-1261-6924`
      : `リペアマスター菖蒲店\n〒346-0106\n埼玉県久喜市菖蒲町菖蒲6005-1\nモラージュ菖蒲 1F\nTEL: 070-1271-7186`;
    const closingMsg = packagingKit
      ? `梱包キットを発送いたします📦\n今しばらくお待ちください。\n梱包キットが到着されましたら上記の郵送先へご発送お願いします。`
      : `端末の発送をお待ちしております📦\n着払いにてご発送ください。`;
    const thankMsg = `郵送修理のご依頼ありがとうございます！\n\n以下の内容で承りました。\n━━━━━━━━━━\nお名前：${name}様\n郵便番号：${postalCode}\nご住所：${address}\n電話番号：${phone}\n梱包キット：${kitLabel}\n配送先：${deliveryStore}\n━━━━━━━━━━\n\n【郵送先】\n${storeInfo}\n━━━━━━━━━━\n\n${closingMsg}`;
    try {
      const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
      await lineClient.pushMessage(lineUserId, [{ type: 'text', text: thankMsg }]);
    } catch (pushErr) {
      console.error('mail-order push message error:', pushErr);
    }

    // Chatwork通知: 梱包キット希望の場合（awaitで確実に送信）
    if (packagingKit) {
      const cwToken = c.env.CHATWORK_API_TOKEN;
      const cwRoom = c.env.CHATWORK_ROOM_ID;
      if (cwToken && cwRoom) {
        const cwMsg = `[info][title]📦 梱包キット希望の郵送依頼が届きました[/title]ユーザー：${name}様\n郵便番号：${postalCode}\n住所：${address}\n電話番号：${phone}\n配送先：${deliveryStore}\n\n【郵送先】\n${storeInfo}\n時刻：${jstTimestamp()}\n管理画面：https://macbook-repair-admin.vercel.app[/info]`;
        await sendChatworkMessage(cwToken, cwRoom, cwMsg);
      }
    }

    return c.json({ success: true, data: { id } }, 201);
  } catch (err) {
    console.error('POST /api/repair/mail-orders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/repair/mail-orders/:friendId
repairRoutes.get('/api/repair/mail-orders/:friendId', async (c) => {
  const friendId = c.req.param('friendId');
  try {
    const row = await c.env.DB
      .prepare(
        `SELECT id, friend_id, name, postal_code, address, phone, packaging_kit, delivery_store, status, created_at
         FROM mail_orders WHERE friend_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(friendId)
      .first<{
        id: string;
        friend_id: string;
        name: string;
        postal_code: string;
        address: string;
        phone: string;
        packaging_kit: number;
        delivery_store: string;
        status: string;
        created_at: string;
      }>();

    if (!row) {
      return c.json({ success: true, data: null });
    }

    return c.json({
      success: true,
      data: {
        id: row.id,
        friendId: row.friend_id,
        name: row.name,
        postalCode: row.postal_code,
        address: row.address,
        phone: row.phone,
        packagingKit: row.packaging_kit === 1,
        deliveryStore: row.delivery_store,
        status: row.status,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error('GET /api/repair/mail-orders/:friendId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/repair/attributes/:friendId — admin edit repair info
repairRoutes.patch('/api/repair/attributes/:friendId', async (c) => {
  const friendId = c.req.param('friendId');
  let body: Record<string, string | null>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const db = c.env.DB;
  const now = new Date().toISOString().slice(0, 23);

  // Attribute keys stored in friend_attributes
  const attrKeys = ['repair_product_name', 'repair_model_name', 'repair_symptom_name', 'repair_year', 'repair_inch_size', 'repair_store'] as const;

  try {
    // Update friend_attributes
    for (const key of attrKeys) {
      if (key in body) {
        const val = body[key];
        if (val === null || val === '') {
          await db.prepare(`DELETE FROM friend_attributes WHERE friend_id = ? AND key = ?`).bind(friendId, key).run();
        } else {
          await db.prepare(
            `INSERT INTO friend_attributes (id, friend_id, key, value, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (friend_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          ).bind(crypto.randomUUID(), friendId, key, val, now).run();
        }
      }
    }

    // Update latest repair_quote if quote-related fields provided
    const quoteFields = ['priceFrom', 'priceTo', 'deliveryDaysFrom', 'deliveryDaysTo', 'requestType', 'status'];
    const quoteUpdates = quoteFields.filter(f => f in body);
    if (quoteUpdates.length > 0) {
      const latestQuote = await db.prepare(
        `SELECT id FROM repair_quotes WHERE friend_id = ? ORDER BY created_at DESC LIMIT 1`,
      ).bind(friendId).first<{ id: string }>();

      if (latestQuote) {
        const colMap: Record<string, string> = {
          priceFrom: 'price_from', priceTo: 'price_to',
          deliveryDaysFrom: 'delivery_days_from', deliveryDaysTo: 'delivery_days_to',
          requestType: 'request_type', status: 'status',
        };
        const setClauses = quoteUpdates.map(f => `${colMap[f]} = ?`).join(', ');
        const values = quoteUpdates.map(f => body[f] === '' ? null : body[f]);
        await db.prepare(
          `UPDATE repair_quotes SET ${setClauses}, updated_at = ? WHERE id = ?`,
        ).bind(...values, now, latestQuote.id).run();
      }
    }

    return c.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/repair/attributes/:friendId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { repairRoutes };
