import { Hono } from 'hono';
import type { Env } from '../index.js';

type AxisType = 'tag' | 'contact_mark';

interface AxisGroup {
  id: string;
  name: string;
  itemIds: string[];
}

interface AxisConfig {
  type: AxisType;
  itemIds?: string[];
  groups?: AxisGroup[];
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

/**
 * Convert an AxisConfig to a list of AxisGroup[].
 * - If config.groups is present and non-empty, use it directly.
 * - Otherwise fall back to legacy itemIds[] format: each itemId becomes its own group.
 */
function configToGroups(config: AxisConfig): AxisGroup[] {
  if (config.groups && config.groups.length > 0) {
    return config.groups;
  }
  // Legacy: each itemId is its own group
  return (config.itemIds ?? []).map((id) => ({ id, name: id, itemIds: [id] }));
}

function serializeDefinition(row: CrossAnalysisRow) {
  let axis1: AxisConfig = { type: 'tag', itemIds: [] };
  let axis2: AxisConfig = { type: 'contact_mark', itemIds: [] };
  try { axis1 = JSON.parse(row.axis1_groups) as AxisConfig; } catch { /* legacy */ }
  try { axis2 = JSON.parse(row.axis2_groups) as AxisConfig; } catch { /* legacy */ }

  const axis1Groups = configToGroups(axis1);
  const axis2Groups = configToGroups(axis2);

  return {
    id: row.id,
    name: row.name,
    axis1Type: axis1.type ?? 'tag',
    axis1ItemIds: axis1Groups.flatMap((g) => g.itemIds),
    axis1Groups,
    axis2Type: axis2.type ?? 'contact_mark',
    axis2ItemIds: axis2Groups.flatMap((g) => g.itemIds),
    axis2Groups,
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

/**
 * Build an OR condition across all itemIds in a group.
 * If itemIds is empty, returns an impossible condition (1=0).
 */
function buildGroupCondition(type: AxisType, itemIds: string[]): { sql: string; params: unknown[] } {
  if (itemIds.length === 0) {
    return { sql: '1=0', params: [] };
  }
  const parts = itemIds.map((id) => buildItemCondition(type, id));
  const sql = parts.map((p) => p.sql).join(' OR ');
  const params = parts.flatMap((p) => p.params);
  return { sql: `(${sql})`, params };
}

async function countUsersWithConditions(
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

// GET /api/cross-analyses
crossAnalysisRoutes.get('/api/cross-analyses', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    let result;
    if (lineAccountId) {
      result = await c.env.DB
        .prepare('SELECT * FROM cross_analysis_definitions WHERE line_account_id = ? ORDER BY created_at DESC')
        .bind(lineAccountId)
        .all<CrossAnalysisRow>();
    } else {
      result = await c.env.DB
        .prepare('SELECT * FROM cross_analysis_definitions ORDER BY created_at DESC')
        .all<CrossAnalysisRow>();
    }
    return c.json({ success: true, data: result.results.map(serializeDefinition) });
  } catch (err) {
    console.error('GET /api/cross-analyses error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/cross-analyses/users — fetch friend list matching cell conditions (must be BEFORE /:id)
crossAnalysisRoutes.post('/api/cross-analyses/users', async (c) => {
  try {
    const body = await c.req.json<{
      period: { from: string; to: string };
      axis1: { type: AxisType; itemIds: string[] };
      axis2: { type: AxisType; itemIds: string[] };
    }>();

    const fromTs = `${body.period.from}T00:00:00`;
    const toTs = `${body.period.to}T23:59:59`;
    const cond1 = buildGroupCondition(body.axis1.type, body.axis1.itemIds);
    const cond2 = buildGroupCondition(body.axis2.type, body.axis2.itemIds);

    const conditions = ['f.created_at >= ?', 'f.created_at <= ?'];
    const params: unknown[] = [fromTs, toTs];
    if (cond1.sql !== '1=0') { conditions.push(cond1.sql); params.push(...cond1.params); }
    if (cond2.sql !== '1=0') { conditions.push(cond2.sql); params.push(...cond2.params); }

    const result = await c.env.DB
      .prepare(`SELECT DISTINCT f.id, f.display_name, f.picture_url, f.line_user_id FROM friends f WHERE ${conditions.join(' AND ')} ORDER BY f.display_name ASC`)
      .bind(...params)
      .all<{ id: string; display_name: string; picture_url: string | null; line_user_id: string }>();

    return c.json({
      success: true,
      data: result.results.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        pictureUrl: r.picture_url,
        lineUserId: r.line_user_id,
      })),
    });
  } catch (err) {
    console.error('POST /api/cross-analyses/users error:', err);
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

    const axis1Groups = configToGroups(axis1);
    const axis2Groups = configToGroups(axis2);

    // Build axis items from groups (id = group.id, name = group.name)
    const axis1Items = axis1Groups.map((g) => ({ id: g.id, name: g.name }));
    const axis2Items = axis2Groups.map((g) => ({ id: g.id, name: g.name }));

    // Cells: each axis1 group × each axis2 group
    const cells: Record<string, Record<string, number>> = {};
    for (const grp1 of axis1Groups) {
      cells[grp1.id] = {};
      const cond1 = buildGroupCondition(axis1.type, grp1.itemIds);
      for (const grp2 of axis2Groups) {
        const cond2 = buildGroupCondition(axis2.type, grp2.itemIds);
        cells[grp1.id][grp2.id] = await countUsersWithConditions(
          c.env.DB, fromTs, toTs, cond1, cond2,
        );
      }
    }

    // Row totals: grp1 AND (any grp2)
    const rowTotals: Record<string, number> = {};
    const allAxis2ItemIds = axis2Groups.flatMap((g) => g.itemIds);
    const a2OrCond = buildGroupCondition(axis2.type, allAxis2ItemIds);
    for (const grp1 of axis1Groups) {
      const cond1 = buildGroupCondition(axis1.type, grp1.itemIds);
      rowTotals[grp1.id] = await countUsersWithConditions(
        c.env.DB, fromTs, toTs, cond1, a2OrCond,
      );
    }

    // Col totals: grp2 AND (any grp1)
    const colTotals: Record<string, number> = {};
    const allAxis1ItemIds = axis1Groups.flatMap((g) => g.itemIds);
    const a1OrCond = buildGroupCondition(axis1.type, allAxis1ItemIds);
    for (const grp2 of axis2Groups) {
      const cond2 = buildGroupCondition(axis2.type, grp2.itemIds);
      colTotals[grp2.id] = await countUsersWithConditions(
        c.env.DB, fromTs, toTs, cond2, a1OrCond,
      );
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
    const body = await c.req.json<{ name: string; axis1: AxisConfig; axis2: AxisConfig; lineAccountId?: string | null }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB
      .prepare('INSERT INTO cross_analysis_definitions (id, name, axis1_label, axis2_label, axis1_groups, axis2_groups, line_account_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        id, body.name,
        TYPE_LABEL[body.axis1.type], TYPE_LABEL[body.axis2.type],
        JSON.stringify(body.axis1), JSON.stringify(body.axis2),
        body.lineAccountId ?? null,
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
