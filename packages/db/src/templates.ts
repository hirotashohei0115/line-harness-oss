import { jstNow } from './utils.js';
// テンプレート管理クエリヘルパー

export interface TemplateRow {
  id: string;
  name: string;
  category: string;
  message_type: string;
  message_content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function getTemplates(db: D1Database, category?: string, accountId?: string): Promise<TemplateRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (category) {
    conditions.push('category = ?');
    values.push(category);
  }
  if (accountId) {
    conditions.push('(line_account_id = ? OR line_account_id IS NULL)');
    values.push(accountId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.prepare(`SELECT * FROM templates ${where} ORDER BY sort_order ASC, created_at ASC`)
    .bind(...values).all<TemplateRow>();
  return result.results;
}

export async function getTemplateById(db: D1Database, id: string): Promise<TemplateRow | null> {
  return db.prepare(`SELECT * FROM templates WHERE id = ?`).bind(id).first<TemplateRow>();
}

export async function createTemplate(
  db: D1Database,
  input: { name: string; category?: string; messageType: string; messageContent: string; lineAccountId?: string | null },
): Promise<TemplateRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(`INSERT INTO templates (id, name, category, message_type, message_content, line_account_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.name, input.category ?? 'general', input.messageType, input.messageContent, input.lineAccountId ?? null, now, now).run();
  return (await getTemplateById(db, id))!;
}

export async function updateTemplate(
  db: D1Database,
  id: string,
  updates: Partial<{ name: string; category: string; messageType: string; messageContent: string }>,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
  if (updates.category !== undefined) { sets.push('category = ?'); values.push(updates.category); }
  if (updates.messageType !== undefined) { sets.push('message_type = ?'); values.push(updates.messageType); }
  if (updates.messageContent !== undefined) { sets.push('message_content = ?'); values.push(updates.messageContent); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  values.push(jstNow());
  values.push(id);
  await db.prepare(`UPDATE templates SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteTemplate(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM templates WHERE id = ?`).bind(id).run();
}

export async function reorderTemplates(db: D1Database, orders: { id: string; sort_order: number }[]): Promise<void> {
  for (const { id, sort_order } of orders) {
    await db.prepare(`UPDATE templates SET sort_order = ? WHERE id = ?`).bind(sort_order, id).run();
  }
}
