'use client'
import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

interface SwitchRepairPrice {
  id: string
  category: 'main' | 'controller'
  model: string
  symptom: string
  price_min: number | null
  price_max: number | null
  is_consultation: number
  is_not_applicable: number
  note: string | null
  sort_order: number
}

const MAIN_MODELS    = ['Switch', 'Switch Lite', 'Switch有機EL', 'Switch 2']
const CTRL_MODELS    = ['Joy-Con', 'Proコン', 'Switch Lite (コン)', 'Joy-Con 2']
const TABS = [
  { key: 'main',       label: '本体' },
  { key: 'controller', label: 'コントローラー' },
]

function formatPrice(row: SwitchRepairPrice): string {
  if (row.is_not_applicable) return '—'
  if (row.is_consultation)   return '要相談'
  if (row.price_min == null) return '—'
  if (row.price_max != null) return `¥${row.price_min.toLocaleString()}〜¥${row.price_max.toLocaleString()}`
  return `¥${row.price_min.toLocaleString()}${row.price_max == null && row.note == null ? '' : ''}`
}

interface EditState {
  price_min: string
  price_max: string
  is_consultation: boolean
  is_not_applicable: boolean
  note: string
}

function toEditState(row: SwitchRepairPrice): EditState {
  return {
    price_min: row.price_min != null ? String(row.price_min) : '',
    price_max: row.price_max != null ? String(row.price_max) : '',
    is_consultation: !!row.is_consultation,
    is_not_applicable: !!row.is_not_applicable,
    note: row.note ?? '',
  }
}

export default function SwitchRepairPricesPage() {
  const [prices, setPrices] = useState<SwitchRepairPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'main' | 'controller'>('main')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: SwitchRepairPrice[] }>('/api/switch-repair/prices')
      if (res.success) setPrices(res.data)
    } catch { setError('読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const models   = tab === 'main' ? MAIN_MODELS : CTRL_MODELS
  const filtered = prices.filter(p => p.category === tab)

  const symptoms = Array.from(
    new Map(
      filtered
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(p => [p.symptom, p.sort_order])
    ).entries()
  ).map(([symptom]) => symptom)

  function getCell(symptom: string, model: string): SwitchRepairPrice | undefined {
    return filtered.find(p => p.symptom === symptom && p.model === model)
  }

  function startEdit(row: SwitchRepairPrice) {
    setEditingId(row.id)
    setEditState(toEditState(row))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
  }

  async function saveEdit(id: string) {
    if (!editState) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        price_min: editState.is_consultation || editState.is_not_applicable ? null
          : editState.price_min !== '' ? Number(editState.price_min) : null,
        price_max: editState.is_consultation || editState.is_not_applicable ? null
          : editState.price_max !== '' ? Number(editState.price_max) : null,
        is_consultation: editState.is_consultation ? 1 : 0,
        is_not_applicable: editState.is_not_applicable ? 1 : 0,
        note: editState.note || null,
      }
      const res = await fetchApi<{ success: boolean; data: SwitchRepairPrice }>(`/api/switch-repair/prices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.success) {
        setPrices(prev => prev.map(p => p.id === id ? res.data : p))
        cancelEdit()
      }
    } catch { setError('保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <Header title="Switch修理料金設定" />
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* タブ */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key as 'main' | 'controller'); cancelEdit() }}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-400 text-sm">読み込み中...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 min-w-[120px]">症状</th>
                {models.map(m => (
                  <th key={m} className="px-4 py-3 text-center font-semibold text-gray-600 min-w-[140px]">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {symptoms.map(symptom => (
                <tr key={symptom} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">{symptom}</td>
                  {models.map(model => {
                    const cell = getCell(symptom, model)
                    if (!cell) return <td key={model} className="px-4 py-3 text-center text-gray-300">—</td>
                    const isEditing = editingId === cell.id

                    return (
                      <td key={model} className="px-4 py-3 text-center">
                        {isEditing && editState ? (
                          <div className="text-left space-y-2 min-w-[160px]">
                            <div className="flex gap-3 text-xs">
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editState.is_not_applicable}
                                  onChange={e => setEditState(s => s ? { ...s, is_not_applicable: e.target.checked, is_consultation: false } : s)}
                                />
                                対象外(—)
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editState.is_consultation}
                                  onChange={e => setEditState(s => s ? { ...s, is_consultation: e.target.checked, is_not_applicable: false } : s)}
                                />
                                要相談
                              </label>
                            </div>
                            {!editState.is_not_applicable && !editState.is_consultation && (
                              <div className="space-y-1">
                                <input
                                  type="number"
                                  placeholder="最低価格"
                                  value={editState.price_min}
                                  onChange={e => setEditState(s => s ? { ...s, price_min: e.target.value } : s)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                                />
                                <input
                                  type="number"
                                  placeholder="最高価格（範囲の場合）"
                                  value={editState.price_max}
                                  onChange={e => setEditState(s => s ? { ...s, price_max: e.target.value } : s)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                                />
                              </div>
                            )}
                            <input
                              type="text"
                              placeholder="備考"
                              value={editState.note}
                              onChange={e => setEditState(s => s ? { ...s, note: e.target.value } : s)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            />
                            <div className="flex gap-1 pt-1">
                              <button
                                onClick={() => saveEdit(cell.id)}
                                disabled={saving}
                                className="flex-1 px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                              >
                                保存
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50"
                              >
                                キャンセル
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(cell)}
                            className="w-full text-center hover:bg-green-50 rounded px-2 py-1 transition-colors group"
                          >
                            <span className={`font-medium ${
                              cell.is_not_applicable ? 'text-gray-300'
                              : cell.is_consultation ? 'text-orange-500'
                              : 'text-gray-800'
                            }`}>
                              {formatPrice(cell)}
                            </span>
                            {cell.note && (
                              <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{cell.note}</p>
                            )}
                            <span className="block text-[10px] text-gray-300 group-hover:text-green-500 mt-0.5">クリックで編集</span>
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
