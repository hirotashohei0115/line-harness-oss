import { Hono } from 'hono';
import type { Env } from '../index.js';

const lineGroupsRoute = new Hono<Env>();

interface LineGroup {
  id: string;
  group_id: string;
  channel_id: string | null;
  joined_at: string;
  last_seen_at: string | null;
  is_active: number;
}

lineGroupsRoute.get('/api/line-groups', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM line_groups ORDER BY joined_at DESC'
    ).all<LineGroup>();
    return c.json({ success: true, data: result.results });
  } catch (err) {
    console.error('GET /api/line-groups error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

lineGroupsRoute.delete('/api/line-groups/:groupId', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    await c.env.DB.prepare('UPDATE line_groups SET is_active = 0 WHERE group_id = ?').bind(groupId).run();
    return c.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/line-groups error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { lineGroupsRoute };
