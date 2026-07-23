import { Hono } from 'hono';
import type { Env } from '../index.js';

interface SwitchRepairPrice {
  id: string;
  category: 'main' | 'controller';
  model: string;
  symptom: string;
  price_min: number | null;
  price_max: number | null;
  is_consultation: number;
  is_not_applicable: number;
  note: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const switchRepair = new Hono<Env>();

// GET /api/switch-repair/prices
switchRepair.get('/api/switch-repair/prices', async (c) => {
  try {
    const category = c.req.query('category') ?? undefined;
    let result: { results: SwitchRepairPrice[] };
    if (category) {
      result = await c.env.DB
        .prepare('SELECT * FROM switch_repair_prices WHERE category = ? ORDER BY sort_order ASC, model ASC')
        .bind(category)
        .all<SwitchRepairPrice>();
    } else {
      result = await c.env.DB
        .prepare('SELECT * FROM switch_repair_prices ORDER BY category ASC, sort_order ASC, model ASC')
        .all<SwitchRepairPrice>();
    }
    return c.json({ success: true, data: result.results });
  } catch (err) {
    console.error('GET /api/switch-repair/prices error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/switch-repair/prices/:id
switchRepair.patch('/api/switch-repair/prices/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      price_min?: number | null;
      price_max?: number | null;
      is_consultation?: number;
      is_not_applicable?: number;
      note?: string | null;
    }>();
    const now = new Date().toISOString();

    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [now];

    if ('price_min' in body)        { sets.push('price_min = ?');        vals.push(body.price_min ?? null); }
    if ('price_max' in body)        { sets.push('price_max = ?');        vals.push(body.price_max ?? null); }
    if ('is_consultation' in body)  { sets.push('is_consultation = ?');  vals.push(body.is_consultation ?? 0); }
    if ('is_not_applicable' in body){ sets.push('is_not_applicable = ?');vals.push(body.is_not_applicable ?? 0); }
    if ('note' in body)             { sets.push('note = ?');             vals.push(body.note ?? null); }

    vals.push(id);
    await c.env.DB.prepare(`UPDATE switch_repair_prices SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

    const updated = await c.env.DB
      .prepare('SELECT * FROM switch_repair_prices WHERE id = ?')
      .bind(id)
      .first<SwitchRepairPrice>();
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);

    return c.json({ success: true, data: updated });
  } catch (err) {
    console.error('PATCH /api/switch-repair/prices/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

interface SymptomPriceRow {
  product_id: string;
  symptom_id: string;
  symptom_name: string;
  sort_order: number;
  price_id: string | null;
  price_from: number | null;
  price_to: number | null;
  delivery_days_from: number | null;
  delivery_days_to: number | null;
}

const SWITCH_PRODUCT_IDS = [
  'prod-swn-0001-0000-0000-000000000004',
  'prod-swl-0001-0000-0000-000000000005',
  'prod-swo-0001-0000-0000-000000000006',
  'prod-sw2-0001-0000-0000-000000000007',
].map(id => `'${id}'`).join(',');

// GET /api/switch-repair/symptom-prices
switchRepair.get('/api/switch-repair/symptom-prices', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT rs.product_id, rs.id AS symptom_id, rs.name AS symptom_name, rs.sort_order,
             rp.id AS price_id, rp.price_from, rp.price_to, rp.delivery_days_from, rp.delivery_days_to
      FROM repair_symptoms rs
      LEFT JOIN repair_prices rp ON rp.product_id = rs.product_id AND rp.symptom_id = rs.id
      WHERE rs.product_id IN (${SWITCH_PRODUCT_IDS}) AND rs.is_active = 1
      ORDER BY rs.product_id, rs.sort_order
    `).all<SymptomPriceRow>();
    return c.json({ success: true, data: result.results });
  } catch (err) {
    console.error('GET /api/switch-repair/symptom-prices error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/switch-repair/symptom-prices/:symptomId
switchRepair.put('/api/switch-repair/symptom-prices/:symptomId', async (c) => {
  try {
    const symptomId = c.req.param('symptomId');
    const body = await c.req.json<{
      productId: string;
      priceFrom: number;
      priceTo: number | null;
      deliveryDaysFrom?: number | null;
      deliveryDaysTo?: number | null;
    }>();

    const existing = await c.env.DB
      .prepare('SELECT id FROM repair_prices WHERE product_id = ? AND symptom_id = ? LIMIT 1')
      .bind(body.productId, symptomId)
      .first<{ id: string }>();

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE repair_prices SET price_from = ?, price_to = ?, delivery_days_from = ?, delivery_days_to = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = ?`
      ).bind(body.priceFrom, body.priceTo ?? null, body.deliveryDaysFrom ?? null, body.deliveryDaysTo ?? null, existing.id).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO repair_prices (id, product_id, symptom_id, price_from, price_to, delivery_days_from, delivery_days_to) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), body.productId, symptomId, body.priceFrom, body.priceTo ?? null, body.deliveryDaysFrom ?? null, body.deliveryDaysTo ?? null).run();
    }

    const updated = await c.env.DB.prepare(`
      SELECT rs.product_id, rs.id AS symptom_id, rs.name AS symptom_name, rs.sort_order,
             rp.id AS price_id, rp.price_from, rp.price_to, rp.delivery_days_from, rp.delivery_days_to
      FROM repair_symptoms rs
      LEFT JOIN repair_prices rp ON rp.product_id = rs.product_id AND rp.symptom_id = rs.id
      WHERE rs.id = ?
    `).bind(symptomId).first<SymptomPriceRow>();

    return c.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/switch-repair/symptom-prices error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ---- Switch Consult FAQ endpoints ----

interface ConsultCategory {
  id: string;
  label: string;
  sort_order: number;
  is_active: number;
}

interface ConsultFaq {
  id: string;
  category_id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: number;
}

// GET /api/switch-repair/consult-categories
switchRepair.get('/api/switch-repair/consult-categories', async (c) => {
  try {
    const cats = await c.env.DB.prepare(
      'SELECT * FROM switch_consult_categories WHERE is_active = 1 ORDER BY sort_order'
    ).all<ConsultCategory>();
    const faqs = await c.env.DB.prepare(
      'SELECT * FROM switch_consult_faqs WHERE is_active = 1 ORDER BY sort_order'
    ).all<ConsultFaq>();
    return c.json({ success: true, categories: cats.results, faqs: faqs.results });
  } catch (err) {
    console.error('GET consult-categories error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/switch-repair/consult-categories/:id
switchRepair.put('/api/switch-repair/consult-categories/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ label?: string; sort_order?: number }>();
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [now];
    if ('label' in body) { sets.push('label = ?'); vals.push(body.label); }
    if ('sort_order' in body) { sets.push('sort_order = ?'); vals.push(body.sort_order); }
    vals.push(id);
    await c.env.DB.prepare(`UPDATE switch_consult_categories SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    const updated = await c.env.DB.prepare('SELECT * FROM switch_consult_categories WHERE id = ?').bind(id).first<ConsultCategory>();
    return c.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT consult-categories error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/switch-repair/consult-faqs/:id
switchRepair.put('/api/switch-repair/consult-faqs/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ question?: string; answer?: string; sort_order?: number }>();
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [now];
    if ('question' in body) { sets.push('question = ?'); vals.push(body.question); }
    if ('answer' in body) { sets.push('answer = ?'); vals.push(body.answer); }
    if ('sort_order' in body) { sets.push('sort_order = ?'); vals.push(body.sort_order); }
    vals.push(id);
    await c.env.DB.prepare(`UPDATE switch_consult_faqs SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    const updated = await c.env.DB.prepare('SELECT * FROM switch_consult_faqs WHERE id = ?').bind(id).first<ConsultFaq>();
    return c.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT consult-faqs error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ---- Switch Product Settings endpoints ----

interface SwitchProductSetting {
  product_id: string;
  name: string;
  estimate_note: string | null;
  sort_order: number;
  is_active: number;
}

// GET /api/switch-repair/products
switchRepair.get('/api/switch-repair/products', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM switch_product_settings WHERE is_active = 1 ORDER BY sort_order'
    ).all<SwitchProductSetting>();
    return c.json({ success: true, data: result.results });
  } catch (err) {
    console.error('GET /api/switch-repair/products error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/switch-repair/products/:productId
switchRepair.put('/api/switch-repair/products/:productId', async (c) => {
  try {
    const productId = c.req.param('productId');
    const body = await c.req.json<{ name?: string; estimate_note?: string | null }>();
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [now];
    if ('name' in body && body.name?.trim()) { sets.push('name = ?'); vals.push(body.name.trim()); }
    if ('estimate_note' in body) { sets.push('estimate_note = ?'); vals.push(body.estimate_note ?? null); }
    if (sets.length === 1) return c.json({ success: false, error: 'No fields to update' }, 400);
    vals.push(productId);
    await c.env.DB.prepare(`UPDATE switch_product_settings SET ${sets.join(', ')} WHERE product_id = ?`).bind(...vals).run();
    const updated = await c.env.DB.prepare('SELECT * FROM switch_product_settings WHERE product_id = ?').bind(productId).first<SwitchProductSetting>();
    return c.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/switch-repair/products error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ---- Switch Repair Menu Item endpoints ----

interface SwitchRepairMenuItem {
  id: string;
  product_id: string;
  name: string;
  price_from: number | null;
  price_to: number | null;
  delivery_days: string | null;
  sort_order: number;
  is_active: number;
}

// GET /api/switch-repair/menu-items?productId=xxx
switchRepair.get('/api/switch-repair/menu-items', async (c) => {
  try {
    const productId = c.req.query('productId');
    if (!productId) return c.json({ success: false, error: 'productId is required' }, 400);
    const result = await c.env.DB.prepare(
      'SELECT * FROM switch_repair_menu_items WHERE product_id = ? AND is_active = 1 ORDER BY sort_order'
    ).bind(productId).all<SwitchRepairMenuItem>();
    return c.json({ success: true, data: result.results });
  } catch (err) {
    console.error('GET /api/switch-repair/menu-items error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/switch-repair/menu-items
switchRepair.post('/api/switch-repair/menu-items', async (c) => {
  try {
    const body = await c.req.json<{ productId: string; name: string; priceFrom?: number | null; priceTo?: number | null; deliveryDays?: string | null }>();
    if (!body.productId || !body.name?.trim()) return c.json({ success: false, error: 'productId and name are required' }, 400);
    const maxOrder = await c.env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM switch_repair_menu_items WHERE product_id = ?'
    ).bind(body.productId).first<{ m: number }>();
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO switch_repair_menu_items (id, product_id, name, price_from, price_to, delivery_days, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
    ).bind(id, body.productId, body.name.trim(), body.priceFrom ?? null, body.priceTo ?? null, body.deliveryDays?.trim() || null, (maxOrder?.m ?? 0) + 10).run();
    const created = await c.env.DB.prepare('SELECT * FROM switch_repair_menu_items WHERE id = ?').bind(id).first<SwitchRepairMenuItem>();
    return c.json({ success: true, data: created }, 201);
  } catch (err) {
    console.error('POST /api/switch-repair/menu-items error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/switch-repair/menu-items/:id
switchRepair.put('/api/switch-repair/menu-items/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; priceFrom?: number | null; priceTo?: number | null; deliveryDays?: string | null; sort_order?: number }>();
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [now];
    if ('name' in body && body.name?.trim()) { sets.push('name = ?'); vals.push(body.name.trim()); }
    if ('priceFrom' in body) { sets.push('price_from = ?'); vals.push(body.priceFrom ?? null); }
    if ('priceTo' in body) { sets.push('price_to = ?'); vals.push(body.priceTo ?? null); }
    if ('deliveryDays' in body) { sets.push('delivery_days = ?'); vals.push(body.deliveryDays?.trim() || null); }
    if ('sort_order' in body) { sets.push('sort_order = ?'); vals.push(body.sort_order); }
    if (sets.length === 1) return c.json({ success: false, error: 'No fields to update' }, 400);
    vals.push(id);
    await c.env.DB.prepare(`UPDATE switch_repair_menu_items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    const updated = await c.env.DB.prepare('SELECT * FROM switch_repair_menu_items WHERE id = ?').bind(id).first<SwitchRepairMenuItem>();
    return c.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/switch-repair/menu-items/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/switch-repair/menu-items/:id  (soft delete)
switchRepair.delete('/api/switch-repair/menu-items/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('UPDATE switch_repair_menu_items SET is_active = 0 WHERE id = ?').bind(id).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/switch-repair/menu-items/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/switch-repair/symptoms
switchRepair.post('/api/switch-repair/symptoms', async (c) => {
  try {
    const body = await c.req.json<{ productId: string; name: string }>();
    if (!body.productId || !body.name?.trim()) {
      return c.json({ success: false, error: 'productId and name are required' }, 400);
    }
    const maxOrder = await c.env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM repair_symptoms WHERE product_id = ?'
    ).bind(body.productId).first<{ m: number }>();
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO repair_symptoms (id, product_id, name, sort_order, is_active) VALUES (?, ?, ?, ?, 1)'
    ).bind(id, body.productId, body.name.trim(), (maxOrder?.m ?? 0) + 10).run();
    const created = await c.env.DB.prepare(`
      SELECT rs.product_id, rs.id AS symptom_id, rs.name AS symptom_name, rs.sort_order,
             rp.id AS price_id, rp.price_from, rp.price_to, rp.delivery_days_from, rp.delivery_days_to
      FROM repair_symptoms rs
      LEFT JOIN repair_prices rp ON rp.product_id = rs.product_id AND rp.symptom_id = rs.id
      WHERE rs.id = ?
    `).bind(id).first<SymptomPriceRow>();
    return c.json({ success: true, data: created }, 201);
  } catch (err) {
    console.error('POST /api/switch-repair/symptoms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/switch-repair/symptoms/:id
switchRepair.put('/api/switch-repair/symptoms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; sort_order?: number }>();
    const sets: string[] = [];
    const vals: unknown[] = [];
    if ('name' in body && body.name?.trim()) { sets.push('name = ?'); vals.push(body.name.trim()); }
    if ('sort_order' in body) { sets.push('sort_order = ?'); vals.push(body.sort_order); }
    if (sets.length === 0) return c.json({ success: false, error: 'No fields to update' }, 400);
    vals.push(id);
    await c.env.DB.prepare(`UPDATE repair_symptoms SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    const updated = await c.env.DB.prepare(`
      SELECT rs.product_id, rs.id AS symptom_id, rs.name AS symptom_name, rs.sort_order,
             rp.id AS price_id, rp.price_from, rp.price_to, rp.delivery_days_from, rp.delivery_days_to
      FROM repair_symptoms rs
      LEFT JOIN repair_prices rp ON rp.product_id = rs.product_id AND rp.symptom_id = rs.id
      WHERE rs.id = ?
    `).bind(id).first<SymptomPriceRow>();
    return c.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/switch-repair/symptoms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/switch-repair/symptoms/:id  (soft delete)
switchRepair.delete('/api/switch-repair/symptoms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('UPDATE repair_symptoms SET is_active = 0 WHERE id = ?').bind(id).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/switch-repair/symptoms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/switch-repair/settings
switchRepair.get('/api/switch-repair/settings', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT key, value FROM switch_settings').all<{ key: string; value: string }>();
    const data: Record<string, string> = {};
    result.results.forEach(r => { data[r.key] = r.value; });
    return c.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/switch-repair/settings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/switch-repair/settings
switchRepair.put('/api/switch-repair/settings', async (c) => {
  try {
    const body = await c.req.json<Record<string, string>>();
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(body)) {
      await c.env.DB.prepare(
        'INSERT INTO switch_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      ).bind(key, value, now).run();
    }
    return c.json({ success: true });
  } catch (err) {
    console.error('PUT /api/switch-repair/settings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { switchRepair };
