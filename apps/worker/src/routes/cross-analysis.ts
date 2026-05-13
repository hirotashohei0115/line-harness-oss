import { Hono } from 'hono';
import type { Env } from '../index.js';

interface Condition {
  type: 'tag' | 'contact_mark' | 'repair_method' | 'delivery_store';
  ids: string[];
}

interface Group {
  name: string;
  conditions: Condition[];
}

interface AxisDef {
  label: string;
  groups: Group[];
}

interface RunRequest {
  name?: string;
  period?: { from?: string; to?: string };
  axis1: AxisDef;
  axis2: AxisDef;
}

interface CrossAnalysisRow {
  id: string;
  name: string;
  axis1_label: string;
  axis2_label: string;
  axis1_groups: string;
  axis2_groups: string;
  created_at: string;
  updated_at: string;
}

const crossAnalysisRoutes = new Hono<Env>();

function serializeDefinition(row: CrossAnalysisRow) {
  return {
    id: row.id,
    name: row.name,
    axis1Label: row.axis1_label,
    axis2Label: row.axis2_label,
    axis1Groups: JSON.parse(row.axis1_groups) as Group[],
    axis2Groups: JSON.parse(row.axis2_groups) as Group[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildConditionSQL(cond: Condition): { sql: string; params: unknown[] } {
  const { type, ids } = cond;
  if (ids.length === 0) return { sql: '0=1', params: [] };

  if (type === 'tag') {
    const ph = ids.map(() => '?').join(',');
    return {
      sql: `EXISTS (SELECT 1 FROM friend_tags _ft WHERE _ft.friend_id = f.id AND _ft.tag_id IN (${ph}))`,
      params: ids,
    };
  }
  if (type === 'contact_mark') {
    const ph = ids.map(() => '?').join(',');
    return { sql: `f.contact_mark_id IN (${ph})`, params: ids };
  }
  if (type === 'repair_method') {
    const ph = ids.map(() => '?').join(',');
    return {
      sql: `EXISTS (SELECT 1 FROM repair_quotes _rq WHERE _rq.friend_id = f.id AND _rq.request_type IN (${ph}))`,
      params: ids,
    };
  }
  if (type === 'delivery_store') {
    const parts = ids.map(() => `_mo.delivery_store LIKE ?`).join(' OR ');
    return {
      sql: `EXISTS (SELECT 1 FROM mail_orders _mo WHERE _mo.friend_id = f.id AND (${parts}))`,
      params: ids.map((id) => `%${id}%`),
    };
  }
  return { sql: '0=1', params: [] };
}

function buildGroupSQL(group: Group): { sql: string; params: unknown[] } {
  if (group.conditions.length === 0) return { sql: '1=1', params: [] };
  const parts = group.conditions.map(buildConditionSQL);
  return {
    sql: `(${parts.map((p) => p.sql).join(' OR ')})`,
    params: parts.flatMap((p) => p.params),
  };
}

async function countCell(
  db: D1Database,
  fromTs: string,
  toTs: string,
  g1: Group,
  g2: Group | null,
): Promise<number> {
  const { sql: sql1, params: p1 } = buildGroupSQL(g1);
  const baseParams: unknown[] = [fromTs, toTs, ...p1];
  let whereSql = `f.created_at >= ? AND f.created_at <= ? AND ${sql1}`;

  if (g2) {
    const { sql: sql2, params: p2 } = buildGroupSQL(g2);
    whereSql += ` AND ${sql2}`;
    baseParams.push(...p2);
  }

  const row = await db
    .prepare(`SELECT COUNT(DISTINCT f.id) as count FROM friends f WHERE ${whereSql}`)
    .bind(...baseParams)
    .first<{ count: number }>();
  return row?.count ?? 0;
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
    const rows = [];

    for (const g1 of axis1.groups) {
      const cells = [];
      for (const g2 of axis2.groups) {
        const count = await countCell(c.env.DB, fromTs, toTs, g1, g2);
        cells.push({ group: g2.name, count });
      }
      // 行合計 = 軸1グループの条件のみ満たすユーザー数（軸2条件は無視）
      const total = await countCell(c.env.DB, fromTs, toTs, g1, null);
      rows.push({ group: g1.name, total, cells });
    }

    // 列合計 = 軸2グループの条件のみ満たすユーザー数（軸1条件は無視）
    const allGroup: Group = { name: '', conditions: [] };
    const colTotals = await Promise.all(
      axis2.groups.map(async (g2) => ({
        group: g2.name,
        count: await countCell(c.env.DB, fromTs, toTs, allGroup, g2),
      }))
    );

    return c.json({
      success: true,
      data: {
        name: body.name ?? 'クロス分析',
        period: { from, to },
        axis1Label: axis1.label,
        axis2Label: axis2.label,
        rows,
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
    const body = await c.req.json<{ name: string; axis1: AxisDef; axis2: AxisDef }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB
      .prepare('INSERT INTO cross_analysis_definitions (id, name, axis1_label, axis2_label, axis1_groups, axis2_groups, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, body.name, body.axis1.label, body.axis2.label, JSON.stringify(body.axis1.groups), JSON.stringify(body.axis2.groups), now, now)
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
    const body = await c.req.json<Partial<{ name: string; axis1: AxisDef; axis2: AxisDef }>>();
    const existing = await c.env.DB.prepare('SELECT * FROM cross_analysis_definitions WHERE id = ?').bind(id).first<CrossAnalysisRow>();
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    const now = new Date().toISOString();
    const name = body.name ?? existing.name;
    const axis1Label = body.axis1?.label ?? existing.axis1_label;
    const axis2Label = body.axis2?.label ?? existing.axis2_label;
    const axis1Groups = body.axis1?.groups ? JSON.stringify(body.axis1.groups) : existing.axis1_groups;
    const axis2Groups = body.axis2?.groups ? JSON.stringify(body.axis2.groups) : existing.axis2_groups;
    await c.env.DB
      .prepare('UPDATE cross_analysis_definitions SET name=?, axis1_label=?, axis2_label=?, axis1_groups=?, axis2_groups=?, updated_at=? WHERE id=?')
      .bind(name, axis1Label, axis2Label, axis1Groups, axis2Groups, now, id).run();
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
