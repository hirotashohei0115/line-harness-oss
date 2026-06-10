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

    // スタッフのフィルタリング（店舗 OR タグ）
    const currentStaff = c.get('staff');
    const assignedStores = currentStaff?.assignedStores ?? [];
    const assignedTags = currentStaff?.assignedTags ?? [];
    const isFiltered = (assignedStores.length > 0 || assignedTags.length > 0)
      && currentStaff?.role !== 'owner' && currentStaff?.role !== 'admin';

    // JOIN friends and staff_pins (per-staff pin state)
    const staffId = currentStaff?.id ?? 'env-owner';
    let sql = `SELECT c.*, f.display_name, f.picture_url, f.line_user_id, f.contact_mark_id,
                 CASE WHEN sp.friend_id IS NOT NULL THEN 1 ELSE 0 END as is_pinned,
                 sp.pinned_at,
                 (SELECT COUNT(*) FROM messages_log ml WHERE ml.friend_id = c.friend_id AND ml.direction = 'incoming' AND ml.is_read = 0) as unread_count
               FROM chats c
               LEFT JOIN friends f ON c.friend_id = f.id
               LEFT JOIN staff_pins sp ON sp.friend_id = c.friend_id AND sp.staff_id = ?`;
    const bindings: unknown[] = [staffId];
    const conditions: string[] = [];

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
    if (isFiltered) {
      const subQueries: string[] = [];

      // --- 店舗フィルタ ---
      if (assignedStores.length > 0) {
        const storeNames = assignedStores;
        const STORE_NAME_TO_KEY: Record<string, string> = {
          '五反田店': 'gotanda', '錦糸町店': 'kinshicho', '成田店': 'narita',
          '幕張店': 'makuhari', '菖蒲店': 'shobu', '岐阜店': 'gifu',
          '宇都宮店': 'utsunomiya', '青森店': 'aomori', '盛岡店': 'morioka',
          '大分店': 'oita', '木津川店': 'kizugawa', '長岡店': 'nagaoka',
        };
        const storeKeys = storeNames.map(n => STORE_NAME_TO_KEY[n]).filter(Boolean);
        const namePH = storeNames.map(() => '?').join(',');

        if (storeKeys.length > 0) {
          const keyPH = storeKeys.map(() => '?').join(',');
          subQueries.push(`SELECT DISTINCT friend_id FROM store_reservations WHERE store_key IN (${keyPH})`);
          storeKeys.forEach(k => bindings.push(k));
        }
        const mailLikeClauses = storeNames.map(() => 'delivery_store LIKE ?').join(' OR ');
        subQueries.push(`SELECT DISTINCT friend_id FROM mail_orders WHERE (${mailLikeClauses})`);
        storeNames.forEach(s => bindings.push(`%${s}%`));
        subQueries.push(`SELECT DISTINCT friend_id FROM friend_attributes WHERE key = 'repair_store' AND value IN (${namePH})`);
        storeNames.forEach(s => bindings.push(s));
      }

      // --- タグフィルタ ---
      if (assignedTags.length > 0) {
        const tagPH = assignedTags.map(() => '?').join(',');
        subQueries.push(`SELECT DISTINCT ft.friend_id FROM friend_tags ft JOIN tags t ON t.id = ft.tag_id WHERE t.name IN (${tagPH})`);
        assignedTags.forEach(t => bindings.push(t));
      }

      conditions.push(`c.friend_id IN (${subQueries.join(' UNION ')})`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY CASE WHEN sp.friend_id IS NOT NULL THEN 1 ELSE 0 END DESC, sp.pinned_at DESC, c.last_message_at DESC';

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
    const currentStaff = c.get('staff');
    const assignedStores2 = currentStaff?.assignedStores ?? [];
    const assignedTags2 = currentStaff?.assignedTags ?? [];
    const isFiltered2 = (assignedStores2.length > 0 || assignedTags2.length > 0)
      && currentStaff?.role !== 'owner' && currentStaff?.role !== 'admin';

    // Count distinct chats with unread — same filtering as GET /api/chats
    const conditions: string[] = [
      `(SELECT COUNT(*) FROM messages_log ml WHERE ml.friend_id = ch.friend_id AND ml.direction = 'incoming' AND ml.is_read = 0) > 0`,
    ];
    const bindings: unknown[] = [];

    if (lineAccountId) {
      conditions.push('f.line_account_id = ?');
      bindings.push(lineAccountId);
    }

    if (isFiltered2) {
      const subQueries: string[] = [];

      if (assignedStores2.length > 0) {
        const storeNames = assignedStores2;
        const STORE_NAME_TO_KEY: Record<string, string> = {
          '五反田店': 'gotanda', '錦糸町店': 'kinshicho', '成田店': 'narita',
          '幕張店': 'makuhari', '菖蒲店': 'shobu', '岐阜店': 'gifu',
          '宇都宮店': 'utsunomiya', '青森店': 'aomori', '盛岡店': 'morioka',
          '大分店': 'oita', '木津川店': 'kizugawa', '長岡店': 'nagaoka',
        };
        const storeKeys = storeNames.map(n => STORE_NAME_TO_KEY[n]).filter(Boolean);
        const namePH = storeNames.map(() => '?').join(',');
        if (storeKeys.length > 0) {
          const keyPH = storeKeys.map(() => '?').join(',');
          subQueries.push(`SELECT DISTINCT friend_id FROM store_reservations WHERE store_key IN (${keyPH})`);
          storeKeys.forEach(k => bindings.push(k));
        }
        const mailLikeClauses = storeNames.map(() => 'delivery_store LIKE ?').join(' OR ');
        subQueries.push(`SELECT DISTINCT friend_id FROM mail_orders WHERE (${mailLikeClauses})`);
        storeNames.forEach(s => bindings.push(`%${s}%`));
        subQueries.push(`SELECT DISTINCT friend_id FROM friend_attributes WHERE key = 'repair_store' AND value IN (${namePH})`);
        storeNames.forEach(s => bindings.push(s));
      }

      if (assignedTags2.length > 0) {
        const tagPH = assignedTags2.map(() => '?').join(',');
        subQueries.push(`SELECT DISTINCT ft.friend_id FROM friend_tags ft JOIN tags t ON t.id = ft.tag_id WHERE t.name IN (${tagPH})`);
        assignedTags2.forEach(t => bindings.push(t));
      }

      conditions.push(`ch.friend_id IN (${subQueries.join(' UNION ')})`);
    }

    const sql = `
      SELECT COUNT(DISTINCT ch.friend_id) as count
      FROM chats ch
      JOIN friends f ON f.id = ch.friend_id
      WHERE ${conditions.join(' AND ')}
    `;
    const row = await (bindings.length > 0
      ? c.env.DB.prepare(sql).bind(...bindings)
      : c.env.DB.prepare(sql)
    ).first<{ count: number }>();

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
      .prepare(`SELECT id, friend_id, direction, message_type, content, sent_by_staff_name, created_at FROM messages_log WHERE friend_id = ? ORDER BY created_at DESC LIMIT 200`)
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
          sentByStaffName: m.sent_by_staff_name ?? null,
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

    // メッセージIDを先に確定（base64画像はURLに埋め込むため）
    const logId = crypto.randomUUID();

    if (messageType === 'text') {
      await lineClient.pushTextMessage(friend.line_user_id, body.content);
    } else if (messageType === 'flex') {
      const contents = JSON.parse(body.content);
      await lineClient.pushFlexMessage(friend.line_user_id, extractFlexAltText(contents), contents);
    } else if (messageType === 'image') {
      const isBase64 = body.content.startsWith('data:image/');
      if (isBase64) {
        // Worker経由で画像を配信するURLを生成してLINEに送信
        const workerOrigin = c.env.WORKER_URL || new URL(c.req.url).origin;
        const imageUrl = `${workerOrigin}/api/images/${logId}`;
        await lineClient.pushMessage(friend.line_user_id, [{
          type: 'image',
          originalContentUrl: imageUrl,
          previewImageUrl: imageUrl,
        }]);
      } else {
        // 外部URL（HTTPS）の場合は直接LINE画像メッセージとして送信
        await lineClient.pushMessage(friend.line_user_id, [{
          type: 'image',
          originalContentUrl: body.content,
          previewImageUrl: body.content,
        }]);
      }
    } else if (messageType === 'file') {
      const workerOrigin = c.env.WORKER_URL || new URL(c.req.url).origin;
      const fileUrl = `${workerOrigin}/api/files/${logId}`;
      const textMsg = `📄 PDFファイルが送信されました。\n下記URLよりご確認ください。\n${fileUrl}`;
      await lineClient.pushTextMessage(friend.line_user_id, textMsg);
    } else {
      await lineClient.pushTextMessage(friend.line_user_id, body.content);
    }

    // メッセージログに記録
    const sendingStaff = c.get('staff');
    await c.env.DB
      .prepare(`INSERT INTO messages_log (id, friend_id, direction, message_type, content, sent_by_staff_id, sent_by_staff_name, created_at) VALUES (?, ?, 'outgoing', ?, ?, ?, ?, ?)`)
      .bind(logId, friend.id, messageType, body.content, sendingStaff?.id ?? null, sendingStaff?.name ?? null, jstNow())
      .run();

    // チャットの最終メッセージ日時を更新
    await updateChat(c.env.DB, chatId, { status: 'in_progress', lastMessageAt: jstNow() });

    return c.json({ success: true, data: { sent: true, messageId: logId } });
  } catch (err) {
    console.error('POST /api/chats/:id/send error:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('LINE API error:')) {
      const match = errMsg.match(/— (.+)$/);
      const lineBody = match ? match[1] : errMsg;
      try {
        const parsed = JSON.parse(lineBody) as { message?: string; details?: { message: string }[] };
        const detail = parsed.details?.[0]?.message;
        const msg = detail ? `LINE送信エラー: ${parsed.message} — ${detail}` : `LINE送信エラー: ${parsed.message ?? lineBody}`;
        return c.json({ success: false, error: msg }, 400);
      } catch {
        return c.json({ success: false, error: `LINE送信エラー: ${lineBody}` }, 400);
      }
    }
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/images/upload — authenticated, stores base64 image and returns public URL
chats.post('/api/images/upload', async (c) => {
  try {
    const body = await c.req.json<{ image: string }>();
    if (!body.image || !body.image.startsWith('data:image/')) {
      return c.json({ success: false, error: 'Invalid image data' }, 400);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB
      .prepare('INSERT INTO uploaded_images (id, content, created_at) VALUES (?, ?, ?)')
      .bind(id, body.image, now)
      .run();
    const origin = new URL(c.req.url).origin;
    return c.json({ success: true, url: `${origin}/api/images/${id}` }, 201);
  } catch (err) {
    console.error('POST /api/images/upload error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/images/:messageId — public, serves base64 image as binary (messages_log or uploaded_images)
chats.get('/api/images/:messageId', async (c) => {
  const messageId = c.req.param('messageId');

  // Check messages_log first
  const row = await c.env.DB
    .prepare('SELECT content, message_type FROM messages_log WHERE id = ? LIMIT 1')
    .bind(messageId)
    .first<{ content: string; message_type: string }>();

  let base64Content: string | null = null;
  if (row && row.message_type === 'image' && row.content.startsWith('data:image/')) {
    base64Content = row.content;
  } else {
    // Fallback: check uploaded_images
    const uploaded = await c.env.DB
      .prepare('SELECT content FROM uploaded_images WHERE id = ? LIMIT 1')
      .bind(messageId)
      .first<{ content: string }>();
    if (uploaded && uploaded.content.startsWith('data:image/')) {
      base64Content = uploaded.content;
    }
  }

  if (!base64Content) return c.json({ error: 'Not found' }, 404);

  const commaIdx = base64Content.indexOf(',');
  const header = base64Content.slice(0, commaIdx);
  const base64Data = base64Content.slice(commaIdx + 1);
  const mimeType = header.split(':')[1]?.split(';')[0] ?? 'image/jpeg';

  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return new Response(bytes, {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// GET /api/files/:id — public, serves base64 PDF as binary
chats.get('/api/files/:id', async (c) => {
  const messageId = c.req.param('id');

  const row = await c.env.DB
    .prepare('SELECT content, message_type FROM messages_log WHERE id = ? LIMIT 1')
    .bind(messageId)
    .first<{ content: string; message_type: string }>();

  if (!row || row.message_type !== 'file' || !row.content.startsWith('data:application/pdf')) {
    return c.json({ error: 'Not found' }, 404);
  }

  const commaIdx = row.content.indexOf(',');
  const base64Data = row.content.slice(commaIdx + 1);

  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="file.pdf"',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

export { chats };
