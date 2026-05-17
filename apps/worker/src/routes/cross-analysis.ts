import { Hono } from 'hono';
import type { Env } from '../index.js';

type AxisType = 'tag' | 'contact_mark';

interface AxisConfig {
  type: AxisType;
  itemIds: string[];
}

interface RunRequest {
  name?: string;
  period?: { from?: string; to?: string };
  axis1: AxisConfig;
  axis2: AxisConfig;
}

interface CrossAnalysisRow {
  id: string;
  name: string;
  axis1_label: string;
  axis2_label: string;
  axis1_groups: string; // JSON: AxisConfig
  axis2_groups: string; // JSON: AxisConfig
  created_at: string;
  updated_at: string;
}

const crossAnalysisRoutes = new Hono<Env>();

const TYPE_LABEL: Record<AxisType, string> = {
  tag: 'タグ',
  contact_mark: '対応マーク',
};

function serializeDefinition(row: CrossAnalysisRow) {
  let axis1: AxisConfig = { type: 'tag', itemIds: [] };
  let axis2: AxisConfig = { type: 'contact_mark', itemIds: [] };
  try { axis1 = JSON.parse(row.axis1_groups) as AxisConfig; } catch { /* legacy */ }
  try { axis2 = JSON.parse(row.axis2_groups) as AxisConfig; } catch { /* legacy */ }
  return {
    id: row.id,
    name: row.name,
    axis1Type: axis1.type ?? 'tag',
    axis1ItemIds: axis1.itemIds ?? [],
    axis2Type: axis2.type ?? 'contact_mark',
    axis2ItemIds: axis2.itemIds ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildItemCondition(type: AxisType, itemId: string): { sql: string; params: unknown[] } {
  if (type === 'tag') {
    return {
      sql: `EXISTS (SELECT 1 FROM friend_tags _ft WHERE _ft.friend_id = f.id AND _ft.tag_id = ?)`,
      params: [itemId],
    };
  }
  return { sql: `f.contact_mark_id = ?`, params: [itemId] };
}

async function countUsers(
  db: D1Database,
  fromTs: string,
  toTs: string,
  cond1?: { sql: string; params: unknown[] },
  cond2?: { sql: string; params: unknown[] },
): Promise<number> {
  const conditions = ['f.created_at >= ?', 'f.created_at <= ?'];
  const params: unknown[] = [fromTs, toTs];
  if (cond1) { conditions.push(cond1.sql); params.push(...cond1.params); }
  if (cond2) { conditions.push(cond2.sql); params.push(...cond2.params); }
  const row = await db
    .prepare(`SELECT COUNT(DISTINCT f.id) as count FROM friends f WHERE ${conditions.join(' AND ')}`)
    .bind(...params)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function getItemNames(
  db: D1Database,
  type: AxisType,
  itemIds: string[],
): Promise<{ id: string; name: string }[]> {
  if (itemIds.length === 0) return [];
  const ph = itemIds.map(() => '?').join(',');
  const table = type === 'tag' ? 'tags' : 'contact_marks';
  const result = await db
    .prepare(`SELECT id, name FROM ${table} WHERE id IN (${ph})`)
    .bind(...itemIds)
    .all<{ id: string; name: string }>();
  return itemIds.map((id) => result.results.find((r) => r.id === id) ?? { id, name: id });
}

// GET /api/cross-analyses
crossAnalysisRoutes.get('/api/cross-analyses', async (c) => {
  try {
    const result = await c.env.DB
      .prepare('SELECT * FROM cross_analysis_definitions ORDER BY created_at DESC')
      .all<CrossAnalysisRow>();
    return c.json({ success: true, data: result.results.map(serializeDefinition) });
  } catch (err) {
    console.error('GET /api/cross-analyses error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/cross-analyses/run  (must be BEFORE /:id)
crossAnalysisRoutes.post('/api/cross-analyses/run', async (c) => {
  try {
    const body = await c.req.json<RunRequest>();
    const from = body.period?.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = body.period?.to ?? new Date().toISOString().slice(0, 10);
    const fromTs = `${from}T00:00:00`;
    const toTs = `${to}T23:59:59`;
    const { axis1, axis2 } = body;

    const [axis1Items, axis2Items] = await Promise.all([
      getItemNames(c.env.DB, axis1.type, axis1.itemIds),
      getItemNames(c.env.DB, axis2.type, axis2.itemIds),
    ]);

    // Cells: axis1 × axis2 intersection
    const cells: Record<string, Record<string, number>> = {};
    for (const a1Id of axis1.itemIds) {
      cells[a1Id] = {};
      for (const a2Id of axis2.itemIds) {
        cells[a1Id][a2Id] = await countUsers(
          c.env.DB, fromTs, toTs,
          buildItemCondition(axis1.type, a1Id),
          buildItemCondition(axis2.type, a2Id),
        );
      }
    }

    // Row totals: axis1 AND (axis2_1 OR axis2_2 OR ...)
    const rowTotals: Record<string, number> = {};
    const a2Conditions = axis2.itemIds.map((a2Id) => buildItemCondition(axis2.type, a2Id));
    const a2OrSql = a2Conditions.map((c) => c.sql).join(' OR ');
    const a2OrParams = a2Conditions.flatMap((c) => c.params);
    for (const a1Id of axis1.itemIds) {
      const a1Cond = buildItemCondition(axis1.type, a1Id);
      const conditions = ['f.created_at >= ?', 'f.created_at <= ?', a1Cond.sql, `(${a2OrSql})`];
      const params: unknown[] = [fromTs, toTs, ...a1Cond.params, ...a2OrParams];
      const row = await c.env.DB
        .prepare(`SELECT COUNT(DISTINCT f.id) as count FROM friends f WHERE ${conditions.join(' AND ')}`)
        .bind(...params)
        .first<{ count: number }>();
      rowTotals[a1Id] = row?.count ?? 0;
    }

    // Col totals (axis2 condition only, regardless of axis1)
    const colTotals: Record<string, number> = {};
    for (const a2Id of axis2.itemIds) {
      colTotals[a2Id] = await countUsers(c.env.DB, fromTs, toTs, undefined, buildItemCondition(axis2.type, a2Id));
    }

    return c.json({
      success: true,
      data: {
        name: body.name ?? 'クロス分析',
        period: { from, to },
        axis1Items,
        axis2Items,
        cells,
        rowTotals,
        colTotals,
      },
    });
  } catch (err) {
    console.error('POST /api/cross-analyses/run error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/cross-analyses
crossAnalysisRoutes.post('/api/cross-analyses', async (c) => {
  try {
    const body = await c.req.json<{ name: string; axis1: AxisConfig; axis2: AxisConfig }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB
      .prepare('INSERT INTO cross_analysis_definitions (id, name, axis1_label, axis2_label, axis1_groups, axis2_groups, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        id, body.name,
        TYPE_LABEL[body.axis1.type], TYPE_LABEL[body.axis2.type],
        JSON.stringify(body.axis1), JSON.stringify(body.axis2),
        now, now,
      )
      .run();
    const row = await c.env.DB.prepare('SELECT * FROM cross_analysis_definitions WHERE id = ?').bind(id).first<CrossAnalysisRow>();
    return c.json({ success: true, data: serializeDefinition(row!) }, 201);
  } catch (err) {
    console.error('POST /api/cross-analyses error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/cross-analyses/:id
crossAnalysisRoutes.get('/api/cross-analyses/:id', async (c) => {
  try {
    const row = await c.env.DB.prepare('SELECT * FROM cross_analysis_definitions WHERE id = ?').bind(c.req.param('id')).first<CrossAnalysisRow>();
    if (!row) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: serializeDefinition(row) });
  } catch (err) {
    console.error('GET /api/cross-analyses/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/cross-analyses/:id
crossAnalysisRoutes.patch('/api/cross-analyses/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<Partial<{ name: string; axis1: AxisConfig; axis2: AxisConfig }>>();
    const existing = await c.env.DB.prepare('SELECT * FROM cross_analysis_definitions WHERE id = ?').bind(id).first<CrossAnalysisRow>();
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    let existingAxis1: AxisConfig = { type: 'tag', itemIds: [] };
    let existingAxis2: AxisConfig = { type: 'contact_mark', itemIds: [] };
    try { existingAxis1 = JSON.parse(existing.axis1_groups) as AxisConfig; } catch { /* legacy */ }
    try { existingAxis2 = JSON.parse(existing.axis2_groups) as AxisConfig; } catch { /* legacy */ }
    const now = new Date().toISOString();
    const newAxis1 = body.axis1 ?? existingAxis1;
    const newAxis2 = body.axis2 ?? existingAxis2;
    await c.env.DB
      .prepare('UPDATE cross_analysis_definitions SET name=?, axis1_label=?, axis2_label=?, axis1_groups=?, axis2_groups=?, updated_at=? WHERE id=?')
      .bind(
        body.name ?? existing.name,
        TYPE_LABEL[newAxis1.type], TYPE_LABEL[newAxis2.type],
        JSON.stringify(newAxis1), JSON.stringify(newAxis2),
        now, id,
      )
      .run();
    const updated = await c.env.DB.prepare('SELECT * FROM cross_analysis_definitions WHERE id = ?').bind(id).first<CrossAnalysisRow>();
    return c.json({ success: true, data: serializeDefinition(updated!) });
  } catch (err) {
    console.error('PATCH /api/cross-analyses/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/cross-analyses/:id
crossAnalysisRoutes.delete('/api/cross-analyses/:id', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM cross_analysis_definitions WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/cross-analyses/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { crossAnalysisRoutes };
