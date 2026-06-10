import type { Context, Next } from 'hono';
import { getStaffByApiKey } from '@line-crm/db';
import type { Env } from '../index.js';

// Web Crypto API を使った HMAC-SHA256 JWT 検証（ライブラリ依存なし）
async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // base64url → Uint8Array
    const b64 = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
    const sigBytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(signingInput),
    );
    if (!valid) return null;

    // Decode payload (UTF-8 aware)
    const pb64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const pp = pb64.padEnd(pb64.length + (4 - (pb64.length % 4)) % 4, '=');
    const payloadBytes = Uint8Array.from(atob(pp), c => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Record<string, unknown>;

    // Check expiry
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
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
    path === '/api/contact-form' ||
    path === '/api/repair/mail-orders' ||
    path.startsWith('/api/repair/mail-orders/') ||
    path === '/api/repair/visit-orders' ||
    path === '/api/reservations/slots' ||
    (path === '/api/reservations' && c.req.method === 'POST') ||
    path.startsWith('/api/store-hours/') ||
    path.startsWith('/api/repair-info/') ||
    path.startsWith('/auth/') ||
    path === '/api/integrations/stripe/webhook' ||
    path.match(/^\/api\/webhooks\/incoming\/[^/]+\/receive$/) ||
    path.match(/^\/api\/forms\/[^/]+\/submit$/) ||
    path.match(/^\/api\/forms\/[^/]+$/) ||
    path.match(/^\/api\/messages\/[^/]+\/content$/) ||
    (path.match(/^\/api\/images\/[^/]+$/) && c.req.method === 'GET') ||
    (path.match(/^\/api\/files\/[^/]+$/) && c.req.method === 'GET')
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
  const jwtPayload = await verifyJWT(token, secret);
  if (jwtPayload?.sub && jwtPayload?.role) {
    c.set('staff', {
      id: jwtPayload.sub as string,
      name: (jwtPayload.name as string) ?? '',
      role: jwtPayload.role as 'admin' | 'staff',
      assignedStores: jwtPayload.assignedStores as string[] | undefined,
      assignedTags: jwtPayload.assignedTags as string[] | undefined,
    });
    return next();
  }

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
