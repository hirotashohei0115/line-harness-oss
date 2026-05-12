import { Hono } from 'hono';
import type { Env } from '../index.js';

interface ContactMark {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_default: number;
  created_at: string;
}

const marks = new Hono<Env>();

function serializeMark(row: ContactMark) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
  };
}

// GET /api/marks
marks.get('/api/marks', async (c) => {
  try {
    const result = await c.env.DB
      .prepare('SELECT * FROM contact_marks ORDER BY sort_order ASC')
      .all<ContactMark>();
    return c.json({ success: true, data: result.results.map(serializeMark) });
  } catch (err) {
    console.error('GET /api/marks error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/marks
marks.post('/api/marks', async (c) => {
  try {
    const body = await c.req.json<{ name: string; color?: string; sortOrder?: number }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);

    const id = `mark_${Date.now()}`;
    const color = body.color ?? '#cccccc';
    const sortOrder = body.sortOrder ?? 0;
    const now = new Date().toISOString();

    await c.env.DB
      .prepare('INSERT INTO contact_marks (id, name, color, sort_order, is_default, created_at) VALUES (?, ?, ?, ?, 0, ?)')
      .bind(id, body.name, color, sortOrder, now)
      .run();

    const row: ContactMark = { id, name: body.name, color, sort_order: sortOrder, is_default: 0, created_at: now };
    return c.json({ success: true, data: serializeMark(row) }, 201);
  } catch (err) {
    console.error('POST /api/marks error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/marks/:id
marks.patch('/api/marks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; color?: string; sortOrder?: number }>();

    const existing = await c.env.DB
      .prepare('SELECT * FROM contact_marks WHERE id = ?')
      .bind(id)
      .first<ContactMark>();
    if (!existing) return c.json({ success: false, error: 'Mark not found' }, 404);

    const name = body.name ?? existing.name;
    const color = body.color ?? existing.color;
    const sortOrder = body.sortOrder ?? existing.sort_order;

    await c.env.DB
      .prepare('UPDATE contact_marks SET name = ?, color = ?, sort_order = ? WHERE id = ?')
      .bind(name, color, sortOrder, id)
      .run();

    const updated: ContactMark = { ...existing, name, color, sort_order: sortOrder };
    return c.json({ success: true, data: serializeMark(updated) });
  } catch (err) {
    console.error('PATCH /api/marks/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/marks/:id
marks.delete('/api/marks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM contact_marks WHERE id = ?').bind(id).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/marks/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/friends/:friendId/mark
marks.patch('/api/friends/:friendId/mark', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const body = await c.req.json<{ markId: string | null }>();

    const friend = await c.env.DB
      .prepare('SELECT id FROM friends WHERE id = ?')
      .bind(friendId)
      .first<{ id: string }>();
    if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);

    await c.env.DB
      .prepare('UPDATE friends SET contact_mark_id = ? WHERE id = ?')
      .bind(body.markId, friendId)
      .run();

    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PATCH /api/friends/:friendId/mark error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { marks };
