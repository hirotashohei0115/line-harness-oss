'use client'
import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi, api } from '@/lib/api'

const STORE_LIST = [
  '青森店', '盛岡店', '宇都宮店', '菖蒲店', '成田店', '幕張店',
  '錦糸町店', '五反田店', '長岡店', '岐阜店', '木津川店', '大分店',
  '郵送修理センター盛岡店', '郵送修理センター菖蒲店',
  '郵送修理センター岐阜店', '郵送修理センター大分店',
]

interface StaffAccount {
  id: string
  email: string
  name: string
  role: 'admin' | 'staff'
  assignedStores: string[]
  assignedTags: string[]
  isActive: boolean
  created_at: string
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
      role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
    }`}>
      {role === 'admin' ? '管理者' : 'スタッフ'}
    </span>
  )
}

interface FormState {
  email: string
  name: string
  role: 'admin' | 'staff'
  assignedStores: string[]
  assignedTags: string[]
  password: string
}

const defaultForm: FormState = { email: '', name: '', role: 'staff', assignedStores: [], assignedTags: [], password: '' }

export default function StaffPage() {
  const [accounts, setAccounts] = useState<StaffAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<StaffAccount | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [myRole, setMyRole] = useState('')
  const [allTags, setAllTags] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    setMyRole(localStorage.getItem('lh_staff_role') || '')
  }, [])

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: StaffAccount[] }>('/api/staff/accounts')
      if (res.success) setAccounts(res.data)
    } catch { setError('読み込みに失敗しました') }
    setLoading(false)
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  useEffect(() => {
    api.tags.list().then(r => { if (r.success) setAllTags(r.data.map(t => ({ id: t.id, name: t.name }))) }).catch(() => {})
  }, [])

  const openCreate = () => { setEditTarget(null); setForm(defaultForm); setShowForm(true) }
  const openEdit = (a: StaffAccount) => {
    setEditTarget(a)
    setForm({ email: a.email, name: a.name, role: a.role, assignedStores: a.assignedStores, assignedTags: a.assignedTags ?? [], password: '' })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.email) return
    if (!editTarget && !form.password) return
    setSaving(true)
    try {
      if (editTarget) {
        const body: Record<string, unknown> = { name: form.name, email: form.email, role: form.role, assignedStores: form.assignedStores, assignedTags: form.assignedTags }
        if (form.password) body.password = form.password
        await fetchApi(`/api/staff/accounts/${editTarget.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      } else {
        await fetchApi('/api/staff/accounts', {
          method: 'POST',
          body: JSON.stringify({ email: form.email, name: form.name, role: form.role, assignedStores: form.assignedStores, assignedTags: form.assignedTags, password: form.password }),
        })
      }
      setShowForm(false)
      loadAccounts()
    } catch (err: unknown) {
      alert('保存に失敗しました: ' + String(err))
    }
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name} を削除しますか？`)) return
    try {
      await fetchApi(`/api/staff/accounts/${id}`, { method: 'DELETE' })
      loadAccounts()
    } catch { alert('削除に失敗しました') }
  }

  const toggleStore = (store: string) => {
    setForm(prev => ({
      ...prev,
      assignedStores: prev.assignedStores.includes(store)
        ? prev.assignedStores.filter(s => s !== store)
        : [...prev.assignedStores, store],
    }))
  }

  const toggleTag = (tagName: string) => {
    setForm(prev => ({
      ...prev,
      assignedTags: prev.assignedTags.includes(tagName)
        ? prev.assignedTags.filter(t => t !== tagName)
        : [...prev.assignedTags, tagName],
    }))
  }

  if (myRole !== 'admin' && myRole !== 'owner') {
    return (
      <div>
        <Header title="スタッフ管理" />
        <div className="text-center py-16 text-gray-400">管理者のみアクセスできます</div>
      </div>
    )
  }

  return (
    <div>
      <Header title="スタッフ管理" description="ログインアカウントと担当店舗の管理" action={
        <button onClick={openCreate} className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>
          + 新規追加
        </button>
      } />

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">名前</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">メール</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">役割</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">担当店舗</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-3 text-gray-600">{a.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={a.role} /></td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {a.assignedStores.length > 0 ? a.assignedStores.join(', ') : <span className="text-gray-400">全店舗</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(a)} className="text-xs text-blue-600 hover:underline mr-3">編集</button>
                    <button onClick={() => handleDelete(a.id, a.name)} className="text-xs text-red-400 hover:underline">削除</button>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">スタッフがいません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">{editTarget ? 'スタッフ編集' : '新規スタッフ追加'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">名前 <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">メールアドレス <span className="text-red-500">*</span></label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  パスワード {!editTarget && <span className="text-red-500">*</span>}
                  {editTarget && <span className="text-gray-400">（変更する場合のみ入力）</span>}
                </label>
                <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">役割</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as 'admin' | 'staff' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
              {form.role === 'staff' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">担当店舗</label>
                  <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                    {STORE_LIST.map(store => (
                      <label key={store} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                        <input type="checkbox" checked={form.assignedStores.includes(store)} onChange={() => toggleStore(store)} className="rounded" />
                        <span className="text-sm text-gray-700">{store}</span>
                      </label>
                    ))}
                  </div>
                  {form.assignedStores.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">{form.assignedStores.length}件選択中</p>
                  )}
                </div>
              )}
              {form.role === 'staff' && allTags.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">表示タグ</label>
                  <p className="text-xs text-gray-400 mb-2">選択したタグが付いているユーザーも表示されます（店舗 OR タグ）</p>
                  <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                    {allTags.map(tag => (
                      <label key={tag.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                        <input type="checkbox" checked={form.assignedTags.includes(tag.name)} onChange={() => toggleTag(tag.name)} className="rounded" />
                        <span className="text-sm text-gray-700">{tag.name}</span>
                      </label>
                    ))}
                  </div>
                  {form.assignedTags.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">{form.assignedTags.length}件選択中</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">キャンセル</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.email || (!editTarget && !form.password)}
                className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#06C755' }}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
