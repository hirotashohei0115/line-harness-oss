'use client'
import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

interface ModelPrice {
  id: string
  model_number: string
  product_type: string
  year: number
  inch_size: number
  symptom: string
  price: number | null
  delivery_days: string | null
}

type EditMap = Record<string, { price: string; deliveryDays: string }>

const PRODUCT_TABS = [
  { key: 'air', label: 'MacBook Air' },
  { key: 'pro', label: 'MacBook Pro' },
  { key: 'other', label: 'その他' },
]

export default function RepairPricesPage() {
  const [prices, setPrices] = useState<ModelPrice[]>([])
  const [edits, setEdits] = useState<EditMap>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [savingAll, setSavingAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('air')
  const [staffRole, setStaffRole] = useState<string | null>(null)

  useEffect(() => {
    setStaffRole(localStorage.getItem('lh_staff_role'))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: ModelPrice[] }>('/api/repair/model-prices')
      if (res.success) {
        setPrices(res.data)
        const map: EditMap = {}
        for (const p of res.data) {
          map[p.id] = {
            price: p.price != null ? String(p.price) : '',
            deliveryDays: p.delivery_days ?? '',
          }
        }
        setEdits(map)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (staffRole && staffRole === 'staff') {
    return (
      <div>
        <Header title="修理料金設定" description="仮見積もり料金の編集" />
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
          この画面は管理者以上のみ利用できます
        </div>
      </div>
    )
  }

  const handleChange = (id: string, field: 'price' | 'deliveryDays', value: string) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const handleSave = async (id: string) => {
    setSaving(prev => ({ ...prev, [id]: true }))
    try {
      const { price, deliveryDays } = edits[id] ?? {}
      await fetchApi(`/api/repair/model-prices/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          price: price !== '' ? Number(price) : null,
          deliveryDays: deliveryDays !== '' ? deliveryDays : null,
        }),
      })
      setPrices(prev => prev.map(p => p.id === id
        ? { ...p, price: price !== '' ? Number(price) : null, delivery_days: deliveryDays || null }
        : p
      ))
    } catch { alert('保存に失敗しました') }
    setSaving(prev => ({ ...prev, [id]: false }))
  }

  const isDirty = (p: ModelPrice) => {
    const edit = edits[p.id]
    if (!edit) return false
    return edit.price !== (p.price != null ? String(p.price) : '') ||
      edit.deliveryDays !== (p.delivery_days ?? '')
  }

  const handleSaveAll = async () => {
    const dirtyItems = prices.filter(p => p.product_type === tab && isDirty(p))
    if (dirtyItems.length === 0) return
    setSavingAll(true)
    await Promise.all(dirtyItems.map(p => handleSave(p.id)))
    setSavingAll(false)
  }

  const filtered = prices.filter(p => p.product_type === tab)
  const grouped = filtered.reduce<Record<string, ModelPrice[]>>((acc, p) => {
    const key = `${p.year}年 ${p.inch_size}インチ (${p.model_number})`
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <div>
      <Header title="修理料金設定" description="仮見積もりに表示される料金・納期を編集できます" />

      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {PRODUCT_TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={tab === t.key ? { backgroundColor: '#06C755' } : {}}>
              {t.label}
            </button>
          ))}
        </div>
        {prices.some(p => p.product_type === tab && isDirty(p)) && (
          <button
            onClick={handleSaveAll}
            disabled={savingAll}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {savingAll ? '保存中...' : '変更をすべて保存'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([groupLabel, items]) => (
            <div key={groupLabel} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">{groupLabel}</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="px-4 py-2 text-left font-medium">症状</th>
                    <th className="px-4 py-2 text-left font-medium w-32">料金（円）</th>
                    <th className="px-4 py-2 text-left font-medium w-36">納期</th>
                    <th className="px-4 py-2 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(p => {
                    const edit = edits[p.id] ?? { price: '', deliveryDays: '' }
                    const dirty = isDirty(p)
                    return (
                      <tr key={p.id} className={dirty ? 'bg-yellow-50' : ''}>
                        <td className="px-4 py-2 text-gray-700">{p.symptom}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={edit.price}
                            onChange={e => handleChange(p.id, 'price', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="未設定"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={edit.deliveryDays}
                            onChange={e => handleChange(p.id, 'deliveryDays', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="例: 3~7日"
                          />
                        </td>
                        <td className="px-4 py-2">
                          {dirty && (
                            <button
                              onClick={() => handleSave(p.id)}
                              disabled={saving[p.id]}
                              className="px-3 py-1 text-xs text-white rounded disabled:opacity-50"
                              style={{ backgroundColor: '#06C755' }}
                            >
                              {saving[p.id] ? '保存中' : '保存'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
