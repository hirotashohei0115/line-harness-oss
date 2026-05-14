export interface StoreHourRow {
  id: string;
  store_key: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: number;
}

export interface StoreReservationRow {
  id: string;
  friend_id: string | null;
  line_user_id: string;
  store_key: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  notes: string;
  status: string;
  created_at: string;
}

export async function getStoreHours(db: D1Database, storeKey: string): Promise<StoreHourRow[]> {
  const result = await db
    .prepare('SELECT * FROM store_hours WHERE store_key = ? ORDER BY day_of_week')
    .bind(storeKey)
    .all<StoreHourRow>();
  return result.results;
}

export async function getAllStoreHours(db: D1Database): Promise<StoreHourRow[]> {
  const result = await db
    .prepare('SELECT * FROM store_hours ORDER BY store_key, day_of_week')
    .all<StoreHourRow>();
  return result.results;
}

export async function upsertStoreHour(
  db: D1Database,
  storeKey: string,
  dayOfWeek: number,
  openTime: string,
  closeTime: string,
  isClosed: boolean,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO store_hours (store_key, day_of_week, open_time, close_time, is_closed)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(store_key, day_of_week) DO UPDATE SET
         open_time = excluded.open_time,
         close_time = excluded.close_time,
         is_closed = excluded.is_closed`,
    )
    .bind(storeKey, dayOfWeek, openTime, closeTime, isClosed ? 1 : 0)
    .run();
}

export async function getBookedTimes(db: D1Database, storeKey: string, date: string): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT time FROM store_reservations
       WHERE store_key = ? AND date = ? AND status != 'cancelled'`,
    )
    .bind(storeKey, date)
    .all<{ time: string }>();
  return result.results.map((r) => r.time);
}

export async function createStoreReservation(
  db: D1Database,
  data: {
    friendId: string | null;
    lineUserId: string;
    storeKey: string;
    date: string;
    time: string;
    name: string;
    phone: string;
    notes: string;
  },
): Promise<StoreReservationRow> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO store_reservations
       (id, friend_id, line_user_id, store_key, date, time, name, phone, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    )
    .bind(id, data.friendId, data.lineUserId, data.storeKey, data.date, data.time, data.name, data.phone, data.notes)
    .run();
  const row = await db
    .prepare('SELECT * FROM store_reservations WHERE id = ?')
    .bind(id)
    .first<StoreReservationRow>();
  return row!;
}

export async function listStoreReservations(
  db: D1Database,
  opts: { storeKey?: string; date?: string; status?: string } = {},
): Promise<StoreReservationRow[]> {
  let sql = 'SELECT * FROM store_reservations WHERE 1=1';
  const params: unknown[] = [];
  if (opts.storeKey) { sql += ' AND store_key = ?'; params.push(opts.storeKey); }
  if (opts.date) { sql += ' AND date = ?'; params.push(opts.date); }
  if (opts.status) { sql += ' AND status = ?'; params.push(opts.status); }
  sql += ' ORDER BY date DESC, time DESC';
  const result = await db.prepare(sql).bind(...params).all<StoreReservationRow>();
  return result.results;
}

export async function getStoreReservation(db: D1Database, id: string): Promise<StoreReservationRow | null> {
  return db.prepare('SELECT * FROM store_reservations WHERE id = ?').bind(id).first<StoreReservationRow>();
}

export async function updateReservationStatus(db: D1Database, id: string, status: string): Promise<void> {
  await db.prepare('UPDATE store_reservations SET status = ? WHERE id = ?').bind(status, id).run();
}

export async function deleteStoreReservation(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM store_reservations WHERE id = ?').bind(id).run();
}
