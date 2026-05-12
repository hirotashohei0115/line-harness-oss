# Contact Mark System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 対応マーク機能を実装する。各友だちにカラーマーク（対応ステータス）を付与し、LINEフロー内で自動変更・管理画面で手動変更できるようにする。

**Architecture:** `contact_marks` マスタテーブル + `friends.contact_mark_id` で管理。Webhookの各アクションポイントで `setContactMark()` を呼ぶ。管理画面の友だち一覧・チャット画面にカラードットを表示し、ドロップダウンで変更可能。

**Tech Stack:** Hono (Worker API), D1 (SQLite), Next.js (Web), Tailwind CSS

---

## File Map

| Role | File |
|------|------|
| **新規** Worker marks CRUD | `apps/worker/src/routes/marks.ts` |
| **修正** Worker エントリポイント | `apps/worker/src/index.ts` |
| **修正** Webhook 自動マーク | `apps/worker/src/routes/webhook.ts` |
| **修正** Repair route マーク | `apps/worker/src/routes/repair.ts` |
| **修正** Web API クライアント | `apps/web/src/lib/api.ts` |
| **新規** マーク設定ページ | `apps/web/src/app/marks/page.tsx` |
| **修正** サイドバー | `apps/web/src/components/layout/sidebar.tsx` |
| **修正** 友だち一覧ページ | `apps/web/src/app/friends/page.tsx` |
| **修正** 友だちテーブル | `apps/web/src/components/friends/friend-table.tsx` |
| **修正** チャットページ | `apps/web/src/app/chats/page.tsx` |

---

## Task 1: DBマイグレーション実行

**Files:**
- Bash commands only (no file edits)

- [ ] **Step 1: contact_marks テーブル作成**

```bash
npx wrangler d1 execute macbook-repair-db --remote --command="
CREATE TABLE IF NOT EXISTS contact_marks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#cccccc',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);
"
```
Expected: `✅ Successfully executed ...`

- [ ] **Step 2: friends テーブルに contact_mark_id カラム追加**

```bash
npx wrangler d1 execute macbook-repair-db --remote --command="
ALTER TABLE friends ADD COLUMN contact_mark_id TEXT REFERENCES contact_marks(id);
" 2>/dev/null || echo "column already exists"
```
Expected: Success or "column already exists"

- [ ] **Step 3: 初期マークデータ挿入**

```bash
npx wrangler d1 execute macbook-repair-db --remote --command="
INSERT OR IGNORE INTO contact_marks (id, name, color, sort_order, is_default) VALUES
  ('mark_01', 'アクションなし', '#67e8f9', 0, 1),
  ('mark_02', 'フォーム入力済み', '#6b7280', 1, 0),
  ('mark_03', '発送完了/到着まち', '#3b82f6', 2, 0),
  ('mark_04', '修理持ち込み予約（来店待ち）', '#3b82f6', 3, 0),
  ('mark_05', '検証中', '#f97316', 4, 0),
  ('mark_06', '見積もり連絡中', '#f97316', 5, 0),
  ('mark_07', '修理中（了承済）', '#ef4444', 6, 0),
  ('mark_08', '支払い待ち', '#ef4444', 7, 0),
  ('mark_09', '対応完了（クロージング）', '#f9a8d4', 8, 0),
  ('mark_10', '持ち込み予約キャンセル', '#fdba74', 9, 0),
  ('mark_11', '要対応！【個別相談】（リッチメニュー）', '#eab308', 10, 0),
  ('mark_12', '要対応！【個別相談】（見積もり中）', '#eab308', 11, 0),
  ('mark_13', '後追い連絡中', '#4ade80', 12, 0),
  ('mark_14', '発送待ち', '#a5b4fc', 13, 0),
  ('mark_15', '再修理', '#f0abfc', 14, 0),
  ('mark_16', '製品選択済み', '#fb7185', 15, 0),
  ('mark_17', 'メニュー選択済み', '#ffffff', 16, 0),
  ('mark_18', 'モデル名選択済み', '#ef4444', 17, 0),
  ('mark_19', '年式選択済み', '#ffffff', 18, 0),
  ('mark_20', 'インチ数選択済み', '#ffffff', 19, 0),
  ('mark_21', '症状選択済み', '#f97316', 20, 0),
  ('mark_22', 'ご依頼可否選択済み', '#ffffff', 21, 0),
  ('mark_23', '依頼方法選択済み', '#b45309', 22, 0),
  ('mark_24', '発送先選択済み', '#16a34a', 23, 0),
  ('mark_25', 'よくある質問', '#ffffff', 24, 0),
  ('mark_26', '※パーツ発注※', '#ef4444', 25, 0),
  ('mark_27', '※梱包キット発送※', '#ef4444', 26, 0),
  ('mark_28', '梱包キット発送済み', '#fda4af', 27, 0),
  ('mark_29', '要お見積り連絡', '#ef4444', 28, 0),
  ('mark_30', '仮見積もり連絡済み', '#4ade80', 29, 0),
  ('mark_31', '購入依頼', '#fda4af', 30, 0);
"
```
Expected: `✅ Successfully executed ...`

- [ ] **Step 4: データ確認**

```bash
npx wrangler d1 execute macbook-repair-db --remote --command="SELECT COUNT(*) as cnt FROM contact_marks;"
```
Expected: `cnt = 31`

- [ ] **Step 5: commit**

```bash
git add -A && git commit -m "feat: add contact_marks table and friends.contact_mark_id"
```

---

## Task 2: Worker marks.ts ルート作成

**Files:**
- Create: `apps/worker/src/routes/marks.ts`

- [ ] **Step 1: marks.ts 全体を作成**

```typescript
// apps/worker/src/routes/marks.ts
import { Hono } from 'hono';
import type { Env } from '../index.js';

interface ContactMark {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_default: number;
  created_at: string;
}

const marks = new Hono<Env>();

function serializeMark(row: ContactMark) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
  };
}

// GET /api/marks
marks.get('/api/marks', async (c) => {
  try {
    const result = await c.env.DB
      .prepare('SELECT * FROM contact_marks ORDER BY sort_order ASC')
      .all<ContactMark>();
    return c.json({ success: true, data: result.results.map(serializeMark) });
  } catch (err) {
    console.error('GET /api/marks error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/marks
marks.post('/api/marks', async (c) => {
  try {
    const body = await c.req.json<{ name: string; color?: string; sortOrder?: number }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);

    const id = `mark_${Date.now()}`;
    const color = body.color ?? '#cccccc';
    const sortOrder = body.sortOrder ?? 0;
    const now = new Date().toISOString();

    await c.env.DB
      .prepare('INSERT INTO contact_marks (id, name, color, sort_order, is_default, created_at) VALUES (?, ?, ?, ?, 0, ?)')
      .bind(id, body.name, color, sortOrder, now)
      .run();

    const row = await c.env.DB
      .prepare('SELECT * FROM contact_marks WHERE id = ?')
      .bind(id)
      .first<ContactMark>();

    return c.json({ success: true, data: serializeMark(row!) }, 201);
  } catch (err) {
    console.error('POST /api/marks error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/marks/:id
marks.patch('/api/marks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; color?: string; sortOrder?: number }>();

    const existing = await c.env.DB
      .prepare('SELECT * FROM contact_marks WHERE id = ?')
      .bind(id)
      .first<ContactMark>();
    if (!existing) return c.json({ success: false, error: 'Mark not found' }, 404);

    const name = body.name ?? existing.name;
    const color = body.color ?? existing.color;
    const sortOrder = body.sortOrder ?? existing.sort_order;

    await c.env.DB
      .prepare('UPDATE contact_marks SET name = ?, color = ?, sort_order = ? WHERE id = ?')
      .bind(name, color, sortOrder, id)
      .run();

    const updated = await c.env.DB
      .prepare('SELECT * FROM contact_marks WHERE id = ?')
      .bind(id)
      .first<ContactMark>();

    return c.json({ success: true, data: serializeMark(updated!) });
  } catch (err) {
    console.error('PATCH /api/marks/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/marks/:id
marks.delete('/api/marks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM contact_marks WHERE id = ?').bind(id).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/marks/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/friends/:friendId/mark
marks.patch('/api/friends/:friendId/mark', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const body = await c.req.json<{ markId: string | null }>();

    const friend = await c.env.DB
      .prepare('SELECT id FROM friends WHERE id = ?')
      .bind(friendId)
      .first<{ id: string }>();
    if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);

    await c.env.DB
      .prepare('UPDATE friends SET contact_mark_id = ? WHERE id = ?')
      .bind(body.markId, friendId)
      .run();

    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PATCH /api/friends/:friendId/mark error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { marks };
```

- [ ] **Step 2: index.ts に marks ルートを登録**

`apps/worker/src/index.ts` のインポート部分に追加:
```typescript
import { marks } from './routes/marks.js';
```

`app.route('/', repairRoutes);` の直後に追加:
```typescript
app.route('/', marks);
```

- [ ] **Step 3: commit**

```bash
git add apps/worker/src/routes/marks.ts apps/worker/src/index.ts
git commit -m "feat: add contact marks CRUD API endpoints"
```

---

## Task 3: Webhook に setContactMark ヘルパーと自動マーク変更を追加

**Files:**
- Modify: `apps/worker/src/routes/webhook.ts`

Webhookの自動マーク変更ポイント:

| コード内の位置 | アクション | マークID |
|---|---|---|
| Line 693 (follow event) | 友だち追加 | mark_01 |
| Line ~917 (`見積もりを始める` text / `start_repair` postback) | メニュー表示 | mark_17 |
| Line ~1281 (`select_product` postback) | 製品選択 | mark_16 |
| Line ~1317 (`select_model` postback) | モデル名選択 | mark_18 |
| Line ~1393 (`select_symptom` postback) | 症状選択 | mark_21 |
| Line ~1477 (`request_type` postback) | ご依頼可否選択 | mark_22 |
| Line ~1485 (request_type mail) | 郵送で依頼 | mark_23 |
| Line ~1104 (text: `来店予約する`) | 来店予約 | mark_04 |
| Line ~1513 (`select_store` postback) | 発送先選択 | mark_24 |
| Line ~1503 (request_type consult) | 質問・相談 | mark_11 |

- [ ] **Step 1: setContactMark ヘルパー関数を webhook.ts に追加**

`handleEvent` 関数の直前（Line 682 の直前）に以下を挿入:

```typescript
async function setContactMark(db: D1Database, friendId: string, markId: string): Promise<void> {
  try {
    await db.prepare('UPDATE friends SET contact_mark_id = ? WHERE id = ?').bind(markId, friendId).run();
  } catch (err) {
    console.error('setContactMark error:', err);
  }
}
```

- [ ] **Step 2: 友だち追加時 (follow event) — mark_01**

Line 781 の `await fireEvent(...)` の直後に追加:
```typescript
await setContactMark(db, friend.id, 'mark_01');
```

- [ ] **Step 3: start_repair postback — mark_17**

Line 1560-1568 の `action === 'start_repair'` ブロック内、`replyAndLog` の前に追加:
```typescript
await setContactMark(db, friend.id, 'mark_17');
```

また、Line ~917 のリッチメニュー `見積もりを始める` テキスト処理の `replyAndLog` の前にも追加:
```typescript
await setContactMark(db, friend.id, 'mark_17');
```

- [ ] **Step 4: select_product postback — mark_16**

Line 1290-1292 (setFriendAttribute 呼び出し群) の後、`replyAndLog` の前に追加:
```typescript
await setContactMark(db, friend.id, 'mark_16');
```

- [ ] **Step 5: select_model postback — mark_18**

Line 1317-1333 の `action === 'select_model'` ブロック内、`setFriendAttribute(modelName)` の後に追加:
```typescript
await setContactMark(db, friend.id, 'mark_18');
```

- [ ] **Step 6: select_symptom postback — mark_21**

Line 1393-1474 の `action === 'select_symptom'` ブロック内、`setFriendAttribute(repair_symptom_id)` の後に追加:
```typescript
await setContactMark(db, friend.id, 'mark_21');
```

- [ ] **Step 7: request_type postback — mark_22 / mark_23 / mark_11**

Line 1477 の `action === 'request_type'` ブロック内:

```typescript
// 共通: ご依頼可否選択 → mark_22
await setContactMark(db, friend.id, 'mark_22');

if (type === 'mail') {
  await setContactMark(db, friend.id, 'mark_23');  // 郵送依頼
  // ... existing reply code
} else if (type === 'store') {
  // store選択へ進む (mark_24 は select_store で設定)
  // ... existing reply code
} else {
  await setContactMark(db, friend.id, 'mark_11');  // 相談
  // ... existing reply code
}
```

- [ ] **Step 8: 来店予約するテキスト — mark_04**

Line 1104 の `incomingText === '来店予約する'` ブロック内、`replyAndLog` の前に追加:
```typescript
await setContactMark(db, friend.id, 'mark_04');
```

- [ ] **Step 9: select_store postback — mark_24**

Line 1513 の `action === 'select_store'` ブロック内（`storeKey === 'none'` の分岐の後）、`setFriendAttribute(repair_store)` の後に追加:
```typescript
await setContactMark(db, friend.id, 'mark_24');
```

- [ ] **Step 10: commit**

```bash
git add apps/worker/src/routes/webhook.ts
git commit -m "feat: add setContactMark helper and auto-mark triggers in webhook"
```

---

## Task 4: repair.ts にマーク変更を追加

**Files:**
- Modify: `apps/worker/src/routes/repair.ts`

- [ ] **Step 1: setContactMark 関数を repair.ts にも追加**

repair.ts のインポート後、route ハンドラーの前に追加:
```typescript
async function setContactMark(db: D1Database, friendId: string, markId: string): Promise<void> {
  try {
    await db.prepare('UPDATE friends SET contact_mark_id = ? WHERE id = ?').bind(markId, friendId).run();
  } catch (err) {
    console.error('setContactMark error:', err);
  }
}
```

- [ ] **Step 2: 郵送修理フォーム送信完了 — mark_03 / mark_27**

POST /api/repair/mail-orders の処理内、`mail_orders` 挿入後に追加:

```typescript
// 梱包キット希望 → mark_27、それ以外 → mark_03
if (packagingKit) {
  await setContactMark(c.env.DB, friend.id, 'mark_27');
} else {
  await setContactMark(c.env.DB, friend.id, 'mark_03');
}
```

- [ ] **Step 3: commit**

```bash
git add apps/worker/src/routes/repair.ts
git commit -m "feat: auto-mark on mail order form submission"
```

---

## Task 5: Web API クライアントにマーク関連メソッドを追加

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: ContactMark 型と marks API を追加**

`api.ts` の型定義の後（`export type FriendWithTags = ...` の前あたり）に追加:
```typescript
export type ContactMark = {
  id: string
  name: string
  color: string
  sortOrder: number
  isDefault: boolean
  createdAt: string
}
```

`api` オブジェクトに `marks` プロパティを追加（`tags:` の後など）:
```typescript
marks: {
  list: () =>
    fetchApi<ApiResponse<ContactMark[]>>('/api/marks'),
  create: (data: { name: string; color: string; sortOrder?: number }) =>
    fetchApi<ApiResponse<ContactMark>>('/api/marks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; color?: string; sortOrder?: number }) =>
    fetchApi<ApiResponse<ContactMark>>(`/api/marks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<ApiResponse<null>>(`/api/marks/${id}`, { method: 'DELETE' }),
},
```

`api.friends` に `updateMark` を追加:
```typescript
updateMark: (friendId: string, markId: string | null) =>
  fetchApi<ApiResponse<null>>(`/api/friends/${friendId}/mark`, {
    method: 'PATCH',
    body: JSON.stringify({ markId }),
  }),
```

また `FriendWithTags` の型を拡張:
```typescript
export type FriendWithTags = Friend & { tags: Tag[]; contactMarkId?: string | null }
```

- [ ] **Step 2: 友だち一覧レスポンスに contactMarkId を含めるよう friends.ts を修正**

`apps/worker/src/routes/friends.ts` の `serializeFriend` に `contactMarkId` を追加:
```typescript
function serializeFriend(row: DbFriend) {
  return {
    id: row.id,
    lineUserId: row.line_user_id,
    displayName: row.display_name,
    pictureUrl: row.picture_url,
    statusMessage: row.status_message,
    isFollowing: Boolean(row.is_following),
    metadata: JSON.parse(row.metadata || '{}'),
    refCode: (row as unknown as Record<string, unknown>).ref_code as string | null,
    contactMarkId: (row as unknown as Record<string, unknown>).contact_mark_id as string | null,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 3: commit**

```bash
git add apps/web/src/lib/api.ts apps/worker/src/routes/friends.ts
git commit -m "feat: add marks API client methods and contactMarkId to friend serializer"
```

---

## Task 6: 対応マーク設定ページ（/marks）を作成

**Files:**
- Create: `apps/web/src/app/marks/page.tsx`
- Modify: `apps/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1: marks/page.tsx を作成**

```tsx
// apps/web/src/app/marks/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { ContactMark } from '@/lib/api'
import Header from '@/components/layout/header'

export default function MarksPage() {
  const [marks, setMarks] = useState<ContactMark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<ContactMark | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#cccccc')
  const [saving, setSaving] = useState(false)

  const loadMarks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.marks.list()
      if (res.success) setMarks(res.data)
    } catch {
      setError('マークの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMarks() }, [loadMarks])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await api.marks.create({ name: newName, color: newColor, sortOrder: marks.length })
      if (res.success) {
        setNewName('')
        setNewColor('#cccccc')
        await loadMarks()
      }
    } catch {
      setError('マークの追加に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (mark: ContactMark) => {
    setSaving(true)
    try {
      await api.marks.update(mark.id, { name: mark.name, color: mark.color, sortOrder: mark.sortOrder })
      setEditing(null)
      await loadMarks()
    } catch {
      setError('マークの更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このマークを削除しますか？')) return
    try {
      await api.marks.delete(id)
      await loadMarks()
    } catch {
      setError('マークの削除に失敗しました')
    }
  }

  return (
    <div>
      <Header title="対応マーク設定" />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 新規追加 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">新しいマークを追加</h3>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-10 h-10 rounded cursor-pointer border border-gray-300"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="マーク名を入力..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || saving}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            追加
          </button>
        </div>
      </div>

      {/* マーク一覧 */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-400 text-sm">
          読み込み中...
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">色</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">マーク名</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">順番</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">デフォルト</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {marks.map((mark) => (
                <tr key={mark.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {editing?.id === mark.id ? (
                      <input
                        type="color"
                        value={editing.color}
                        onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                      />
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full border border-gray-200"
                        style={{ backgroundColor: mark.color }}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editing?.id === mark.id ? (
                      <input
                        type="text"
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    ) : (
                      <span className="text-sm text-gray-900">{mark.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editing?.id === mark.id ? (
                      <input
                        type="number"
                        value={editing.sortOrder}
                        onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    ) : (
                      <span className="text-sm text-gray-500">{mark.sortOrder}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {mark.isDefault && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        デフォルト
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {editing?.id === mark.id ? (
                        <>
                          <button
                            onClick={() => handleUpdate(editing)}
                            disabled={saving}
                            className="px-3 py-1 text-xs font-medium text-white rounded disabled:opacity-50"
                            style={{ backgroundColor: '#06C755' }}
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded hover:bg-gray-300"
                          >
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditing(mark)}
                            className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            編集
                          </button>
                          {!mark.isDefault && (
                            <button
                              onClick={() => handleDelete(mark.id)}
                              className="px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700"
                            >
                              削除
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: sidebar.tsx に「対応マーク設定」を追加**

`sidebar.tsx` の `menuSections` の「設定」セクション（`label: '設定'` の `items` 配列）の先頭に追加:

```typescript
{ href: '/marks', label: '対応マーク設定', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
```

- [ ] **Step 3: commit**

```bash
git add apps/web/src/app/marks/page.tsx apps/web/src/components/layout/sidebar.tsx
git commit -m "feat: add marks settings page and sidebar link"
```

---

## Task 7: 友だち一覧にマークドットとフィルターを追加

**Files:**
- Modify: `apps/web/src/components/friends/friend-table.tsx`
- Modify: `apps/web/src/app/friends/page.tsx`

- [ ] **Step 1: friend-table.tsx に markMap prop を追加し、マークドットを表示**

`FriendTableProps` インターフェースに追加:
```typescript
interface FriendTableProps {
  friends: FriendWithTags[]
  allTags: Tag[]
  allMarks: ContactMark[]
  onRefresh: () => void
}
```

コンポーネント内に markMap を構築:
```typescript
const markMap = useMemo(
  () => new Map(allMarks.map((m) => [m.id, m])),
  [allMarks]
)
```

各行の「展開インジケーター」列の前に、マークドット列を追加:
```tsx
{/* Mark dot */}
<td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
  <div className="relative group">
    <button
      className="w-5 h-5 rounded-full border border-gray-300 flex-shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 transition-all"
      style={{ backgroundColor: markMap.get(friend.contactMarkId ?? '')?.color ?? '#e5e7eb' }}
      onClick={(e) => {
        e.stopPropagation()
        setMarkSelectorFor(markSelectorFor === friend.id ? null : friend.id)
      }}
      title={markMap.get(friend.contactMarkId ?? '')?.name ?? 'マークなし'}
    />
    {/* Tooltip */}
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
      {markMap.get(friend.contactMarkId ?? '')?.name ?? 'マークなし'}
    </div>
    {/* Dropdown */}
    {markSelectorFor === friend.id && (
      <div
        className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-64 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 flex items-center gap-2"
          onClick={() => handleMarkChange(friend.id, null)}
        >
          <span className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0" />
          マークなし
        </button>
        {allMarks.map((m) => (
          <button
            key={m.id}
            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
            onClick={() => handleMarkChange(friend.id, m.id)}
          >
            <span className="w-4 h-4 rounded-full flex-shrink-0 border border-gray-200" style={{ backgroundColor: m.color }} />
            <span className="truncate">{m.name}</span>
          </button>
        ))}
      </div>
    )}
  </div>
</td>
```

stateと handleMarkChange 関数を追加:
```typescript
const [markSelectorFor, setMarkSelectorFor] = useState<string | null>(null)

const handleMarkChange = async (friendId: string, markId: string | null) => {
  try {
    await api.friends.updateMark(friendId, markId)
    setMarkSelectorFor(null)
    onRefresh()
  } catch {
    setError('マークの変更に失敗しました')
  }
}
```

必要な import を追加:
```typescript
import { useMemo } from 'react'
import type { ContactMark } from '@/lib/api'
import { api } from '@/lib/api'
```

テーブルのヘッダー行にマーク列を追加:
```tsx
<th className="px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
  マーク
</th>
```

- [ ] **Step 2: page.tsx にマークフィルターとデータ取得を追加**

`friends/page.tsx` に marks state と fetch:
```typescript
const [allMarks, setAllMarks] = useState<ContactMark[]>([])
const [selectedMarkId, setSelectedMarkId] = useState('')

const loadMarks = useCallback(async () => {
  try {
    const res = await api.marks.list()
    if (res.success) setAllMarks(res.data)
  } catch { /* non-blocking */ }
}, [])

useEffect(() => { loadMarks() }, [loadMarks])
```

フィルターパラメータに markId を追加:
```typescript
if (selectedMarkId) params.markId = selectedMarkId
```

Worker側の `/api/friends` クエリに markId フィルターを追加 (`apps/worker/src/routes/friends.ts`):
```typescript
const markId = c.req.query('markId');
// ...
if (markId) {
  conditions.push('f.contact_mark_id = ?');
  binds.push(markId);
}
```

フィルターUIにマーク選択セレクトボックスを追加（タグフィルターの横）:
```tsx
<div className="flex items-center gap-2">
  <label className="text-sm text-gray-600 font-medium whitespace-nowrap">マーク:</label>
  <select
    className="text-sm border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
    value={selectedMarkId}
    onChange={(e) => setSelectedMarkId(e.target.value)}
  >
    <option value="">すべて</option>
    {allMarks.map((m) => (
      <option key={m.id} value={m.id}>{m.name}</option>
    ))}
  </select>
</div>
```

FriendTable に `allMarks` prop を渡す:
```tsx
<FriendTable
  friends={friends}
  allTags={allTags}
  allMarks={allMarks}
  onRefresh={loadFriends}
/>
```

- [ ] **Step 3: commit**

```bash
git add apps/web/src/components/friends/friend-table.tsx apps/web/src/app/friends/page.tsx apps/worker/src/routes/friends.ts
git commit -m "feat: add mark dot, mark filter, and mark dropdown to friends list"
```

---

## Task 8: チャット一覧・チャット詳細パネルにマーク表示を追加

**Files:**
- Modify: `apps/web/src/app/chats/page.tsx`

- [ ] **Step 1: チャットページにマーク state と API を追加**

page.tsx の state 群に以下を追加:
```typescript
const [allMarks, setAllMarks] = useState<ContactMark[]>([])
const [selectedMarkFilter, setSelectedMarkFilter] = useState('')
const [friendMarkMap, setFriendMarkMap] = useState<Map<string, string>>(new Map())
```

型定義に `ContactMark` を追加 (api.ts からインポート):
```typescript
import type { ContactMark } from '@/lib/api'
```

マーク一覧をロード:
```typescript
useEffect(() => {
  api.marks.list().then((res) => {
    if (res.success) setAllMarks(res.data)
  }).catch(() => {})
}, [])
```

- [ ] **Step 2: チャット一覧の各行にマークドットを表示**

チャット一覧の各チャット行（友だち名・アイコン行）の右端にマークドットを追加:
```tsx
{/* mark dot */}
{(() => {
  const markId = friendMarkMap.get(chat.friendId)
  const mark = allMarks.find((m) => m.id === markId)
  return (
    <div className="relative group flex-shrink-0">
      <div
        className="w-4 h-4 rounded-full border border-gray-200"
        style={{ backgroundColor: mark?.color ?? '#e5e7eb' }}
        title={mark?.name ?? 'マークなし'}
      />
      <div className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
        {mark?.name ?? 'マークなし'}
      </div>
    </div>
  )
})()}
```

- [ ] **Step 3: チャット詳細パネル（修理情報パネル）にマーク変更UIを追加**

既存の修理情報パネル（RepairInfoPanel または ChatDetailPanel）内に対応マーク表示・変更UIを追加:
```tsx
{/* 対応マーク */}
<div className="px-4 py-3 border-b border-gray-100">
  <p className="text-xs font-semibold text-gray-500 mb-2">対応マーク</p>
  <select
    className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
    value={currentFriendMarkId ?? ''}
    onChange={async (e) => {
      const markId = e.target.value || null
      await api.friends.updateMark(selectedFriendId, markId)
      setCurrentFriendMarkId(markId)
    }}
  >
    <option value="">マークなし</option>
    {allMarks.map((m) => (
      <option key={m.id} value={m.id}>{m.name}</option>
    ))}
  </select>
  {currentFriendMarkId && (
    <div className="mt-2 flex items-center gap-2">
      <div
        className="w-4 h-4 rounded-full border border-gray-200"
        style={{ backgroundColor: allMarks.find((m) => m.id === currentFriendMarkId)?.color ?? '#e5e7eb' }}
      />
      <span className="text-xs text-gray-600">
        {allMarks.find((m) => m.id === currentFriendMarkId)?.name}
      </span>
    </div>
  )}
</div>
```

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/chats/page.tsx
git commit -m "feat: add mark display and edit to chat list and detail panel"
```

---

## Task 9: デプロイ

- [ ] **Step 1: Worker をデプロイ**

```bash
npx wrangler deploy
```
Expected: `✅ Deployed ... (N ms)`

- [ ] **Step 2: Web をデプロイ**

```bash
npx vercel --prod --yes --cwd apps/web 2>&1 | grep -E "Aliased:|ready" | head -3
```
Expected: `Aliased macbook-repair-admin.vercel.app`

- [ ] **Step 3: 最終コミット**

```bash
git add -A && git commit -m "feat: full contact mark system with auto-mark rules"
```

---

## Self-Review

### Spec Coverage Check

| 要件 | 対応タスク |
|------|-----------|
| DBマイグレーション（contact_marks, friends.contact_mark_id, 31件初期データ） | Task 1 |
| GET/POST/PATCH/DELETE /api/marks | Task 2 |
| PATCH /api/friends/:friendId/mark | Task 2 |
| setContactMark ヘルパー | Task 3 |
| 友だち追加 → mark_01 | Task 3 Step 2 |
| メニュー表示 → mark_17 | Task 3 Step 3 |
| 製品選択 → mark_16 | Task 3 Step 4 |
| モデル名選択 → mark_18 | Task 3 Step 5 |
| 症状選択 → mark_21 | Task 3 Step 6 |
| ご依頼可否選択 → mark_22 | Task 3 Step 7 |
| 郵送依頼 → mark_23 | Task 3 Step 7 |
| 来店予約 → mark_04 | Task 3 Step 8 |
| 発送先選択 → mark_24 | Task 3 Step 9 |
| 質問・相談 → mark_11 | Task 3 Step 7 |
| フォーム送信完了 → mark_03 / mark_27 | Task 4 |
| Web API marks methods | Task 5 |
| contactMarkId を friends レスポンスに含める | Task 5 |
| マーク設定ページ（/marks） | Task 6 |
| サイドバーに「対応マーク設定」 | Task 6 |
| 友だち一覧マークドット + クリックで変更 | Task 7 |
| 友だち一覧マークフィルター | Task 7 |
| チャット一覧マークドット | Task 8 |
| チャット詳細パネル マーク変更 | Task 8 |
| デプロイ | Task 9 |

### Potential Issues

1. **`年式選択済み` (mark_19) と `インチ数選択済み` (mark_20)** — 仕様表には含まれていないため未実装（仕様表の「ユーザーアクション」列に記載なし）。必要であれば `select_year` → mark_19、`select_inch` → mark_20 を Task 3 に追加。

2. **チャットページのフレンドのマーク情報** — チャット一覧APIが `contactMarkId` を返さない場合は、friend情報を別途フェッチするか、chats APIを拡張する必要がある。チャットページの実装時にAPIレスポンスを確認して対応する。

3. **ドロップダウンの閉じ方** — `markSelectorFor` は現在クリック外では閉じない。`useEffect` で `mousedown` イベントを登録して外クリックで閉じる実装が望ましい（UX向上のため追加推奨）。
