import { Hono } from 'hono';
import {
  getRepairProducts,
  getRepairSymptomsByProduct,
  getRepairPrice,
  createRepairQuote,
  getRepairQuotesByFriend,
} from '@line-crm/db';
import type { Env } from '../index.js';

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
      console.error('GET price error:', err);
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }
  },
);

// POST /api/repair/quotes
repairRoutes.post('/api/repair/quotes', async (c) => {
  try {
    const body = await c.req.json<{
      friendId: string;
      productId?: string;
      symptomId?: string;
      modelName?: string;
      year?: number;
      requestType?: 'mail' | 'store' | 'consult';
    }>();

    if (!body.friendId) {
      return c.json({ success: false, error: 'friendId is required' }, 400);
    }

    const quote = await createRepairQuote(c.env.DB, {
      friendId: body.friendId,
      productId: body.productId ?? null,
      symptomId: body.symptomId ?? null,
      modelName: body.modelName ?? null,
      year: body.year ?? null,
      requestType: body.requestType ?? null,
    });

    return c.json({ success: true, data: quote }, 201);
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
    return c.json({ success: true, data: quotes });
  } catch (err) {
    console.error('GET /api/repair/quotes/:friendId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { repairRoutes };
