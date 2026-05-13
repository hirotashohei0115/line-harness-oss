import { Hono } from 'hono';
import type { Env } from '../index.js';

interface FunnelRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface FunnelStepRow {
  id: string;
  funnel_id: string;
  name: string;
  step_order: number;
  condition_type: 'tag' | 'contact_mark' | 'action';
  condition_ids: string;
  created_at: string;
}

const funnelRoutes = new Hono<Env>();

function serializeFunnel(row: FunnelRow) {
  return { id: row.id, name: row.name, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at };
}

function serializeStep(row: FunnelStepRow) {
  return {
    id: row.id, funnelId: row.funnel_id, name: row.name,
    stepOrder: row.step_order, conditionType: row.condition_type,
    conditionIds: JSON.parse(row.condition_ids || '[]') as string[],
    createdAt: row.created_at,
  };
}

// GET /api/funnels
funnelRoutes.get('/api/funnels', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT * FROM funnel_definitions ORDER BY created_at DESC').all<FunnelRow>();
    return c.json({ success: true, data: result.results.map(serializeFunnel) });
  } catch (err) {
    console.error('GET /api/funnels error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/funnels
funnelRoutes.post('/api/funnels', async (c) => {
  try {
    const body = await c.req.json<{
      name: string; description?: string;
      steps?: { name: string; step_order: number; condition_type: 'tag' | 'contact_mark' | 'action'; condition_ids: string[] }[];
    }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare('INSERT INTO funnel_definitions (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, body.name, body.description ?? null, now, now).run();
    for (const step of body.steps ?? []) {
      await c.env.DB.prepare('INSERT INTO funnel_steps (id, funnel_id, name, step_order, condition_type, condition_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, step.name, step.step_order, step.condition_type, JSON.stringify(step.condition_ids), now).run();
    }
    const funnel = await c.env.DB.prepare('SELECT * FROM funnel_definitions WHERE id = ?').bind(id).first<FunnelRow>();
    const steps = await c.env.DB.prepare('SELECT * FROM funnel_steps WHERE funnel_id = ? ORDER BY step_order ASC').bind(id).all<FunnelStepRow>();
    return c.json({ success: true, data: { ...serializeFunnel(funnel!), steps: steps.results.map(serializeStep) } }, 201);
  } catch (err) {
    console.error('POST /api/funnels error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/funnels/:id
funnelRoutes.get('/api/funnels/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const funnel = await c.env.DB.prepare('SELECT * FROM funnel_definitions WHERE id = ?').bind(id).first<FunnelRow>();
    if (!funnel) return c.json({ success: false, error: 'Not found' }, 404);
    const steps = await c.env.DB.prepare('SELECT * FROM funnel_steps WHERE funnel_id = ? ORDER BY step_order ASC').bind(id).all<FunnelStepRow>();
    return c.json({ success: true, data: { ...serializeFunnel(funnel), steps: steps.results.map(serializeStep) } });
  } catch (err) {
    console.error('GET /api/funnels/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/funnels/:id
funnelRoutes.patch('/api/funnels/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string; description?: string | null;
      steps?: { name: string; step_order: number; condition_type: 'tag' | 'contact_mark' | 'action'; condition_ids: string[] }[];
    }>();
    const existing = await c.env.DB.prepare('SELECT * FROM funnel_definitions WHERE id = ?').bind(id).first<FunnelRow>();
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    const now = new Date().toISOString();
    await c.env.DB.prepare('UPDATE funnel_definitions SET name = ?, description = ?, updated_at = ? WHERE id = ?')
      .bind(body.name ?? existing.name, body.description !== undefined ? body.description : existing.description, now, id).run();
    if (body.steps !== undefined) {
      await c.env.DB.prepare('DELETE FROM funnel_steps WHERE funnel_id = ?').bind(id).run();
      for (const step of body.steps) {
        await c.env.DB.prepare('INSERT INTO funnel_steps (id, funnel_id, name, step_order, condition_type, condition_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), id, step.name, step.step_order, step.condition_type, JSON.stringify(step.condition_ids), now).run();
      }
    }
    const updated = await c.env.DB.prepare('SELECT * FROM funnel_definitions WHERE id = ?').bind(id).first<FunnelRow>();
    const steps = await c.env.DB.prepare('SELECT * FROM funnel_steps WHERE funnel_id = ? ORDER BY step_order ASC').bind(id).all<FunnelStepRow>();
    return c.json({ success: true, data: { ...serializeFunnel(updated!), steps: steps.results.map(serializeStep) } });
  } catch (err) {
    console.error('PATCH /api/funnels/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/funnels/:id
funnelRoutes.delete('/api/funnels/:id', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM funnel_definitions WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/funnels/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/funnels/:id/analyze?from=YYYY-MM-DD&to=YYYY-MM-DD
funnelRoutes.get('/api/funnels/:id/analyze', async (c) => {
  try {
    const id = c.req.param('id');
    const from = c.req.query('from') ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = c.req.query('to') ?? new Date().toISOString().slice(0, 10);
    const fromTs = `${from}T00:00:00`;
    const toTs = `${to}T23:59:59`;

    const funnel = await c.env.DB.prepare('SELECT * FROM funnel_definitions WHERE id = ?').bind(id).first<FunnelRow>();
    if (!funnel) return c.json({ success: false, error: 'Not found' }, 404);

    const stepsResult = await c.env.DB
      .prepare('SELECT * FROM funnel_steps WHERE funnel_id = ? ORDER BY step_order ASC').bind(id).all<FunnelStepRow>();

    const totalRow = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM friends WHERE created_at >= ? AND created_at <= ?')
      .bind(fromTs, toTs).first<{ count: number }>();
    const total = totalRow?.count ?? 0;

    const steps = [];
    let prevReached = total;

    for (const step of stepsResult.results) {
      const conditionIds = JSON.parse(step.condition_ids || '[]') as string[];
      let reached = 0;

      if (conditionIds.length > 0) {
        const placeholders = conditionIds.map(() => '?').join(',');

        if (step.condition_type === 'tag') {
          const row = await c.env.DB
            .prepare(`SELECT COUNT(DISTINCT f.id) as count FROM friends f JOIN friend_tags ft ON f.id = ft.friend_id WHERE f.created_at >= ? AND f.created_at <= ? AND ft.tag_id IN (${placeholders})`)
            .bind(fromTs, toTs, ...conditionIds).first<{ count: number }>();
          reached = row?.count ?? 0;
        } else if (step.condition_type === 'contact_mark') {
          const row = await c.env.DB
            .prepare(`SELECT COUNT(*) as count FROM friends WHERE created_at >= ? AND created_at <= ? AND contact_mark_id IN (${placeholders})`)
            .bind(fromTs, toTs, ...conditionIds).first<{ count: number }>();
          reached = row?.count ?? 0;
        } else if (step.condition_type === 'action') {
          // アクションログベース: 指定action_typeのログが存在するユーザー
          const row = await c.env.DB
            .prepare(`SELECT COUNT(DISTINCT f.id) as count FROM friends f JOIN friend_action_logs fal ON f.id = fal.friend_id WHERE f.created_at >= ? AND f.created_at <= ? AND fal.action_type IN (${placeholders})`)
            .bind(fromTs, toTs, ...conditionIds).first<{ count: number }>();
          reached = row?.count ?? 0;
        }
      }

      const prevRate = prevReached > 0 ? Math.round((reached / prevReached) * 1000) / 10 : 0;
      const totalRate = total > 0 ? Math.round((reached / total) * 1000) / 10 : 0;
      const notReached = prevReached - reached;

      steps.push({
        name: step.name,
        reached,
        notReached,
        rate: prevRate,         // 前ステップからの移行率
        prevRate,               // alias
        totalRate,              // 全体比
        dropoff: Math.round((100 - prevRate) * 10) / 10,
      });
      prevReached = reached;
    }

    return c.json({ success: true, data: { funnel: serializeFunnel(funnel), period: { from, to }, total, steps } });
  } catch (err) {
    console.error('GET /api/funnels/:id/analyze error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { funnelRoutes };
