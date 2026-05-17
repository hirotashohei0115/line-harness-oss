import { Hono } from 'hono';
import { extractFlexAltText } from '../utils/flex-alt-text.js';
import {
  getOperators,
  getOperatorById,
  createOperator,
  updateOperator,
  deleteOperator,
  getChats,
  getChatById,
  createChat,
  updateChat,
  jstNow,
} from '@line-crm/db';
import type { Env } from '../index.js';

const chats = new Hono<Env>();

// ========== オペレーターCRUD ==========

chats.get('/api/operators', async (c) => {
  try {
    const items = await getOperators(c.env.DB);
    return c.json({
      success: true,
      data: items.map((o) => ({
        id: o.id,
        name: o.name,
        email: o.email,
        role: o.role,
        isActive: Boolean(o.is_active),
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/operators error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

chats.post('/api/operators', async (c) => {
  try {
    const body = await c.req.json<{ name: string; email: string; role?: string }>();
    if (!body.name || !body.email) return c.json({ success: false, error: 'name and email are required' }, 400);
    const item = await createOperator(c.env.DB, body);
    return c.json({ success: true, data: { id: item.id, name: item.name, email: item.email, role: item.role } }, 201);
  } catch (err) {
    console.error('POST /api/operators error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

chats.put('/api/operators/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    await updateOperator(c.env.DB, id, body);
    const updated = await getOperatorById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, isActive: Boolean(updated.is_active) } });
  } catch (err) {
    console.error('PUT /api/operators/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

chats.delete('/api/operators/:id', async (c) => {
  try {
    await deleteOperator(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/operators/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== チャットCRUD ==========

chats.get('/api/chats', async (c) => {
  try {
    const status = c.req.query('status') ?? undefined;
    const operatorId = c.req.query('operatorId') ?? undefined;
    const lineAccountId = c.req.query('lineAccountId') ?? undefined;
    const unreadOnly = c.req.query('unread') === 'true';

    // スタッフの担当店舗フィルタリング
    const currentStaff = c.get('staff');
    const assignedStores = currentStaff?.assignedStores;
    const isStoreFiltered = assignedStores && assignedStores.length > 0 && currentStaff?.role !== 'owner' && currentStaff?.role !== 'admin';

    // JOIN friends to get display_name and picture_url, plus unread message count
    let sql = `SELECT c.*, f.display_name, f.picture_url, f.line_user_id, f.contact_mark_id, f.is_pinned, f.pinned_at,
                 (SELECT COUNT(*) FROM messages_log ml WHERE ml.friend_id = c.friend_id AND ml.direction = 'incoming' AND ml.is_read = 0) as unread_count
               FROM chats c
               LEFT JOIN friends f ON c.friend_id = f.id`;
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (unreadOnly) {
      conditions.push('(SELECT COUNT(*) FROM messages_log ml WHERE ml.friend_id = c.friend_id AND ml.direction = \'incoming\' AND ml.is_read = 0) > 0');
    }
    if (status) {
      conditions.push('c.status = ?');
      bindings.push(status);
    }
    if (operatorId) {
      conditions.push('c.operator_id = ?');
      bindings.push(operatorId);
    }
    if (lineAccountId) {
      conditions.push('f.line_account_id = ?');
      bindings.push(lineAccountId);
    }
    if (isStoreFiltered) {
      const storeNames = assignedStores!;
      // store_reservations uses short keys (gotanda, kinshicho...), map from store names
      const STORE_NAME_TO_KEY: Record<string, string> = {
        '五反田店': 'gotanda', '錦糸町店': 'kinshicho', '成田店': 'narita',
        '幕張店': 'makuhari', '菖蒲店': 'shobu', '岐阜店': 'gifu',
        '宇都宮店': 'utsunomiya', '青森店': 'aomori', '盛岡店': 'morioka',
        '大分店': 'oita', '木津川店': 'kizugawa', '長岡店': 'nagaoka',
      };
      const storeKeys = storeNames.map(n => STORE_NAME_TO_KEY[n]).filter(Boolean);

      const namePH = storeNames.map(() => '?').join(',');
      const subQueries: string[] = [];

      // 1. store_reservations (store_key)
      if (storeKeys.length > 0) {
        const keyPH = storeKeys.map(() => '?').join(',');
        subQueries.push(`SELECT DISTINCT friend_id FROM store_reservations WHERE store_key IN (${keyPH})`);
        storeKeys.forEach(k => bindings.push(k));
      }

      // 2. mail_orders (delivery_store = 日本語店舗名)
      subQueries.push(`SELECT DISTINCT friend_id FROM mail_orders WHERE delivery_store IN (${namePH})`);
      storeNames.forEach(s => bindings.push(s));

      // 3. friend_attributes repair_store (store selection in chat/repair flow)
      subQueries.push(`SELECT DISTINCT friend_id FROM friend_attributes WHERE key = 'repair_store' AND value IN (${namePH})`);
      storeNames.forEach(s => bindings.push(s));

      conditions.push(`c.friend_id IN (${subQueries.join(' UNION ')})`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY COALESCE(f.is_pinned, 0) DESC, f.pinned_at DESC, c.last_message_at DESC';

    const stmt = bindings.length > 0
      ? c.env.DB.prepare(sql).bind(...bindings)
      : c.env.DB.prepare(sql);
    const result = await stmt.all();

    return c.json({
      success: true,
      data: result.results.map((ch: Record<string, unknown>) => ({
        id: ch.id,
        friendId: ch.friend_id,
        friendName: ch.display_name || '名前なし',
        friendPictureUrl: ch.picture_url || null,
        operatorId: ch.operator_id,
        status: ch.status,
        notes: ch.notes,
        lastMessageAt: ch.last_message_at,
        createdAt: ch.created_at,
        updatedAt: ch.updated_at,
        contactMarkId: (ch as unknown as Record<string, unknown>).contact_mark_id as string | null ?? null,
        isPinned: Boolean((ch as Record<string, unknown>).is_pinned),
        pinnedAt: (ch as Record<string, unknown>).pinned_at as string | null,
        unreadCount: Number((ch as Record<string, unknown>).unread_count ?? 0),
      })),
    });
  } catch (err) {
    console.error('GET /api/chats error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// LINEコンテンツAPIプロキシ — 画像・動画・音声バイナリを返す（img src で直接使用可能）
chats.get('/api/messages/:messageId/content', async (c) => {
  try {
    const messageId = c.req.param('messageId');
    // マルチアカウント: DBのアカウントを順に試す（最初に成功したものを使用）
    const accounts = await c.env.DB.prepare(`SELECT channel_access_token FROM line_accounts WHERE is_active = 1`).all<{ channel_access_token: string }>();
    const tokens = [c.env.LINE_CHANNEL_ACCESS_TOKEN, ...accounts.results.map(a => a.channel_access_token)];
    let lineRes: Response | null = null;
    for (const token of tokens) {
      const r = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (r.ok) { lineRes = r; break; }
    }
    if (!lineRes || !lineRes.ok) return c.json({ success: false, error: 'Content not found' }, 404);
    const contentType = lineRes.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await lineRes.arrayBuffer();
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('GET /api/messages/:messageId/content error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Must be before /:id
chats.get('/api/chats/unread-count', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    let row: { count: number } | null;
    if (lineAccountId) {
      row = await c.env.DB
        .prepare(`SELECT COUNT(*) as count FROM messages_log ml JOIN friends f ON ml.friend_id = f.id WHERE ml.is_read = 0 AND ml.direction = 'incoming' AND f.line_account_id = ?`)
        .bind(lineAccountId).first<{ count: number }>();
    } else {
      row = await c.env.DB
        .prepare(`SELECT COUNT(*) as count FROM messages_log WHERE is_read = 0 AND direction = 'incoming'`)
        .first<{ count: number }>();
    }
    return c.json({ success: true, data: { count: row?.count ?? 0 } });
  } catch (err) {
    console.error('GET /api/chats/unread-count error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/chats/:id/read-all — manually mark all incoming messages as read
chats.post('/api/chats/:id/read-all', async (c) => {
  try {
    const item = await getChatById(c.env.DB, c.req.param('id'));
    if (!item) return c.json({ success: false, error: 'Chat not found' }, 404);
    await c.env.DB
      .prepare(`UPDATE messages_log SET is_read = 1 WHERE friend_id = ? AND direction = 'incoming' AND is_read = 0`)
      .bind(item.friend_id).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('POST /api/chats/:id/read-all error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

chats.get('/api/chats/:id', async (c) => {
  try {
    const item = await getChatById(c.env.DB, c.req.param('id'));
    if (!item) return c.json({ success: false, error: 'Chat not found' }, 404);

    // 友だち情報を取得
    const friend = await c.env.DB
      .prepare(`SELECT display_name, picture_url, line_user_id FROM friends WHERE id = ?`)
      .bind(item.friend_id)
      .first<{ display_name: string | null; picture_url: string | null; line_user_id: string }>();

    // チャットに関連するメッセージログも取得（最新200件をDESCで取得し、ASCに反転して返す）
    const messages = await c.env.DB
      .prepare(`SELECT id, friend_id, direction, message_type, content, created_at FROM messages_log WHERE friend_id = ? ORDER BY created_at DESC LIMIT 200`)
      .bind(item.friend_id)
      .all();
    const messagesAsc = (messages.results as Record<string, unknown>[]).slice().reverse();

    return c.json({
      success: true,
      data: {
        id: item.id,
        friendId: item.friend_id,
        friendName: friend?.display_name || '名前なし',
        friendPictureUrl: friend?.picture_url || null,
        operatorId: item.operator_id,
        status: item.status,
        notes: item.notes,
        lastMessageAt: item.last_message_at,
        createdAt: item.created_at,
        messages: messagesAsc.map((m) => ({
          id: m.id,
          direction: m.direction,
          messageType: m.message_type,
          content: m.content,
          createdAt: m.created_at,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/chats/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

chats.post('/api/chats', async (c) => {
  try {
    const body = await c.req.json<{ friendId: string; operatorId?: string; lineAccountId?: string | null }>();
    if (!body.friendId) return c.json({ success: false, error: 'friendId is required' }, 400);
    const item = await createChat(c.env.DB, body);
    // Save line_account_id if provided
    if (body.lineAccountId) {
      await c.env.DB.prepare(`UPDATE chats SET line_account_id = ? WHERE id = ?`)
        .bind(body.lineAccountId, item.id).run();
    }
    return c.json({ success: true, data: { id: item.id, friendId: item.friend_id, status: item.status } }, 201);
  } catch (err) {
    console.error('POST /api/chats error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// チャットのアサイン/ステータス更新/ノート更新
chats.put('/api/chats/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ operatorId?: string | null; status?: string; notes?: string }>();
    await updateChat(c.env.DB, id, body);
    const updated = await getChatById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({
      success: true,
      data: { id: updated.id, friendId: updated.friend_id, operatorId: updated.operator_id, status: updated.status, notes: updated.notes },
    });
  } catch (err) {
    console.error('PUT /api/chats/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// オペレーターからメッセージ送信
chats.post('/api/chats/:id/send', async (c) => {
  try {
    const chatId = c.req.param('id');
    const chat = await getChatById(c.env.DB, chatId);
    if (!chat) return c.json({ success: false, error: 'Chat not found' }, 404);

    const body = await c.req.json<{ messageType?: string; content: string }>();
    if (!body.content) return c.json({ success: false, error: 'content is required' }, 400);

    const friend = await c.env.DB
      .prepare(`SELECT * FROM friends WHERE id = ?`)
      .bind(chat.friend_id)
      .first<{ id: string; line_user_id: string }>();
    if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);

    // LINE APIでメッセージ送信
    const { LineClient } = await import('@line-crm/line-sdk');
    const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
    const messageType = body.messageType ?? 'text';

    if (messageType === 'text') {
      await lineClient.pushTextMessage(friend.line_user_id, body.content);
    } else if (messageType === 'flex') {
      const contents = JSON.parse(body.content);
      await lineClient.pushFlexMessage(friend.line_user_id, extractFlexAltText(contents), contents);
    } else if (messageType === 'image') {
      await lineClient.pushMessage(friend.line_user_id, [{
        type: 'image',
        originalContentUrl: body.content,
        previewImageUrl: body.content,
      }]);
    } else {
      // Unknown type — fall back to text
      await lineClient.pushTextMessage(friend.line_user_id, body.content);
    }

    // メッセージログに記録
    const logId = crypto.randomUUID();
    await c.env.DB
      .prepare(`INSERT INTO messages_log (id, friend_id, direction, message_type, content, created_at) VALUES (?, ?, 'outgoing', ?, ?, ?)`)
      .bind(logId, friend.id, messageType, body.content, jstNow())
      .run();

    // チャットの最終メッセージ日時を更新
    await updateChat(c.env.DB, chatId, { status: 'in_progress', lastMessageAt: jstNow() });

    return c.json({ success: true, data: { sent: true, messageId: logId } });
  } catch (err) {
    console.error('POST /api/chats/:id/send error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { chats };
