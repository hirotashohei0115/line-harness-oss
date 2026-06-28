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

export { switchRepair };
