# MacBook Repair Quote Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a MacBook repair quote flow to the LINE CRM — DB schema, seed data, REST API routes, and a LINE webhook bot flow with Flex Message buttons.

**Architecture:** New tables (`repair_products`, `repair_models`, `repair_symptoms`, `repair_prices`, `repair_quotes`, `friend_attributes`) added to D1 schema. DB helpers live in `packages/db/src/repair.ts`, exported via the package index. A new Hono route file `apps/worker/src/routes/repair.ts` exposes REST endpoints. The webhook handler in `routes/webhook.ts` is extended with `postback` event handling and updated `follow`/`message` logic.

**Tech Stack:** Cloudflare Workers, Hono.js, D1 (SQLite), TypeScript, LINE Messaging API Flex Messages.

---

## File Map

| Action   | Path |
|----------|------|
| Modify   | `packages/db/schema.sql` |
| Create   | `packages/db/seed-macbook-repair.sql` |
| Create   | `packages/db/src/repair.ts` |
| Modify   | `packages/db/src/index.ts` |
| Create   | `apps/worker/src/routes/repair.ts` |
| Modify   | `apps/worker/src/index.ts` |
| Modify   | `apps/worker/src/routes/webhook.ts` |

---

## Task 1: Schema — add repair tables to schema.sql

**Files:**
- Modify: `packages/db/schema.sql` (append to end)

- [ ] **Step 1: Append the 6 new tables**

Add to the end of `packages/db/schema.sql`:

```sql
-- ============================================================
-- MacBook Repair Quote Flow
-- ============================================================
CREATE TABLE IF NOT EXISTS repair_products (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE TABLE IF NOT EXISTS repair_models (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES repair_products (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  year       INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_repair_models_product ON repair_models (product_id);

CREATE TABLE IF NOT EXISTS repair_symptoms (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES repair_products (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_repair_symptoms_product ON repair_symptoms (product_id);

CREATE TABLE IF NOT EXISTS repair_prices (
  id                 TEXT PRIMARY KEY,
  product_id         TEXT NOT NULL REFERENCES repair_products (id) ON DELETE CASCADE,
  symptom_id         TEXT NOT NULL REFERENCES repair_symptoms (id) ON DELETE CASCADE,
  price_from         INTEGER NOT NULL,
  price_to           INTEGER,
  delivery_days_from INTEGER NOT NULL DEFAULT 1,
  delivery_days_to   INTEGER,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_repair_prices_product_symptom ON repair_prices (product_id, symptom_id);

CREATE TABLE IF NOT EXISTS repair_quotes (
  id                 TEXT PRIMARY KEY,
  friend_id          TEXT NOT NULL REFERENCES friends (id) ON DELETE CASCADE,
  product_id         TEXT REFERENCES repair_products (id) ON DELETE SET NULL,
  model_id           TEXT REFERENCES repair_models (id) ON DELETE SET NULL,
  symptom_id         TEXT REFERENCES repair_symptoms (id) ON DELETE SET NULL,
  model_name         TEXT,
  year               INTEGER,
  price_from         INTEGER,
  price_to           INTEGER,
  delivery_days_from INTEGER,
  delivery_days_to   INTEGER,
  request_type       TEXT CHECK (request_type IN ('mail', 'store', 'consult')),
  status             TEXT NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted', 'ordered', 'cancelled')),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_repair_quotes_friend ON repair_quotes (friend_id);

CREATE TABLE IF NOT EXISTS friend_attributes (
  id         TEXT PRIMARY KEY,
  friend_id  TEXT NOT NULL REFERENCES friends (id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  UNIQUE (friend_id, key)
);

CREATE INDEX IF NOT EXISTS idx_friend_attributes_friend ON friend_attributes (friend_id);
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/schema.sql
git commit -m "feat: add repair quote flow tables to D1 schema"
```

---

## Task 2: Seed data — packages/db/seed-macbook-repair.sql

**Files:**
- Create: `packages/db/seed-macbook-repair.sql`

- [ ] **Step 1: Create the seed file**

Create `packages/db/seed-macbook-repair.sql` with the following content:

```sql
-- Seed: MacBook Repair Products, Symptoms, Prices
-- Run after schema migration.
-- IDs are fixed UUIDs for idempotency (safe to re-run).

-- ============================================================
-- Products
-- ============================================================
INSERT OR IGNORE INTO repair_products (id, name, sort_order) VALUES
  ('prod-air-0001-0000-0000-000000000001', 'MacBook Air', 1),
  ('prod-pro-0001-0000-0000-000000000002', 'MacBook Pro', 2),
  ('prod-oth-0001-0000-0000-000000000003', 'その他',      3);

-- ============================================================
-- Symptoms (MacBook Air)
-- ============================================================
INSERT OR IGNORE INTO repair_symptoms (id, product_id, name, sort_order) VALUES
  ('symp-air-001-0000-0000-000000000001', 'prod-air-0001-0000-0000-000000000001', '画面割れ・液晶不良',       1),
  ('symp-air-002-0000-0000-000000000002', 'prod-air-0001-0000-0000-000000000001', 'バッテリー劣化',           2),
  ('symp-air-003-0000-0000-000000000003', 'prod-air-0001-0000-0000-000000000001', '充電できない',             3),
  ('symp-air-004-0000-0000-000000000004', 'prod-air-0001-0000-0000-000000000001', '電源がつかない',           4),
  ('symp-air-005-0000-0000-000000000005', 'prod-air-0001-0000-0000-000000000001', 'キーボード故障',           5),
  ('symp-air-006-0000-0000-000000000006', 'prod-air-0001-0000-0000-000000000001', '水没・飲み物こぼした',     6),
  ('symp-air-007-0000-0000-000000000007', 'prod-air-0001-0000-0000-000000000001', '異音がする',               7),
  ('symp-air-008-0000-0000-000000000008', 'prod-air-0001-0000-0000-000000000001', 'その他故障',               8);

-- ============================================================
-- Symptoms (MacBook Pro)
-- ============================================================
INSERT OR IGNORE INTO repair_symptoms (id, product_id, name, sort_order) VALUES
  ('symp-pro-001-0000-0000-000000000001', 'prod-pro-0001-0000-0000-000000000002', '画面割れ・液晶不良',       1),
  ('symp-pro-002-0000-0000-000000000002', 'prod-pro-0001-0000-0000-000000000002', 'バッテリー劣化',           2),
  ('symp-pro-003-0000-0000-000000000003', 'prod-pro-0001-0000-0000-000000000002', '充電できない',             3),
  ('symp-pro-004-0000-0000-000000000004', 'prod-pro-0001-0000-0000-000000000002', '電源がつかない',           4),
  ('symp-pro-005-0000-0000-000000000005', 'prod-pro-0001-0000-0000-000000000002', 'キーボード故障',           5),
  ('symp-pro-006-0000-0000-000000000006', 'prod-pro-0001-0000-0000-000000000002', '水没・飲み物こぼした',     6),
  ('symp-pro-007-0000-0000-000000000007', 'prod-pro-0001-0000-0000-000000000002', '異音がする',               7),
  ('symp-pro-008-0000-0000-000000000008', 'prod-pro-0001-0000-0000-000000000002', 'その他故障',               8);

-- ============================================================
-- Symptoms (その他)
-- ============================================================
INSERT OR IGNORE INTO repair_symptoms (id, product_id, name, sort_order) VALUES
  ('symp-oth-001-0000-0000-000000000001', 'prod-oth-0001-0000-0000-000000000003', 'その他故障', 1);

-- ============================================================
-- Prices (MacBook Air)
-- ============================================================
INSERT OR IGNORE INTO repair_prices (id, product_id, symptom_id, price_from, price_to, delivery_days_from, delivery_days_to) VALUES
  ('price-air-001', 'prod-air-0001-0000-0000-000000000001', 'symp-air-001-0000-0000-000000000001', 15000, NULL, 3, 7),
  ('price-air-002', 'prod-air-0001-0000-0000-000000000001', 'symp-air-002-0000-0000-000000000002', 12000, NULL, 1, 3),
  ('price-air-003', 'prod-air-0001-0000-0000-000000000001', 'symp-air-003-0000-0000-000000000003',  8000, NULL, 1, 3),
  ('price-air-004', 'prod-air-0001-0000-0000-000000000001', 'symp-air-004-0000-0000-000000000004', 10000, NULL, 3, 7),
  ('price-air-005', 'prod-air-0001-0000-0000-000000000001', 'symp-air-005-0000-0000-000000000005', 15000, NULL, 3, 7),
  ('price-air-006', 'prod-air-0001-0000-0000-000000000001', 'symp-air-006-0000-0000-000000000006', 10000, NULL, 7, 14),
  ('price-air-007', 'prod-air-0001-0000-0000-000000000001', 'symp-air-007-0000-0000-000000000007',  8000, NULL, 1, 3),
  ('price-air-008', 'prod-air-0001-0000-0000-000000000001', 'symp-air-008-0000-0000-000000000008',  8000, NULL, 3, 7);

-- ============================================================
-- Prices (MacBook Pro — same rates for now)
-- ============================================================
INSERT OR IGNORE INTO repair_prices (id, product_id, symptom_id, price_from, price_to, delivery_days_from, delivery_days_to) VALUES
  ('price-pro-001', 'prod-pro-0001-0000-0000-000000000002', 'symp-pro-001-0000-0000-000000000001', 15000, NULL, 3, 7),
  ('price-pro-002', 'prod-pro-0001-0000-0000-000000000002', 'symp-pro-002-0000-0000-000000000002', 12000, NULL, 1, 3),
  ('price-pro-003', 'prod-pro-0001-0000-0000-000000000002', 'symp-pro-003-0000-0000-000000000003',  8000, NULL, 1, 3),
  ('price-pro-004', 'prod-pro-0001-0000-0000-000000000002', 'symp-pro-004-0000-0000-000000000004', 10000, NULL, 3, 7),
  ('price-pro-005', 'prod-pro-0001-0000-0000-000000000002', 'symp-pro-005-0000-0000-000000000005', 15000, NULL, 3, 7),
  ('price-pro-006', 'prod-pro-0001-0000-0000-000000000002', 'symp-pro-006-0000-0000-000000000006', 10000, NULL, 7, 14),
  ('price-pro-007', 'prod-pro-0001-0000-0000-000000000002', 'symp-pro-007-0000-0000-000000000007',  8000, NULL, 1, 3),
  ('price-pro-008', 'prod-pro-0001-0000-0000-000000000002', 'symp-pro-008-0000-0000-000000000008',  8000, NULL, 3, 7);

-- ============================================================
-- Prices (その他)
-- ============================================================
INSERT OR IGNORE INTO repair_prices (id, product_id, symptom_id, price_from, price_to, delivery_days_from, delivery_days_to) VALUES
  ('price-oth-001', 'prod-oth-0001-0000-0000-000000000003', 'symp-oth-001-0000-0000-000000000001', 8000, NULL, 3, 7);
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/seed-macbook-repair.sql
git commit -m "feat: add MacBook repair seed data"
```

---

## Task 3: DB helpers — packages/db/src/repair.ts

**Files:**
- Create: `packages/db/src/repair.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Create packages/db/src/repair.ts**

```typescript
import { jstNow } from './utils.js';

// ---- Types ----

export interface RepairProduct {
  id: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

export interface RepairSymptom {
  id: string;
  product_id: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

export interface RepairPrice {
  id: string;
  product_id: string;
  symptom_id: string;
  price_from: number;
  price_to: number | null;
  delivery_days_from: number;
  delivery_days_to: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepairQuote {
  id: string;
  friend_id: string;
  product_id: string | null;
  model_id: string | null;
  symptom_id: string | null;
  model_name: string | null;
  year: number | null;
  price_from: number | null;
  price_to: number | null;
  delivery_days_from: number | null;
  delivery_days_to: number | null;
  request_type: 'mail' | 'store' | 'consult' | null;
  status: 'quoted' | 'ordered' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface FriendAttribute {
  id: string;
  friend_id: string;
  key: string;
  value: string;
  updated_at: string;
}

// ---- Repair Products ----

export async function getRepairProducts(db: D1Database): Promise<RepairProduct[]> {
  const result = await db
    .prepare(`SELECT * FROM repair_products WHERE is_active = 1 ORDER BY sort_order ASC`)
    .all<RepairProduct>();
  return result.results;
}

// ---- Repair Symptoms ----

export async function getRepairSymptomsByProduct(
  db: D1Database,
  productId: string,
): Promise<RepairSymptom[]> {
  const result = await db
    .prepare(
      `SELECT * FROM repair_symptoms WHERE product_id = ? AND is_active = 1 ORDER BY sort_order ASC`,
    )
    .bind(productId)
    .all<RepairSymptom>();
  return result.results;
}

// ---- Repair Prices ----

export async function getRepairPrice(
  db: D1Database,
  productId: string,
  symptomId: string,
): Promise<RepairPrice | null> {
  return db
    .prepare(
      `SELECT * FROM repair_prices WHERE product_id = ? AND symptom_id = ? LIMIT 1`,
    )
    .bind(productId, symptomId)
    .first<RepairPrice>();
}

// ---- Repair Quotes ----

export interface CreateRepairQuoteInput {
  friendId: string;
  productId?: string | null;
  modelId?: string | null;
  symptomId?: string | null;
  modelName?: string | null;
  year?: number | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  deliveryDaysFrom?: number | null;
  deliveryDaysTo?: number | null;
  requestType?: 'mail' | 'store' | 'consult' | null;
}

export async function createRepairQuote(
  db: D1Database,
  input: CreateRepairQuoteInput,
): Promise<RepairQuote> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO repair_quotes
         (id, friend_id, product_id, model_id, symptom_id, model_name, year,
          price_from, price_to, delivery_days_from, delivery_days_to, request_type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quoted', ?, ?)`,
    )
    .bind(
      id,
      input.friendId,
      input.productId ?? null,
      input.modelId ?? null,
      input.symptomId ?? null,
      input.modelName ?? null,
      input.year ?? null,
      input.priceFrom ?? null,
      input.priceTo ?? null,
      input.deliveryDaysFrom ?? null,
      input.deliveryDaysTo ?? null,
      input.requestType ?? null,
      now,
      now,
    )
    .run();
  return db.prepare(`SELECT * FROM repair_quotes WHERE id = ?`).bind(id).first<RepairQuote>() as Promise<RepairQuote>;
}

export async function updateRepairQuoteRequestType(
  db: D1Database,
  quoteId: string,
  requestType: 'mail' | 'store' | 'consult',
): Promise<void> {
  await db
    .prepare(
      `UPDATE repair_quotes SET request_type = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(requestType, jstNow(), quoteId)
    .run();
}

export async function getRepairQuotesByFriend(
  db: D1Database,
  friendId: string,
): Promise<RepairQuote[]> {
  const result = await db
    .prepare(
      `SELECT * FROM repair_quotes WHERE friend_id = ? ORDER BY created_at DESC`,
    )
    .bind(friendId)
    .all<RepairQuote>();
  return result.results;
}

// ---- Friend Attributes ----

export async function setFriendAttribute(
  db: D1Database,
  friendId: string,
  key: string,
  value: string,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO friend_attributes (id, friend_id, key, value, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (friend_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(id, friendId, key, value, now)
    .run();
}

export async function getFriendAttribute(
  db: D1Database,
  friendId: string,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT value FROM friend_attributes WHERE friend_id = ? AND key = ?`)
    .bind(friendId, key)
    .first<{ value: string }>();
  return row?.value ?? null;
}
```

- [ ] **Step 2: Export from packages/db/src/index.ts**

Add the following line to `packages/db/src/index.ts` (after the last `export *` line, before `export function createDb`):

```typescript
export * from './repair';
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/repair.ts packages/db/src/index.ts
git commit -m "feat: add repair DB helpers and types"
```

---

## Task 4: REST API route — apps/worker/src/routes/repair.ts

**Files:**
- Create: `apps/worker/src/routes/repair.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { Hono } from 'hono';
import {
  getRepairProducts,
  getRepairSymptomsByProduct,
  getRepairPrice,
  createRepairQuote,
  getRepairQuotesByFriend,
} from '@line-crm/db';
import type { Env } from '../index.js';

const repairRoutes = new Hono<Env>();

// GET /api/repair/products
repairRoutes.get('/api/repair/products', async (c) => {
  try {
    const items = await getRepairProducts(c.env.DB);
    return c.json({
      success: true,
      data: items.map((p) => ({
        id: p.id,
        name: p.name,
        sortOrder: p.sort_order,
      })),
    });
  } catch (err) {
    console.error('GET /api/repair/products error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/repair/products/:productId/symptoms
repairRoutes.get('/api/repair/products/:productId/symptoms', async (c) => {
  try {
    const productId = c.req.param('productId');
    const items = await getRepairSymptomsByProduct(c.env.DB, productId);
    return c.json({
      success: true,
      data: items.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sort_order,
      })),
    });
  } catch (err) {
    console.error('GET /api/repair/products/:productId/symptoms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/repair/products/:productId/symptoms/:symptomId/price
repairRoutes.get(
  '/api/repair/products/:productId/symptoms/:symptomId/price',
  async (c) => {
    try {
      const productId = c.req.param('productId');
      const symptomId = c.req.param('symptomId');
      const price = await getRepairPrice(c.env.DB, productId, symptomId);
      if (!price) {
        return c.json({ success: false, error: 'Price not found' }, 404);
      }
      return c.json({
        success: true,
        data: {
          id: price.id,
          priceFrom: price.price_from,
          priceTo: price.price_to,
          deliveryDaysFrom: price.delivery_days_from,
          deliveryDaysTo: price.delivery_days_to,
          notes: price.notes,
        },
      });
    } catch (err) {
      console.error('GET price error:', err);
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }
  },
);

// POST /api/repair/quotes
repairRoutes.post('/api/repair/quotes', async (c) => {
  try {
    const body = await c.req.json<{
      friendId: string;
      productId?: string;
      symptomId?: string;
      modelName?: string;
      year?: number;
      requestType?: 'mail' | 'store' | 'consult';
    }>();

    if (!body.friendId) {
      return c.json({ success: false, error: 'friendId is required' }, 400);
    }

    const quote = await createRepairQuote(c.env.DB, {
      friendId: body.friendId,
      productId: body.productId ?? null,
      symptomId: body.symptomId ?? null,
      modelName: body.modelName ?? null,
      year: body.year ?? null,
      requestType: body.requestType ?? null,
    });

    return c.json({ success: true, data: quote }, 201);
  } catch (err) {
    console.error('POST /api/repair/quotes error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/repair/quotes/:friendId
repairRoutes.get('/api/repair/quotes/:friendId', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const quotes = await getRepairQuotesByFriend(c.env.DB, friendId);
    return c.json({ success: true, data: quotes });
  } catch (err) {
    console.error('GET /api/repair/quotes/:friendId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { repairRoutes };
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker/src/routes/repair.ts
git commit -m "feat: add repair REST API routes"
```

---

## Task 5: Mount repair routes in index.ts

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Add import**

In `apps/worker/src/index.ts`, add after the last route import (line 36, after `import { staff } from './routes/staff.js';`):

```typescript
import { repairRoutes } from './routes/repair.js';
```

- [ ] **Step 2: Mount the route**

In `apps/worker/src/index.ts`, add after `app.route('/', staff);` (line 92):

```typescript
app.route('/', repairRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: mount repair routes in worker"
```

---

## Task 6: Webhook — postback handler + repair flow logic

**Files:**
- Modify: `apps/worker/src/routes/webhook.ts`

This task adds:
1. `postback` event handling in `handleEvent`
2. Updated `follow` event to send welcome + product selection Flex
3. Repair flow helpers (`buildProductSelectFlex`, `buildSymptomSelectFlex`, `buildQuoteFlex`)

- [ ] **Step 1: Add imports to webhook.ts**

Replace the existing import from `@line-crm/db` (lines 4–16) with:

```typescript
import {
  upsertFriend,
  updateFriendFollowStatus,
  getFriendByLineUserId,
  getScenarios,
  enrollFriendInScenario,
  getScenarioSteps,
  advanceFriendScenario,
  completeFriendScenario,
  upsertChatOnMessage,
  getLineAccounts,
  jstNow,
  getRepairProducts,
  getRepairSymptomsByProduct,
  getRepairPrice,
  createRepairQuote,
  getRepairQuotesByFriend,
  setFriendAttribute,
  getFriendAttribute,
} from '@line-crm/db';
```

- [ ] **Step 2: Add Flex builder helpers before the `handleEvent` function**

Insert the following helper functions directly above the `async function handleEvent(` declaration:

```typescript
// ---- Repair Flow Flex builders ----

function buildProductSelectFlex() {
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: [
        { type: 'text', text: '機種を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'text', text: 'お手持ちのMacBookの種類をお選びください', size: 'sm', color: '#64748b', wrap: true, margin: 'md' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            { type: 'button', action: { type: 'postback', label: 'MacBook Air', data: 'action=select_product&product=air&name=MacBook Air' }, style: 'primary', color: '#00B900' },
            { type: 'button', action: { type: 'postback', label: 'MacBook Pro', data: 'action=select_product&product=pro&name=MacBook Pro' }, style: 'primary', color: '#00B900', margin: 'sm' },
            { type: 'button', action: { type: 'postback', label: 'その他', data: 'action=select_product&product=other&name=その他' }, style: 'secondary', margin: 'sm' },
          ],
        },
      ],
    },
  });
}

function buildModelMethodFlex(productName: string) {
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: [
        { type: 'text', text: `${productName}`, weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'text', text: 'モデルの特定方法をお選びください', size: 'sm', color: '#64748b', wrap: true, margin: 'md' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            { type: 'button', action: { type: 'postback', label: '年式で選ぶ', data: 'action=choose_year_method' }, style: 'primary', color: '#00B900' },
            { type: 'button', action: { type: 'postback', label: 'わからない', data: 'action=skip_model' }, style: 'secondary', margin: 'sm' },
          ],
        },
      ],
    },
  });
}

function buildYearSelectFlex() {
  const years = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: [
        { type: 'text', text: '年式を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            ...years.map((y) => ({
              type: 'button',
              action: { type: 'postback', label: `${y}年`, data: `action=select_year&year=${y}` },
              style: 'primary',
              color: '#00B900',
            })),
            { type: 'button', action: { type: 'postback', label: 'その他の年式', data: 'action=select_year&year=0' }, style: 'secondary' },
          ],
        },
      ],
    },
  });
}

async function buildSymptomSelectFlex(db: D1Database, productId: string): Promise<string> {
  const symptoms = await getRepairSymptomsByProduct(db, productId);
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: [
        { type: 'text', text: '症状を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: symptoms.map((s) => ({
            type: 'button',
            action: { type: 'postback', label: s.name, data: `action=select_symptom&symptom_id=${s.id}&symptom_name=${encodeURIComponent(s.name)}` },
            style: 'primary',
            color: '#00B900',
          })),
        },
      ],
    },
  });
}

function buildQuoteFlex(params: {
  productName: string;
  symptomName: string;
  priceFrom: number;
  priceTo: number | null;
  deliveryFrom: number;
  deliveryTo: number | null;
  quoteId: string;
}) {
  const priceStr = params.priceTo
    ? `¥${params.priceFrom.toLocaleString()}〜¥${params.priceTo.toLocaleString()}`
    : `¥${params.priceFrom.toLocaleString()}〜`;
  const deliveryStr = params.deliveryTo
    ? `${params.deliveryFrom}〜${params.deliveryTo}日`
    : `${params.deliveryFrom}日〜`;

  return JSON.stringify({
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#00B900',
      contents: [
        { type: 'text', text: '修理見積り', color: '#ffffff', weight: 'bold', size: 'xl' },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
      contents: [
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '機種', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: params.productName, size: 'sm', color: '#1e293b', weight: 'bold', flex: 3 },
        ]},
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '症状', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: params.symptomName, size: 'sm', color: '#1e293b', weight: 'bold', flex: 3, wrap: true },
        ]},
        { type: 'separator', margin: 'md' },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '修理費用', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: priceStr, size: 'sm', color: '#00B900', weight: 'bold', flex: 3 },
        ], margin: 'md' },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '納期目安', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: deliveryStr, size: 'sm', color: '#1e293b', weight: 'bold', flex: 3 },
        ]},
        { type: 'text', text: '※診断後に正式な費用をお伝えします', size: 'xs', color: '#94a3b8', wrap: true, margin: 'lg' },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
      contents: [
        { type: 'button', action: { type: 'postback', label: '郵送で依頼する', data: `action=request_type&type=mail&quote_id=${params.quoteId}` }, style: 'primary', color: '#00B900' },
        { type: 'button', action: { type: 'postback', label: '店舗に持込む', data: `action=request_type&type=store&quote_id=${params.quoteId}` }, style: 'primary', color: '#00B900' },
        { type: 'button', action: { type: 'postback', label: '質問・相談したい', data: `action=request_type&type=consult&quote_id=${params.quoteId}` }, style: 'secondary' },
      ],
    },
  });
}
```

- [ ] **Step 3: Update the follow event handler to send welcome + product selection Flex**

In `webhook.ts`, replace the block inside `if (event.type === 'follow') {` after the `fireEvent` call (currently at line ~176 just before `return;`), so that immediately after the friend is upserted (before scenario enrollment loop starts), a welcome reply is sent.

Find this block (around line 115, just after `matchedAccountId` assignment):

```typescript
    // friend_add シナリオに登録（このアカウントのシナリオのみ）
```

Insert **before** that line:

```typescript
    // ウェルカムメッセージ + 機種選択Flex
    try {
      await lineClient.replyMessage(event.replyToken, [
        { type: 'text', text: 'お見積りを作成させて頂きますのでお客様の端末情報を下記選択肢よりお選び下さい💻\n\n※修理時にデータに触れる事はございません！\nデータそのままで修理可能です✨' },
        buildMessage('flex', buildProductSelectFlex()),
      ]);
    } catch (err) {
      console.error('Failed to send welcome message:', err);
    }
```

- [ ] **Step 4: Add postback event handler in handleEvent**

At the end of `handleEvent`, before the final closing brace `}`, add:

```typescript
  if (event.type === 'postback') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    const data = event.postback.data;
    const params = new URLSearchParams(data);
    const action = params.get('action');

    if (action === 'select_product') {
      const productKey = params.get('product') ?? '';
      const productName = params.get('name') ?? '';
      // Map short key to DB product ID
      const productIdMap: Record<string, string> = {
        air:   'prod-air-0001-0000-0000-000000000001',
        pro:   'prod-pro-0001-0000-0000-000000000002',
        other: 'prod-oth-0001-0000-0000-000000000003',
      };
      const productId = productIdMap[productKey] ?? productIdMap['other'];
      await setFriendAttribute(db, friend.id, 'repair_product_id', productId);
      await setFriendAttribute(db, friend.id, 'repair_product_name', productName);

      try {
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', buildModelMethodFlex(productName)),
        ]);
      } catch (err) {
        console.error('Failed to send model method flex:', err);
      }
      return;
    }

    if (action === 'choose_year_method') {
      try {
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', buildYearSelectFlex()),
        ]);
      } catch (err) {
        console.error('Failed to send year select flex:', err);
      }
      return;
    }

    if (action === 'skip_model') {
      // Go directly to symptom selection using saved product
      const productId = await getFriendAttribute(db, friend.id, 'repair_product_id')
        ?? 'prod-oth-0001-0000-0000-000000000003';
      try {
        const symptomFlex = await buildSymptomSelectFlex(db, productId);
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', symptomFlex),
        ]);
      } catch (err) {
        console.error('Failed to send symptom flex:', err);
      }
      return;
    }

    if (action === 'select_year') {
      const year = parseInt(params.get('year') ?? '0', 10);
      if (year > 0) {
        await setFriendAttribute(db, friend.id, 'repair_year', String(year));
      }
      const productId = await getFriendAttribute(db, friend.id, 'repair_product_id')
        ?? 'prod-oth-0001-0000-0000-000000000003';
      try {
        const symptomFlex = await buildSymptomSelectFlex(db, productId);
        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', symptomFlex),
        ]);
      } catch (err) {
        console.error('Failed to send symptom flex after year:', err);
      }
      return;
    }

    if (action === 'select_symptom') {
      const symptomId = params.get('symptom_id') ?? '';
      const symptomName = decodeURIComponent(params.get('symptom_name') ?? '');
      const productId = await getFriendAttribute(db, friend.id, 'repair_product_id')
        ?? 'prod-oth-0001-0000-0000-000000000003';
      const productName = await getFriendAttribute(db, friend.id, 'repair_product_name') ?? 'MacBook';
      const yearStr = await getFriendAttribute(db, friend.id, 'repair_year');

      await setFriendAttribute(db, friend.id, 'repair_symptom_id', symptomId);

      const price = await getRepairPrice(db, productId, symptomId);

      const quote = await createRepairQuote(db, {
        friendId: friend.id,
        productId,
        symptomId,
        modelName: productName,
        year: yearStr ? parseInt(yearStr, 10) : null,
        priceFrom: price?.price_from ?? null,
        priceTo: price?.price_to ?? null,
        deliveryDaysFrom: price?.delivery_days_from ?? null,
        deliveryDaysTo: price?.delivery_days_to ?? null,
      });

      await setFriendAttribute(db, friend.id, 'repair_quote_id', quote.id);

      try {
        if (price) {
          await lineClient.replyMessage(event.replyToken, [
            buildMessage('flex', buildQuoteFlex({
              productName,
              symptomName,
              priceFrom: price.price_from,
              priceTo: price.price_to,
              deliveryFrom: price.delivery_days_from,
              deliveryTo: price.delivery_days_to,
              quoteId: quote.id,
            })),
          ]);
        } else {
          await lineClient.replyMessage(event.replyToken, [
            { type: 'text', text: `${symptomName}についてのお見積りを承りました。担当者より詳細をご連絡いたします。` },
          ]);
        }
      } catch (err) {
        console.error('Failed to send quote flex:', err);
      }
      return;
    }

    if (action === 'request_type') {
      const type = params.get('type') as 'mail' | 'store' | 'consult' | null;
      const quoteId = params.get('quote_id') ?? '';
      if (type && quoteId) {
        await db
          .prepare(`UPDATE repair_quotes SET request_type = ?, updated_at = ? WHERE id = ?`)
          .bind(type, jstNow(), quoteId)
          .run();
      }

      const labelMap: Record<string, string> = {
        mail:    '郵送での修理依頼',
        store:   '店舗持込での修理依頼',
        consult: 'ご質問・ご相談',
      };
      const label = type ? (labelMap[type] ?? 'お問い合わせ') : 'お問い合わせ';
      try {
        await lineClient.replyMessage(event.replyToken, [
          {
            type: 'text',
            text: `${label}を承りました。担当者よりご連絡いたしますので、しばらくお待ちください。`,
          },
        ]);
      } catch (err) {
        console.error('Failed to reply for request_type:', err);
      }
      return;
    }

    return;
  }
```

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/routes/webhook.ts
git commit -m "feat: add repair quote flow to LINE webhook handler"
```

---

## Local Development Checklist

After all tasks are complete, here is how to verify the implementation locally:

### Apply schema changes to the local D1 database

```bash
cd /Users/apple/Desktop/AI/line-harness-macbook
npx wrangler d1 execute DB --local --file=packages/db/schema.sql
npx wrangler d1 execute DB --local --file=packages/db/seed-macbook-repair.sql
```

### Start the worker dev server

```bash
cd apps/worker
npx wrangler dev
```

### Test the REST endpoints (worker runs on http://localhost:8787 by default)

```bash
# Products
curl http://localhost:8787/api/repair/products -H "Authorization: Bearer <YOUR_API_KEY>"

# Symptoms for MacBook Air
curl "http://localhost:8787/api/repair/products/prod-air-0001-0000-0000-000000000001/symptoms" \
  -H "Authorization: Bearer <YOUR_API_KEY>"

# Price for MacBook Air + 画面割れ
curl "http://localhost:8787/api/repair/products/prod-air-0001-0000-0000-000000000001/symptoms/symp-air-001-0000-0000-000000000001/price" \
  -H "Authorization: Bearer <YOUR_API_KEY>"
```

### Test the webhook flow (LINE Simulator or ngrok)

Use [LINE Developers Console](https://developers.line.biz/) > Messaging API > Webhook URL to point to your ngrok tunnel, or use the LINE Simulator in the console to send a `follow` event and verify the welcome Flex message arrives in the LINE app.

---

## Summary of Changed Files

| File | Change |
|------|--------|
| `packages/db/schema.sql` | +6 tables appended |
| `packages/db/seed-macbook-repair.sql` | New file — seed data |
| `packages/db/src/repair.ts` | New file — DB helpers |
| `packages/db/src/index.ts` | +1 export line |
| `apps/worker/src/routes/repair.ts` | New file — REST routes |
| `apps/worker/src/index.ts` | +1 import, +1 mount |
| `apps/worker/src/routes/webhook.ts` | Extended imports, welcome message, postback handler |
