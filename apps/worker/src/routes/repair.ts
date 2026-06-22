import { Hono } from 'hono';
import {
  getRepairProducts,
  getRepairSymptomsByProduct,
  getRepairPrice,
  createRepairQuote,
  getRepairQuotesByFriend,
  upsertChatOnMessage,
  setFriendAttribute,
  jstNow,
  getActiveNotificationRulesByEvent,
  createNotification,
  updateNotificationStatus,
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

async function setContactMarkByName(db: D1Database, friendId: string, markName: string): Promise<void> {
  try {
    const mark = await db.prepare('SELECT id FROM contact_marks WHERE name = ? LIMIT 1').bind(markName).first<{ id: string }>();
    if (!mark) return;
    await db.prepare('UPDATE friends SET contact_mark_id = ? WHERE id = ?').bind(mark.id, friendId).run();
  } catch (err) {
    console.error('setContactMarkByName error:', err);
  }
}

async function addTagToFriend(db: D1Database, friendId: string, tagName: string): Promise<void> {
  try {
    let tag = await db.prepare('SELECT id FROM tags WHERE name = ?').bind(tagName).first<{ id: string }>();
    if (!tag) {
      const newId = crypto.randomUUID();
      await db.prepare('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)').bind(newId, tagName).run();
      tag = await db.prepare('SELECT id FROM tags WHERE name = ?').bind(tagName).first<{ id: string }>();
    }
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

    // フォーム内容をチャットに表示（incoming メッセージとして記録、JSTタイムスタンプ使用）
    const formContent = `【郵送修理フォーム送信】\n━━━━━━━━━━\nお名前：${name}\n郵便番号：${postalCode}\nご住所：${address}\n電話番号：${phone}\n梱包キット：${packagingKit ? 'あり（無料）' : 'なし'}\n配送先：${deliveryStore}\n━━━━━━━━━━`;
    await c.env.DB
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, is_read, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, 0, ?)`,
      )
      .bind(crypto.randomUUID(), friend.id, formContent, jstNow())
      .run();

    // チャット一覧に表示されるよう chats エントリを更新
    await upsertChatOnMessage(c.env.DB, friend.id);

    // フォーム送信完了マーク: 梱包キット希望→mark_27、それ以外→発送待ち
    if (packagingKit) {
      await setContactMark(c.env.DB, friend.id, 'mark_27');
    } else {
      await setContactMarkByName(c.env.DB, friend.id, '発送待ち');
    }

    // repair_quotesの希望店舗を更新（チャット画面「修理情報」に反映）
    const storeShortName = deliveryStore.includes('菖蒲') ? '菖蒲店'
      : deliveryStore.includes('盛岡') ? '盛岡店'
      : deliveryStore.includes('岐阜') ? '岐阜店'
      : deliveryStore.includes('大分') ? '大分店'
      : null;
    if (storeShortName) {
      await c.env.DB
        .prepare(`UPDATE repair_quotes SET store = ? WHERE id = (SELECT id FROM repair_quotes WHERE friend_id = ? ORDER BY created_at DESC LIMIT 1)`)
        .bind(storeShortName, friend.id)
        .run();
      await c.env.DB
        .prepare(`UPDATE friend_attributes SET value = ?, updated_at = ? WHERE friend_id = ? AND key = 'repair_store'`)
        .bind(storeShortName, jstNow(), friend.id)
        .run();
    }

    // 自動タグ付与（排他制御）
    await removeTagsByNames(c.env.DB, friend.id, [packagingKit ? '梱包キット希望しない' : '梱包キット希望する']);
    await addTagToFriend(c.env.DB, friend.id, packagingKit ? '梱包キット希望する' : '梱包キット希望しない');
    await removeTagsByNames(c.env.DB, friend.id, ['タグなし']);
    const ALL_POSTAL_TAGS = ['郵送依頼', '郵送（盛岡）', '郵送（菖蒲）', '郵送（岐阜）', '郵送（大分）', '店舗持込'];
    if (deliveryStore.includes('菖蒲')) {
      await removeTagsByNames(c.env.DB, friend.id, ALL_POSTAL_TAGS.filter(t => t !== '郵送依頼' && t !== '郵送（菖蒲）'));
      await addTagToFriend(c.env.DB, friend.id, '郵送依頼');
      await addTagToFriend(c.env.DB, friend.id, '郵送（菖蒲）');
    } else if (deliveryStore.includes('盛岡')) {
      await removeTagsByNames(c.env.DB, friend.id, ALL_POSTAL_TAGS.filter(t => t !== '郵送依頼' && t !== '郵送（盛岡）'));
      await addTagToFriend(c.env.DB, friend.id, '郵送依頼');
      await addTagToFriend(c.env.DB, friend.id, '郵送（盛岡）');
    } else if (deliveryStore.includes('岐阜')) {
      await removeTagsByNames(c.env.DB, friend.id, ALL_POSTAL_TAGS.filter(t => t !== '郵送依頼' && t !== '郵送（岐阜）'));
      await addTagToFriend(c.env.DB, friend.id, '郵送依頼');
      await addTagToFriend(c.env.DB, friend.id, '郵送（岐阜）');
    } else if (deliveryStore.includes('大分')) {
      await removeTagsByNames(c.env.DB, friend.id, ALL_POSTAL_TAGS.filter(t => t !== '郵送依頼' && t !== '郵送（大分）'));
      await addTagToFriend(c.env.DB, friend.id, '郵送依頼');
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
      : `端末の発送をお待ちしております📦\n着払いにてご発送ください。\n発送が完了致しましたら、発送完了ボタンをタッチお願いします。`;
    const thankMsg = `郵送修理のご依頼ありがとうございます！\n\n以下の内容で承りました。\n━━━━━━━━━━\nお名前：${name}様\n郵便番号：${postalCode}\nご住所：${address}\n電話番号：${phone}\n梱包キット：${kitLabel}\n配送先：${deliveryStore}\n━━━━━━━━━━\n\n【郵送先】\n${storeInfo}\n━━━━━━━━━━\n\n${closingMsg}`;
    const shippedButtonFlex = JSON.stringify({
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [{
          type: 'button',
          action: { type: 'postback', label: '発送完了', data: 'action=mail_shipped', displayText: '発送完了' },
          style: 'primary', color: '#06C755', height: 'md',
        }],
      },
    });
    try {
      const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
      const messages: object[] = [{ type: 'text', text: thankMsg }];
      if (!packagingKit) {
        messages.push({ type: 'flex', altText: '発送完了ボタン', contents: JSON.parse(shippedButtonFlex) });
      }
      await lineClient.pushMessage(lineUserId, messages);
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

    // tag_added 通知ルール: 梱包キットタグ付与時
    const kitTagName = packagingKit ? '梱包キット希望する' : '梱包キット希望しない';
    try {
      const notifRules = await getActiveNotificationRulesByEvent(c.env.DB, 'tag_added');
      for (const rule of notifRules) {
        const channels: string[] = JSON.parse(rule.channels);
        const conditions = JSON.parse(rule.conditions) as Record<string, unknown>;
        if (conditions.tagName && conditions.tagName !== kitTagName) continue;
        if (channels.includes('chatwork')) {
          const apiToken = (conditions.chatworkApiToken as string | undefined) || c.env.CHATWORK_API_TOKEN;
          const roomId = (conditions.chatworkRoomId as string | undefined) || c.env.CHATWORK_ROOM_ID;
          if (!apiToken || !roomId) continue;
          const toPrefix = conditions.chatworkToId
            ? (conditions.chatworkToId as string).split(',').map((id) => `[To:${id.trim()}]`).join('') + '\n'
            : '';
          const msgBody = `${toPrefix}[info][title]${rule.name}[/title]タグ付与：${kitTagName}\nユーザー：${name}様\n電話番号：${phone}\n配送先：${deliveryStore}\n時刻：${jstTimestamp()}\n管理画面：https://macbook-repair-admin.vercel.app[/info]`;
          const notifRecord = await createNotification(c.env.DB, {
            ruleId: rule.id, eventType: 'tag_added', title: rule.name, body: msgBody, channel: 'chatwork',
          });
          try {
            await sendChatworkMessage(apiToken, roomId, msgBody);
            await updateNotificationStatus(c.env.DB, notifRecord.id, 'sent');
          } catch {
            await updateNotificationStatus(c.env.DB, notifRecord.id, 'failed');
          }
        }
      }
    } catch (err) {
      console.error('tag_added notification (mail-orders) error:', err);
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

// POST /api/repair/visit-orders
repairRoutes.post('/api/repair/visit-orders', async (c) => {
  let body: {
    lineUserId?: string;
    name?: string;
    furigana?: string;
    phone?: string;
    address?: string;
    customerType?: string;
    preferredDatetime1?: string;
    preferredDatetime2?: string;
    preferredDatetime3?: string;
    visitReason?: string;
    detail?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const { lineUserId, name, furigana, phone, address, customerType, preferredDatetime1, preferredDatetime2, preferredDatetime3, visitReason, detail } = body;
  if (!lineUserId || !name || !furigana || !phone || !address || !preferredDatetime1) {
    return c.json({ success: false, error: 'Missing required fields' }, 400);
  }

  try {
    const friend = await c.env.DB
      .prepare(`SELECT id FROM friends WHERE line_user_id = ? LIMIT 1`)
      .bind(lineUserId)
      .first<{ id: string }>();
    if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);

    const id = crypto.randomUUID();
    await c.env.DB
      .prepare(
        `INSERT INTO visit_orders (id, friend_id, name, furigana, phone, address, customer_type, preferred_datetime1, preferred_datetime2, preferred_datetime3, visit_reason, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, friend.id, name, furigana, phone, address, customerType ?? 'individual', preferredDatetime1, preferredDatetime2 ?? null, preferredDatetime3 ?? null, visitReason ?? null, detail ?? null)
      .run();

    // フォーム内容をチャットに表示
    const customerTypeLabel = customerType === 'corporate' ? '法人' : '個人';
    const formContent = `【訪問修理フォーム送信】\n━━━━━━━━━━\nお名前：${name}（${furigana}）\n${customerTypeLabel}\n電話番号：${phone}\n住所：${address}\n第1希望：${preferredDatetime1}${preferredDatetime2 ? `\n第2希望：${preferredDatetime2}` : ''}${preferredDatetime3 ? `\n第3希望：${preferredDatetime3}` : ''}${visitReason ? `\n訪問理由：${visitReason}` : ''}${detail ? `\n依頼内容：${detail}` : ''}\n━━━━━━━━━━`;
    await c.env.DB
      .prepare(`INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, is_read, created_at) VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, 0, ?)`)
      .bind(crypto.randomUUID(), friend.id, formContent, jstNow())
      .run();
    await upsertChatOnMessage(c.env.DB, friend.id);

    // タグ付与
    await removeTagsByNames(c.env.DB, friend.id, ['郵送依頼', '店舗持込', 'タグなし']);
    await addTagToFriend(c.env.DB, friend.id, '訪問修理');
    await addTagToFriend(c.env.DB, friend.id, '訪問修理フォーム回答済み');

    // LINE自動返信
    try {
      const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
      await lineClient.pushMessage(lineUserId, [{
        type: 'text',
        text: '訪問修理のご依頼ありがとうございます！\n\n訪問可能かお調べしますので、しばらくお待ちください。\n確認でき次第、ご連絡いたします📱',
      }]);
    } catch (pushErr) {
      console.error('visit-order push message error:', pushErr);
    }

    // Chatwork通知
    try {
      const cwToken = c.env.CHATWORK_API_TOKEN;
      if (cwToken) {
        const cwMsg = `[info][title]🚗 訪問修理依頼が入りました[/title]お名前：${name}（${furigana}）\n電話番号：${phone}\n住所：${address}\n個人/法人：${customerTypeLabel}\n第1希望：${preferredDatetime1}\n第2希望：${preferredDatetime2 ?? 'なし'}\n第3希望：${preferredDatetime3 ?? 'なし'}\n訪問希望理由：${visitReason ?? 'なし'}\n依頼内容：${detail ?? 'なし'}\n時刻：${jstTimestamp()}\n管理画面：https://macbook-repair-admin.vercel.app[/info]`;
        await sendChatworkMessage(cwToken, '436188150', cwMsg);
      }
    } catch (cwErr) {
      console.error('visit-order chatwork error:', cwErr);
    }

    return c.json({ success: true, data: { id } }, 201);
  } catch (err) {
    console.error('POST /api/repair/visit-orders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/repair/model-prices — admin: list all model prices
repairRoutes.get('/api/repair/model-prices', async (c) => {
  try {
    const rows = await c.env.DB.prepare(
      `SELECT id, model_number, product_type, year, inch_size, symptom, price, delivery_days
       FROM repair_model_prices
       ORDER BY product_type, year, inch_size, symptom`,
    ).all<{
      id: string;
      model_number: string;
      product_type: string;
      year: number;
      inch_size: number;
      symptom: string;
      price: number | null;
      delivery_days: string | null;
    }>();
    return c.json({ success: true, data: rows.results });
  } catch (err) {
    console.error('GET /api/repair/model-prices error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/repair/model-prices/:id — admin: update price and delivery_days
repairRoutes.put('/api/repair/model-prices/:id', async (c) => {
  const id = c.req.param('id');
  let body: { price?: number | null; deliveryDays?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  try {
    const now = new Date().toISOString().slice(0, 23);
    await c.env.DB.prepare(
      `UPDATE repair_model_prices SET price = ?, delivery_days = ?, updated_at = ? WHERE id = ?`,
    ).bind(body.price ?? null, body.deliveryDays ?? null, now, id).run();
    return c.json({ success: true });
  } catch (err) {
    console.error('PUT /api/repair/model-prices/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/contact-form — お問い合わせフォーム送信（フォローイベント新フロー用）
repairRoutes.post('/api/contact-form', async (c) => {
  let body: { lineUserId?: string; name?: string; phone?: string; model?: string; symptom?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const { lineUserId, name, phone, model, symptom } = body;
  if (!lineUserId || !name || !phone || !model || !symptom) {
    return c.json({ success: false, error: 'Missing required fields' }, 400);
  }

  try {
    // 友だち情報とLINEアカウントのトークンを取得
    const row = await c.env.DB
      .prepare(
        `SELECT f.id, f.line_account_id, la.channel_access_token
         FROM friends f
         LEFT JOIN line_accounts la ON la.id = f.line_account_id
         WHERE f.line_user_id = ? LIMIT 1`,
      )
      .bind(lineUserId)
      .first<{ id: string; line_account_id: string | null; channel_access_token: string | null }>();

    const accessToken = row?.channel_access_token || c.env.LINE_CHANNEL_ACCESS_TOKEN;
    const lineClient = new LineClient(accessToken);

    const replyText = `【ご相談内容のご確認】\n\nお名前：${name}様\n電話番号：${phone}\n機種：${model}\n症状：${symptom}\n\n担当者より直接お電話させていただきます。\n今しばらくお待ちください🙏\n\n受付時間：10:00〜20:00`;
    await lineClient.pushMessage(lineUserId, [{ type: 'text', text: replyText }]);

    if (row?.id) {
      // 受信メッセージとしてチャットに記録
      const formContent = `【お問い合わせフォーム送信】\n━━━━━━━━━━\nお名前：${name}\n電話番号：${phone}\n機種：${model}\n症状：${symptom}\n━━━━━━━━━━`;
      await c.env.DB
        .prepare(
          `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, is_read, created_at)
           VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, 0, ?)`,
        )
        .bind(crypto.randomUUID(), row.id, formContent, jstNow())
        .run();

      // 送信メッセージもログに記録
      await c.env.DB
        .prepare(
          `INSERT INTO messages_log (id, friend_id, direction, message_type, content, delivery_type, created_at)
           VALUES (?, ?, 'outgoing', 'text', ?, 'push', ?)`,
        )
        .bind(crypto.randomUUID(), row.id, replyText, jstNow())
        .run();

      await upsertChatOnMessage(c.env.DB, row.id);
      await addTagToFriend(c.env.DB, row.id, '見積り依頼あり');
      await removeTagsByNames(c.env.DB, row.id, ['タグなし']);
      await setContactMark(c.env.DB, row.id, 'mark_29');

      // 表示名をフォーム入力の名前で更新
      await c.env.DB
        .prepare('UPDATE friends SET display_name = ?, updated_at = ? WHERE id = ?')
        .bind(name, jstNow(), row.id)
        .run();

      // 電話番号を属性として保存
      await setFriendAttribute(c.env.DB, row.id, 'phone', phone);

      // 修理情報パネル用の属性をセット
      const productName = model.startsWith('MacBook Air') ? 'MacBook Air'
        : model.startsWith('MacBook Pro') ? 'MacBook Pro'
        : 'その他';
      const modelRest = model.startsWith('MacBook Air')
        ? model.slice('MacBook Air'.length).trim()
        : model.startsWith('MacBook Pro')
          ? model.slice('MacBook Pro'.length).trim()
          : '';
      await setFriendAttribute(c.env.DB, row.id, 'repair_product_name', productName);
      await setFriendAttribute(c.env.DB, row.id, 'repair_symptom_name', symptom);
      if (modelRest) {
        await setFriendAttribute(c.env.DB, row.id, 'repair_model_name', modelRest);
      }

      // 修理情報（repair_quote）を作成
      const productId = productName === 'MacBook Air'
        ? 'prod-air-0001-0000-0000-000000000001'
        : productName === 'MacBook Pro'
          ? 'prod-pro-0001-0000-0000-000000000002'
          : 'prod-oth-0001-0000-0000-000000000003';
      const symptomRow = await c.env.DB
        .prepare('SELECT id FROM repair_symptoms WHERE name = ? LIMIT 1')
        .bind(symptom)
        .first<{ id: string }>();
      await createRepairQuote(c.env.DB, {
        friendId: row.id,
        productId,
        symptomId: symptomRow?.id ?? null,
        modelName: modelRest || model,
        requestType: 'consult',
      });
    }

    // Chatwork通知: contact_form_submitted イベントのアクティブルールを検索
    try {
      const notifRules = await getActiveNotificationRulesByEvent(c.env.DB, 'contact_form_submitted');
      for (const rule of notifRules) {
        const channels: string[] = JSON.parse(rule.channels);
        if (!channels.includes('chatwork')) continue;

        const conditions = JSON.parse(rule.conditions) as Record<string, unknown>;
        const apiToken = (conditions.chatworkApiToken as string | undefined) || c.env.CHATWORK_API_TOKEN;
        const roomId = (conditions.chatworkRoomId as string | undefined) || c.env.CHATWORK_ROOM_ID;
        if (!apiToken || !roomId) continue;

        const msgTitle = rule.name;
        const toPrefix = conditions.chatworkToId
          ? (conditions.chatworkToId as string).split(',').map(id => `[To:${id.trim()}]`).join('') + '\n'
          : '';
        const msgBody = `${toPrefix}[info][title]${msgTitle}[/title]お名前：${name}\n電話番号：${phone}\n機種：${model}\n症状：${symptom}[/info]`;

        const notifRecord = await createNotification(c.env.DB, {
          ruleId: rule.id,
          eventType: 'contact_form_submitted',
          title: msgTitle,
          body: msgBody,
          channel: 'chatwork',
        });

        try {
          await sendChatworkMessage(apiToken, roomId, msgBody);
          await updateNotificationStatus(c.env.DB, notifRecord.id, 'sent');
        } catch {
          await updateNotificationStatus(c.env.DB, notifRecord.id, 'failed');
        }
      }
    } catch (err) {
      console.error('notification dispatch error:', err);
    }

    return c.json({ success: true });
  } catch (err) {
    console.error('POST /api/contact-form error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/repair/order/:friendId — 受注情報保存 + 店舗通知
repairRoutes.post('/api/repair/order/:friendId', async (c) => {
  const friendId = c.req.param('friendId');
  let body: { orderType?: string; orderStore?: string; orderAmount?: string; orderDueDate?: string; orderVisitDate?: string; orderNotes?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const { orderType = '', orderStore = '', orderAmount = '', orderDueDate = '', orderVisitDate = '', orderNotes = '' } = body;

  try {
    await setFriendAttribute(c.env.DB, friendId, 'call_result', '受注');
    await setFriendAttribute(c.env.DB, friendId, 'order_type', orderType);
    await setFriendAttribute(c.env.DB, friendId, 'order_store', orderStore);
    await setFriendAttribute(c.env.DB, friendId, 'order_amount', orderAmount);
    await setFriendAttribute(c.env.DB, friendId, 'order_due_date', orderDueDate);
    await setFriendAttribute(c.env.DB, friendId, 'order_visit_date', orderVisitDate);
    await setFriendAttribute(c.env.DB, friendId, 'order_notes', orderNotes);

    // 友だち情報・修理情報を取得して通知メッセージを組み立て
    const friend = await c.env.DB
      .prepare('SELECT display_name FROM friends WHERE id = ? LIMIT 1')
      .bind(friendId)
      .first<{ display_name: string }>();

    const attrs = await c.env.DB
      .prepare(`SELECT key, value FROM friend_attributes WHERE friend_id = ? AND key IN ('phone','repair_product_name','repair_model_name','repair_symptom_name','repair_store')`)
      .bind(friendId)
      .all<{ key: string; value: string }>();
    const a: Record<string, string> = {};
    for (const row of attrs.results) a[row.key] = row.value;

    const name = friend?.display_name ?? '不明';
    const lines = [
      `お名前：${name}`,
      a.phone ? `電話番号：${a.phone}` : null,
      a.repair_product_name ? `機種：${a.repair_product_name}${a.repair_model_name ? ' ' + a.repair_model_name : ''}` : null,
      a.repair_symptom_name ? `症状：${a.repair_symptom_name}` : null,
      `修理方法：${orderType}`,
      orderStore ? `店舗：${orderStore}` : (a.repair_store ? `店舗：${a.repair_store}` : null),
      orderVisitDate ? `来店予定日：${orderVisitDate}` : null,
      orderAmount ? `見積金額：${orderAmount}円` : null,
      orderDueDate ? `納期：${orderDueDate}` : null,
      orderNotes ? `備考：${orderNotes}` : null,
    ].filter(Boolean).join('\n');

    // notification_rules の order_received ルールで通知
    try {
      const notifRules = await getActiveNotificationRulesByEvent(c.env.DB, 'order_received');
      for (const rule of notifRules) {
        const channels: string[] = JSON.parse(rule.channels);
        if (!channels.includes('chatwork')) continue;
        const conditions = JSON.parse(rule.conditions) as Record<string, unknown>;
        // 対象店舗が設定されている場合、選択された店舗と一致するルールのみ通知
        if (conditions.store && conditions.store !== orderStore) continue;
        const apiToken = (conditions.chatworkApiToken as string | undefined) || c.env.CHATWORK_API_TOKEN;
        const roomId = (conditions.chatworkRoomId as string | undefined) || c.env.CHATWORK_ROOM_ID;
        if (!apiToken || !roomId) continue;
        const toPrefix = conditions.chatworkToId
          ? (conditions.chatworkToId as string).split(',').map(id => `[To:${id.trim()}]`).join('') + '\n'
          : '';
        const msgBody = `${toPrefix}[info][title]${rule.name}[/title]${lines}[/info]`;
        const notifRecord = await createNotification(c.env.DB, {
          ruleId: rule.id, eventType: 'order_received', title: rule.name, body: msgBody, channel: 'chatwork',
        });
        try {
          await sendChatworkMessage(apiToken, roomId, msgBody);
          await updateNotificationStatus(c.env.DB, notifRecord.id, 'sent');
        } catch {
          await updateNotificationStatus(c.env.DB, notifRecord.id, 'failed');
        }
      }
    } catch (err) {
      console.error('order_received notification error:', err);
    }

    return c.json({ success: true });
  } catch (err) {
    console.error('POST /api/repair/order/:friendId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { repairRoutes };
