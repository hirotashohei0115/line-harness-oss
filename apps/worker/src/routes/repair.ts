import { Hono } from 'hono';
import {
  getRepairProducts,
  getRepairSymptomsByProduct,
  getRepairPrice,
  createRepairQuote,
  getRepairQuotesByFriend,
} from '@line-crm/db';
import type { RepairQuote } from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import type { Env } from '../index.js';

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

    // LINEでお礼メッセージを送信
    const kitLabel = packagingKit ? 'あり(+1,000円)' : 'なし';
    const storeInfo = deliveryStore === '盛岡店'
      ? `リペアマスター盛岡店\n〒020-0034\n岩手県盛岡市盛岡駅前通1-44\n盛岡フェザン 本館1階\nTEL: 019-613-8665`
      : `リペアマスター菖蒲店\n〒346-0106\n埼玉県久喜市菖蒲町菖蒲6005-1\nモラージュ菖蒲 1F\nTEL: 070-1271-7186`;
    const thankMsg = `郵送修理のご依頼ありがとうございます！\n\n以下の内容で承りました。\n━━━━━━━━━━\nお名前：${name}様\n郵便番号：${postalCode}\nご住所：${address}\n電話番号：${phone}\n梱包キット：${kitLabel}\n配送先：${deliveryStore}\n━━━━━━━━━━\n\n【郵送先】\n${storeInfo}\n━━━━━━━━━━\n\n端末の発送をお待ちしております📦\n着払いにてご発送ください。`;
    try {
      const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
      await lineClient.pushMessage(lineUserId, [{ type: 'text', text: thankMsg }]);
    } catch (pushErr) {
      console.error('mail-order push message error:', pushErr);
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

export { repairRoutes };
