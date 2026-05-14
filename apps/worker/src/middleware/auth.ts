import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { getStaffByApiKey } from '@line-crm/db';
import type { Env } from '../index.js';

interface StaffAccountJWT {
  sub: string;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  assignedStores?: string[];
  exp: number;
}

export async function authMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  const path = new URL(c.req.url).pathname;
  if (
    path === '/webhook' ||
    path === '/docs' ||
    path === '/openapi.json' ||
    path === '/api/affiliates/click' ||
    path === '/api/staff/login' ||
    path.startsWith('/t/') ||
    path.startsWith('/r/') ||
    path.startsWith('/api/liff/') ||
    path === '/api/repair/mail-orders' ||
    path.startsWith('/api/repair/mail-orders/') ||
    path.startsWith('/auth/') ||
    path === '/api/integrations/stripe/webhook' ||
    path.match(/^\/api\/webhooks\/incoming\/[^/]+\/receive$/) ||
    path.match(/^\/api\/forms\/[^/]+\/submit$/) ||
    path.match(/^\/api\/forms\/[^/]+$/) ||
    path.match(/^\/api\/messages\/[^/]+\/content$/)
  ) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice('Bearer '.length);

  // 1) JWT from staff_accounts (email+password login)
  const secret = c.env.JWT_SECRET ?? 'fallback-secret';
  try {
    const payload = await verify(token, secret) as StaffAccountJWT;
    if (payload?.sub && payload?.role) {
      c.set('staff', {
        id: payload.sub,
        name: payload.name,
        role: payload.role as 'admin' | 'staff',
        assignedStores: payload.assignedStores,
      });
      return next();
    }
  } catch { /* not a JWT — fall through to API key check */ }

  // 2) API key from staff_members table (backward compat)
  const staffMember = await getStaffByApiKey(c.env.DB, token);
  if (staffMember) {
    c.set('staff', { id: staffMember.id, name: staffMember.name, role: staffMember.role });
    return next();
  }

  // 3) Env API_KEY fallback (owner)
  if (token === c.env.API_KEY) {
    c.set('staff', { id: 'env-owner', name: 'Owner', role: 'owner' as const });
    return next();
  }

  return c.json({ success: false, error: 'Unauthorized' }, 401);
}
