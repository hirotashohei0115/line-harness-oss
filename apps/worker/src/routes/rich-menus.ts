import { Hono } from 'hono';
import { LineClient } from '@line-crm/line-sdk';
import { getFriendById } from '@line-crm/db';
import type { Env } from '../index.js';

const richMenus = new Hono<Env>();

async function getLineClient(c: { req: { query: (k: string) => string | undefined }; env: { DB: D1Database; LINE_CHANNEL_ACCESS_TOKEN: string } }): Promise<LineClient> {
  const channelId = c.req.query('channelId');
  if (channelId) {
    const account = await c.env.DB.prepare(
      'SELECT channel_access_token FROM line_accounts WHERE channel_id = ? AND is_active = 1 LIMIT 1'
    ).bind(channelId).first<{ channel_access_token: string }>();
    if (account?.channel_access_token) return new LineClient(account.channel_access_token);
  }
  return new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
}

// GET /api/rich-menus
richMenus.get('/api/rich-menus', async (c) => {
  try {
    const lineClient = await getLineClient(c);
    const result = await lineClient.getRichMenuList();
    return c.json({ success: true, data: result.richmenus ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('GET /api/rich-menus error:', message);
    return c.json({ success: false, error: `Failed to fetch rich menus: ${message}` }, 500);
  }
});

// POST /api/rich-menus
richMenus.post('/api/rich-menus', async (c) => {
  try {
    const body = await c.req.json();
    const lineClient = await getLineClient(c);
    const result = await lineClient.createRichMenu(body);
    return c.json({ success: true, data: result }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/rich-menus error:', message);
    return c.json({ success: false, error: `Failed to create rich menu: ${message}` }, 500);
  }
});

// DELETE /api/rich-menus/:id
richMenus.delete('/api/rich-menus/:id', async (c) => {
  try {
    const richMenuId = c.req.param('id');
    const lineClient = await getLineClient(c);
    await lineClient.deleteRichMenu(richMenuId);
    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('DELETE /api/rich-menus/:id error:', message);
    return c.json({ success: false, error: `Failed to delete rich menu: ${message}` }, 500);
  }
});

// GET /api/rich-menus/default
richMenus.get('/api/rich-menus/default', async (c) => {
  try {
    const lineClient = await getLineClient(c);
    const richMenuId = await lineClient.getDefaultRichMenuId();
    return c.json({ success: true, data: richMenuId ? { richMenuId } : null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

// DELETE /api/rich-menus/default (cancel default)
richMenus.delete('/api/rich-menus/default', async (c) => {
  try {
    const lineClient = await getLineClient(c);
    await lineClient.cancelDefaultRichMenu();
    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

// POST /api/rich-menus/:id/default
richMenus.post('/api/rich-menus/:id/default', async (c) => {
  try {
    const richMenuId = c.req.param('id');
    const lineClient = await getLineClient(c);
    await lineClient.setDefaultRichMenu(richMenuId);
    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/rich-menus/:id/default error:', message);
    return c.json({ success: false, error: `Failed to set default rich menu: ${message}` }, 500);
  }
});

// POST /api/rich-menus/:id/image — upload rich menu image
// Accepts: binary (image/jpeg or image/png) or JSON { image: base64DataUrl }
richMenus.post('/api/rich-menus/:id/image', async (c) => {
  try {
    const richMenuId = c.req.param('id');
    const contentType = c.req.header('content-type') ?? '';

    // Resolve LINE access token (same logic as getLineClient but we need the raw token)
    const channelIdParam = c.req.query('channelId');
    let lineToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (channelIdParam) {
      const account = await c.env.DB.prepare(
        'SELECT channel_access_token FROM line_accounts WHERE channel_id = ? AND is_active = 1 LIMIT 1'
      ).bind(channelIdParam).first<{ channel_access_token: string }>();
      if (account?.channel_access_token) lineToken = account.channel_access_token;
    }

    const lineUrl = `https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`;
    const dbgCT = c.req.header('content-type') ?? 'NONE';
    const dbgCL = c.req.header('content-length') ?? 'NONE';

    if (contentType.includes('image/')) {
      // Binary path: stream request body directly to LINE — no buffering in Worker memory
      const imageContentType = (contentType.includes('jpeg') || contentType.includes('jpg'))
        ? 'image/jpeg' : 'image/png';
      const contentLength = c.req.header('content-length');
      const forwardHeaders: Record<string, string> = {
        'Content-Type': imageContentType,
        'Authorization': `Bearer ${lineToken}`,
      };
      if (contentLength) forwardHeaders['Content-Length'] = contentLength;

      const lineRes = await fetch(lineUrl, {
        method: 'POST',
        headers: forwardHeaders,
        body: c.req.raw.body,
      });
      if (!lineRes.ok) {
        return c.json({ success: false, error: `[binary-path] ct=${dbgCT} cl=${dbgCL} LINE=${lineRes.status}` }, 500);
      }
      return c.json({ success: true, data: null });

    } else if (contentType.includes('application/json')) {
      // JSON/base64 fallback path
      const body = await c.req.json<{ image: string; contentType?: string }>();
      if (!body.image) return c.json({ success: false, error: 'image (base64) is required' }, 400);
      const mimeMatch = body.image.match(/^data:(image\/\w+);base64,/);
      const imageContentType: 'image/png' | 'image/jpeg' =
        (mimeMatch?.[1] === 'image/jpeg' || body.contentType === 'image/jpeg') ? 'image/jpeg' : 'image/png';
      const base64 = body.image.replace(/^data:image\/\w+;base64,/, '');
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

      if (bytes.byteLength > 950_000) {
        return c.json({
          success: false,
          error: `画像が大きすぎます（${Math.round(bytes.byteLength / 1024)}KB）。ページをリロード（Ctrl+Shift+R）してから再度お試しください。`,
        }, 400);
      }
      const lineRes = await fetch(lineUrl, {
        method: 'POST',
        headers: { 'Content-Type': imageContentType, 'Authorization': `Bearer ${lineToken}` },
        body: bytes.buffer,
      });
      if (!lineRes.ok) {
        const text = await lineRes.text().catch(() => '');
        return c.json({ success: false, error: `Failed to upload rich menu image: LINE API error: ${lineRes.status} ${lineRes.statusText} — ${text}` }, 500);
      }
      return c.json({ success: true, data: null });

    } else {
      return c.json({ success: false, error: 'Content-Type must be application/json or image/*' }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/rich-menus/:id/image error:', message);
    return c.json({ success: false, error: `Failed to upload rich menu image: ${message}` }, 500);
  }
});

// GET /api/rich-menu-analytics/users — list of friends who tapped a specific button
richMenus.get('/api/rich-menu-analytics/users', async (c) => {
  try {
    const db = c.env.DB;
    const channelIdParam = c.req.query('channelId');
    const label = c.req.query('label') ?? '';
    const from = c.req.query('from');
    const to = c.req.query('to');

    let sql = `
      SELECT f.id, f.display_name, f.line_user_id,
        COUNT(*) AS tap_count,
        MAX(fal.created_at) AS last_tapped
      FROM friend_action_logs fal
      JOIN friends f ON f.id = fal.friend_id
      WHERE fal.action_type = 'rich_menu_tap'
        AND fal.action_label = ?
    `;
    const binds: string[] = [label];

    if (channelIdParam) {
      sql += ` AND f.line_account_id = (SELECT id FROM line_accounts WHERE channel_id = ? AND is_active = 1 LIMIT 1)`;
      binds.push(channelIdParam);
    }
    if (from) { sql += ` AND fal.created_at >= ?`; binds.push(`${from} 00:00:00`); }
    if (to)   { sql += ` AND fal.created_at <= ?`; binds.push(`${to} 23:59:59`); }
    sql += ` GROUP BY f.id ORDER BY last_tapped DESC`;

    const rows = await db.prepare(sql).bind(...binds).all();
    return c.json({ success: true, data: rows.results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

// GET /api/rich-menu-analytics — tap counts per button label (per channel), with optional date filter
richMenus.get('/api/rich-menu-analytics', async (c) => {
  try {
    const db = c.env.DB;
    const channelIdParam = c.req.query('channelId');
    const from = c.req.query('from');
    const to = c.req.query('to');

    let sql = `
      SELECT fal.action_label,
        COUNT(DISTINCT fal.friend_id) AS unique_users,
        COUNT(*) AS total_taps,
        MAX(fal.created_at) AS last_tapped
      FROM friend_action_logs fal
      JOIN friends f ON f.id = fal.friend_id
      WHERE fal.action_type = 'rich_menu_tap'
    `;
    const binds: string[] = [];

    if (channelIdParam) {
      sql += ` AND f.line_account_id = (SELECT id FROM line_accounts WHERE channel_id = ? AND is_active = 1 LIMIT 1)`;
      binds.push(channelIdParam);
    }
    if (from) { sql += ` AND fal.created_at >= ?`; binds.push(`${from} 00:00:00`); }
    if (to)   { sql += ` AND fal.created_at <= ?`; binds.push(`${to} 23:59:59`); }
    sql += ` GROUP BY fal.action_label ORDER BY total_taps DESC`;

    const rows = await db.prepare(sql).bind(...binds).all();
    return c.json({ success: true, data: rows.results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

// POST /api/friends/:friendId/rich-menu — link rich menu to a specific friend
richMenus.post('/api/friends/:friendId/rich-menu', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const body = await c.req.json<{ richMenuId: string }>();
    if (!body.richMenuId) return c.json({ success: false, error: 'richMenuId is required' }, 400);
    const db = c.env.DB;
    const friend = await getFriendById(db, friendId);
    if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);
    const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
    await lineClient.linkRichMenuToUser(friend.line_user_id, body.richMenuId);
    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/friends/:friendId/rich-menu error:', message);
    return c.json({ success: false, error: `Failed to link rich menu to friend: ${message}` }, 500);
  }
});

// DELETE /api/friends/:friendId/rich-menu — unlink rich menu from a specific friend
richMenus.delete('/api/friends/:friendId/rich-menu', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const db = c.env.DB;
    const friend = await getFriendById(db, friendId);
    if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);
    const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
    await lineClient.unlinkRichMenuFromUser(friend.line_user_id);
    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('DELETE /api/friends/:friendId/rich-menu error:', message);
    return c.json({ success: false, error: `Failed to unlink rich menu from friend: ${message}` }, 500);
  }
});

export { richMenus };
