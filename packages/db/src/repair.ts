import { jstNow } from './utils.js';

// ---- Types ----

export interface RepairProduct {
  id: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface RepairSymptom {
  id: string;
  product_id: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
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
  follow_sent: number;
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
  return (await db.prepare(`SELECT * FROM repair_quotes WHERE id = ?`).bind(id).first<RepairQuote>())!;
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

export interface FollowUpQuoteRow {
  id: string;
  friend_id: string;
  line_user_id: string;
  price_from: number | null;
  price_to: number | null;
}

export async function getUnsentFollowUpQuotes(
  db: D1Database,
  from: string,
  to: string,
): Promise<FollowUpQuoteRow[]> {
  // Use MAX(rq.id) to pick the latest quote per friend, preventing duplicate messages
  // when a friend has multiple unsent quotes in the same window.
  // Also exclude friends who already received a follow-up for any quote.
  const result = await db
    .prepare(
      `SELECT rq.id, rq.friend_id, f.line_user_id, rq.price_from, rq.price_to
       FROM repair_quotes rq
       JOIN friends f ON f.id = rq.friend_id
       WHERE rq.status = 'quoted'
         AND rq.follow_sent = 0
         AND rq.created_at >= ?
         AND rq.created_at < ?
         AND NOT EXISTS (
           SELECT 1 FROM repair_quotes rq2
           WHERE rq2.friend_id = rq.friend_id
             AND rq2.follow_sent = 1
         )
         AND rq.id = (
           SELECT MAX(rq3.id) FROM repair_quotes rq3
           WHERE rq3.friend_id = rq.friend_id
             AND rq3.status = 'quoted'
             AND rq3.follow_sent = 0
             AND rq3.created_at >= ?
             AND rq3.created_at < ?
         )`,
    )
    .bind(from, to, from, to)
    .all<FollowUpQuoteRow>();
  return result.results;
}

export async function markFollowSent(db: D1Database, quoteId: string): Promise<void> {
  await db
    .prepare(`UPDATE repair_quotes SET follow_sent = 1, updated_at = ? WHERE id = ?`)
    .bind(jstNow(), quoteId)
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

// ---- Repair Model Prices ----

export interface RepairModelPriceRow {
  price: number | null;
  delivery_days: string | null;
  model_number: string;
}

export async function getRepairModelPrice(
  db: D1Database,
  modelNumber: string,
  symptom: string,
): Promise<RepairModelPriceRow | null> {
  const row = await db
    .prepare(`SELECT price, delivery_days, model_number FROM repair_model_prices WHERE model_number = ? AND symptom = ? LIMIT 1`)
    .bind(modelNumber, symptom)
    .first<RepairModelPriceRow>();
  return row ?? null;
}

export async function getRepairPriceByYearInch(
  db: D1Database,
  productType: string,
  year: number,
  inchSize: number,
  symptom: string,
): Promise<RepairModelPriceRow | null> {
  const row = await db
    .prepare(
      `SELECT price, delivery_days, model_number FROM repair_model_prices
       WHERE product_type = ? AND year = ? AND inch_size = ? AND symptom = ?
       LIMIT 1`,
    )
    .bind(productType, year, inchSize, symptom)
    .first<RepairModelPriceRow>();
  return row ?? null;
}
