import { Hono } from 'hono';
import {
  getStaffMembers,
  getStaffById,
  createStaffMember,
  updateStaffMember,
  deleteStaffMember,
  regenerateStaffApiKey,
  countActiveStaffByRole,
} from '@line-crm/db';
import type { StaffMember } from '@line-crm/db';
import { requireRole } from '../middleware/role-guard.js';
import type { Env } from '../index.js';

// ---- パスワードハッシュ (SHA-256) ----
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- JWT 署名 (HMAC-SHA256, UTF-8対応) ----
function b64urlEncodeStr(str: string): string {
  // JSON文字列をUTF-8バイト列としてbase64url化（非ASCII文字に対応）
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64urlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const headerB64 = b64urlEncodeStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = b64urlEncodeStr(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64urlEncodeBytes(new Uint8Array(sigBuffer))}`;
}

interface StaffAccount {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'staff';
  assigned_stores: string | null;
  assigned_tags: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

const staff = new Hono<Env>();

function maskApiKey(key: string): string {
  return `lh_****${key.slice(-4)}`;
}

function serializeStaff(row: StaffMember, masked = true) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    apiKey: masked ? maskApiKey(row.api_key) : row.api_key,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/staff/me — any authenticated user (MUST be before /:id)
staff.get('/api/staff/me', async (c) => {
  try {
    const currentStaff = c.get('staff');

    // env-owner: return minimal info
    if (currentStaff.id === 'env-owner') {
      return c.json({
        success: true,
        data: {
          id: 'env-owner',
          name: 'Owner',
          role: 'owner',
          email: null,
        },
      });
    }

    const member = await getStaffById(c.env.DB, currentStaff.id);
    if (!member) {
      return c.json({ success: false, error: 'Staff member not found' }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: member.id,
        name: member.name,
        role: member.role,
        email: member.email,
      },
    });
  } catch (err) {
    console.error('GET /api/staff/me error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== staff_accounts CRUD — must be BEFORE /api/staff/:id to avoid route collision ==========

// GET /api/staff/accounts — admin または owner のみ
staff.get('/api/staff/accounts', requireRole('admin', 'owner'), async (c) => {
  try {
    const accounts = await c.env.DB.prepare(
      `SELECT id, email, name, role, assigned_stores, assigned_tags, is_active, created_at FROM staff_accounts ORDER BY created_at ASC`
    ).all<{ id: string; email: string; name: string; role: string; assigned_stores: string | null; assigned_tags: string | null; is_active: number; created_at: string }>();
    return c.json({
      success: true,
      data: accounts.results.map(a => ({
        ...a,
        assignedStores: a.assigned_stores ? JSON.parse(a.assigned_stores) : [],
        assignedTags: a.assigned_tags ? JSON.parse(a.assigned_tags) : [],
        isActive: Boolean(a.is_active),
      })),
    });
  } catch (err) {
    console.error('GET /api/staff/accounts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/staff/accounts
staff.post('/api/staff/accounts', requireRole('admin', 'owner'), async (c) => {
  try {
    const body = await c.req.json<{ email: string; password: string; name: string; role?: 'admin' | 'staff'; assignedStores?: string[]; assignedTags?: string[] }>();
    if (!body.email || !body.password || !body.name) {
      return c.json({ success: false, error: 'email, password, name required' }, 400);
    }
    const data = new TextEncoder().encode(body.password);
    const buf = await crypto.subtle.digest('SHA-256', data);
    const passwordHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    const id = crypto.randomUUID();
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T');
    await c.env.DB.prepare(
      `INSERT INTO staff_accounts (id, email, password_hash, name, role, assigned_stores, assigned_tags, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(id, body.email, passwordHash, body.name, body.role ?? 'staff',
      body.assignedStores ? JSON.stringify(body.assignedStores) : null,
      body.assignedTags ? JSON.stringify(body.assignedTags) : '[]',
      now, now
    ).run();
    return c.json({ success: true, data: { id, email: body.email, name: body.name, role: body.role ?? 'staff' } }, 201);
  } catch (err: unknown) {
    const msg = String(err);
    if (msg.includes('UNIQUE')) return c.json({ success: false, error: 'このメールアドレスは既に使用されています' }, 409);
    console.error('POST /api/staff/accounts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/staff/accounts/:id
staff.patch('/api/staff/accounts/:id', requireRole('admin', 'owner'), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; email?: string; role?: 'admin' | 'staff'; assignedStores?: string[]; assignedTags?: string[]; isActive?: boolean; password?: string }>();
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name); }
    if (body.email !== undefined) { sets.push('email = ?'); vals.push(body.email); }
    if (body.role !== undefined) { sets.push('role = ?'); vals.push(body.role); }
    if (body.assignedStores !== undefined) { sets.push('assigned_stores = ?'); vals.push(JSON.stringify(body.assignedStores)); }
    if (body.assignedTags !== undefined) { sets.push('assigned_tags = ?'); vals.push(JSON.stringify(body.assignedTags)); }
    if (body.isActive !== undefined) { sets.push('is_active = ?'); vals.push(body.isActive ? 1 : 0); }
    if (body.password) {
      const data = new TextEncoder().encode(body.password);
      const buf = await crypto.subtle.digest('SHA-256', data);
      const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      sets.push('password_hash = ?'); vals.push(hash);
    }
    if (sets.length === 0) return c.json({ success: false, error: 'No fields to update' }, 400);
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T');
    sets.push('updated_at = ?'); vals.push(now);
    vals.push(id);
    await c.env.DB.prepare(`UPDATE staff_accounts SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PATCH /api/staff/accounts/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/staff/accounts/:id
staff.delete('/api/staff/accounts/:id', requireRole('admin', 'owner'), async (c) => {
  try {
    await c.env.DB.prepare(`DELETE FROM staff_accounts WHERE id = ?`).bind(c.req.param('id')).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/staff/accounts/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/staff — owner only. List all staff with masked API keys.
staff.get('/api/staff', requireRole('owner'), async (c) => {
  try {
    const members = await getStaffMembers(c.env.DB);
    return c.json({ success: true, data: members.map((m) => serializeStaff(m, true)) });
  } catch (err) {
    console.error('GET /api/staff error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/staff/:id — owner only. Get staff detail with masked key.
staff.get('/api/staff/:id', requireRole('owner'), async (c) => {
  try {
    const id = c.req.param('id')!;
    const member = await getStaffById(c.env.DB, id);
    if (!member) {
      return c.json({ success: false, error: 'Staff member not found' }, 404);
    }
    return c.json({ success: true, data: serializeStaff(member, true) });
  } catch (err) {
    console.error('GET /api/staff/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/staff — owner only. Create staff. Returns full API key (one-time visible).
staff.post('/api/staff', requireRole('owner'), async (c) => {
  try {
    const body = await c.req.json<{ name: string; email?: string; role: string }>();

    if (!body.name) {
      return c.json({ success: false, error: 'name is required' }, 400);
    }

    const validRoles = ['owner', 'admin', 'staff'] as const;
    if (!body.role || !validRoles.includes(body.role as (typeof validRoles)[number])) {
      return c.json({ success: false, error: 'role must be owner, admin, or staff' }, 400);
    }

    const member = await createStaffMember(c.env.DB, {
      name: body.name,
      email: body.email ?? null,
      role: body.role as 'owner' | 'admin' | 'staff',
    });

    // Return full (unmasked) API key one-time
    return c.json({ success: true, data: serializeStaff(member, false) }, 201);
  } catch (err) {
    console.error('POST /api/staff error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/staff/:id — owner only. Update staff.
staff.patch('/api/staff/:id', requireRole('owner'), async (c) => {
  try {
    const id = c.req.param('id')!;
    const body = await c.req.json<{
      name?: string;
      email?: string | null;
      role?: string;
      isActive?: boolean;
    }>();

    const validRoles = ['owner', 'admin', 'staff'] as const;
    if (body.role !== undefined && !validRoles.includes(body.role as (typeof validRoles)[number])) {
      return c.json({ success: false, error: 'role must be owner, admin, or staff' }, 400);
    }

    // Prevent removing the last active owner
    const target = await getStaffById(c.env.DB, id);
    if (!target) {
      return c.json({ success: false, error: 'Staff member not found' }, 404);
    }
    if (target.role === 'owner' && target.is_active === 1) {
      const willLoseOwner =
        (body.role !== undefined && body.role !== 'owner') ||
        body.isActive === false;
      if (willLoseOwner) {
        const ownerCount = await countActiveStaffByRole(c.env.DB, 'owner');
        if (ownerCount <= 1) {
          return c.json({ success: false, error: 'オーナーは最低1人必要です' }, 400);
        }
      }
    }

    const updated = await updateStaffMember(c.env.DB, id, {
      name: body.name,
      email: body.email,
      role: body.role as 'owner' | 'admin' | 'staff' | undefined,
      is_active: body.isActive !== undefined ? (body.isActive ? 1 : 0) : undefined,
    });

    if (!updated) {
      return c.json({ success: false, error: 'Staff member not found' }, 404);
    }

    return c.json({ success: true, data: serializeStaff(updated, true) });
  } catch (err) {
    console.error('PATCH /api/staff/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/staff/:id — owner only. Cannot delete self. Must keep at least 1 owner.
staff.delete('/api/staff/:id', requireRole('owner'), async (c) => {
  try {
    const id = c.req.param('id')!;
    const currentStaff = c.get('staff');

    if (id === currentStaff.id) {
      return c.json({ success: false, error: '自分自身は削除できません' }, 400);
    }

    const target = await getStaffById(c.env.DB, id);
    if (!target) {
      return c.json({ success: false, error: 'Staff member not found' }, 404);
    }

    if (target.role === 'owner' && target.is_active === 1) {
      const ownerCount = await countActiveStaffByRole(c.env.DB, 'owner');
      if (ownerCount <= 1) {
        return c.json({ success: false, error: 'オーナーは最低1人必要です' }, 400);
      }
    }

    await deleteStaffMember(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/staff/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/staff/:id/regenerate-key — owner only. Return new API key.
staff.post('/api/staff/:id/regenerate-key', requireRole('owner'), async (c) => {
  try {
    const id = c.req.param('id')!;
    const exists = await getStaffById(c.env.DB, id);
    if (!exists) {
      return c.json({ success: false, error: 'Staff member not found' }, 404);
    }
    const newKey = await regenerateStaffApiKey(c.env.DB, id);
    return c.json({ success: true, data: { apiKey: newKey } });
  } catch (err) {
    console.error('POST /api/staff/:id/regenerate-key error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== staff_accounts (email+password+JWT) ==========

// POST /api/staff/login — 認証不要
staff.post('/api/staff/login', async (c) => {
  try {
    const { email, password } = await c.req.json<{ email: string; password: string }>();
    if (!email || !password) return c.json({ success: false, error: 'email and password required' }, 400);

    const account = await c.env.DB.prepare(
      `SELECT * FROM staff_accounts WHERE email = ? AND is_active = 1`
    ).bind(email).first<StaffAccount>();

    if (!account) return c.json({ success: false, error: 'メールアドレスまたはパスワードが正しくありません' }, 401);

    const inputHash = await hashPassword(password);
    if (inputHash !== account.password_hash) {
      return c.json({ success: false, error: 'メールアドレスまたはパスワードが正しくありません' }, 401);
    }

    const secret = c.env.JWT_SECRET ?? 'fallback-secret';
    const assignedStores: string[] = account.assigned_stores ? JSON.parse(account.assigned_stores) : [];
    const assignedTags: string[] = account.assigned_tags ? JSON.parse(account.assigned_tags) : [];
    const payload = {
      sub: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      assignedStores,
      assignedTags,
      exp: Math.floor(Date.now() / 1000) + 86400 * 7, // 7日間
    };
    const token = await signJWT(payload, secret);

    return c.json({
      success: true,
      data: { token, staff: { id: account.id, name: account.name, role: account.role, assignedStores, assignedTags } },
    });
  } catch (err) {
    console.error('POST /api/staff/login error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/staff/refresh-token — 残り1日以内なら新トークンを発行
staff.get('/api/staff/refresh-token', async (c) => {
  try {
    const staffInfo = c.get('staff');
    if (!staffInfo?.id) return c.json({ success: false, error: 'Unauthorized' }, 401);

    const account = await c.env.DB
      .prepare(`SELECT id, email, name, role, assigned_stores, assigned_tags FROM staff_accounts WHERE id = ? AND is_active = 1`)
      .bind(staffInfo.id)
      .first<{ id: string; email: string; name: string; role: string; assigned_stores: string | null; assigned_tags: string | null }>();
    if (!account) return c.json({ success: false, error: 'Account not found' }, 404);

    const secret = c.env.JWT_SECRET ?? 'fallback-secret';
    const assignedStores: string[] = account.assigned_stores ? JSON.parse(account.assigned_stores) : [];
    const assignedTags: string[] = account.assigned_tags ? JSON.parse(account.assigned_tags) : [];
    const payload = {
      sub: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      assignedStores,
      assignedTags,
      exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    };
    const token = await signJWT(payload, secret);
    return c.json({ success: true, data: { token } });
  } catch (err) {
    console.error('GET /api/staff/refresh-token error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/staff/logout — クライアント側でトークンを削除するだけ
staff.post('/api/staff/logout', async (c) => {
  return c.json({ success: true, data: null });
});

export { staff };
