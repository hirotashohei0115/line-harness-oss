'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { CrossAnalysis, CrossRunResult, CrossGroup, CrossAxisDef, CrossCondition } from '@/lib/api'
import type { Tag } from '@line-crm/shared'
import type { ContactMark } from '@/lib/api'

interface Props {
  initial?: CrossAnalysis
}

const REPAIR_METHODS = [
  { id: 'mail', label: '郵送' },
  { id: 'store', label: '来店' },
  { id: 'consult', label: '相談' },
]

const DELIVERY_STORES = [
  { id: '菖蒲', label: '菖蒲店' },
  { id: '盛岡', label: '盛岡店' },
  { id: '岐阜', label: '岐阜店' },
  { id: '大分', label: '大分店' },
]

function defaultAxis(label: string): CrossAxisDef {
  return { label, groups: [{ name: '', conditions: [] }] }
}

export default function CrossAnalysisForm({ initial }: Props) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const [name, setName] = useState(initial?.name ?? '')
  const [from, setFrom] = useState(thirtyDaysAgo)
  const [to, setTo] = useState(today)
  const [axis1, setAxis1] = useState<CrossAxisDef>(
    initial ? { label: initial.axis1Label, groups: initial.axis1Groups } : defaultAxis('軸1')
  )
  const [axis2, setAxis2] = useState<CrossAxisDef>(
    initial ? { label: initial.axis2Label, groups: initial.axis2Groups } : defaultAxis('軸2')
  )

  const [tags, setTags] = useState<Tag[]>([])
  const [marks, setMarks] = useState<ContactMark[]>([])
  const [result, setResult] = useState<CrossRunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalCell, setModalCell] = useState<{ axis1: string; axis2: string; count: number } | null>(null)

  useEffect(() => {
    api.tags.list().then((r) => { if (r.success) setTags(r.data) }).catch(() => {})
    api.marks.list().then((r) => { if (r.success) setMarks(r.data) }).catch(() => {})
  }, [])

  const handleRun = useCallback(async () => {
    setRunning(true)
    setError('')
    try {
      const res = await api.crossAnalyses.run({ name: name || 'クロス分析', period: { from, to }, axis1, axis2 })
      if (res.success) setResult(res.data)
      else setError('分析に失敗しました')
    } catch { setError('分析に失敗しました') }
    finally { setRunning(false) }
  }, [name, from, to, axis1, axis2])

  const handleSave = async () => {
    if (!name.trim()) { setError('分析名を入力してください'); return }
    setSaving(true)
    setError('')
    try {
      if (initial) {
        await api.crossAnalyses.update(initial.id, { name, axis1, axis2 })
      } else {
        const res = await api.crossAnalyses.create({ name, axis1, axis2 })
        if (res.success) { router.push('/cross-analyses'); return }
      }
      router.push('/cross-analyses')
    } catch { setError('保存に失敗しました') }
    finally { setSaving(false) }
  }

  const updateAxis = (which: 'axis1' | 'axis2', patch: Partial<CrossAxisDef>) => {
    if (which === 'axis1') setAxis1((a) => ({ ...a, ...patch }))
    else setAxis2((a) => ({ ...a, ...patch }))
  }

  const updateGroup = (which: 'axis1' | 'axis2', idx: number, patch: Partial<CrossGroup>) => {
    const setter = which === 'axis1' ? setAxis1 : setAxis2
    setter((a) => ({ ...a, groups: a.groups.map((g, i) => i === idx ? { ...g, ...patch } : g) }))
  }

  const addGroup = (which: 'axis1' | 'axis2') => {
    const setter = which === 'axis1' ? setAxis1 : setAxis2
    setter((a) => ({ ...a, groups: [...a.groups, { name: '', conditions: [] }] }))
  }

  const removeGroup = (which: 'axis1' | 'axis2', idx: number) => {
    const setter = which === 'axis1' ? setAxis1 : setAxis2
    setter((a) => ({ ...a, groups: a.groups.filter((_, i) => i !== idx) }))
  }

  const addCondition = (which: 'axis1' | 'axis2', gIdx: number) => {
    const setter = which === 'axis1' ? setAxis1 : setAxis2
    setter((a) => ({
      ...a,
      groups: a.groups.map((g, i) => i === gIdx
        ? { ...g, conditions: [...g.conditions, { type: 'tag' as const, ids: [] }] }
        : g)
    }))
  }

  const removeCondition = (which: 'axis1' | 'axis2', gIdx: number, cIdx: number) => {
    const setter = which === 'axis1' ? setAxis1 : setAxis2
    setter((a) => ({
      ...a,
      groups: a.groups.map((g, i) => i === gIdx
        ? { ...g, conditions: g.conditions.filter((_, ci) => ci !== cIdx) }
        : g)
    }))
  }

  const updateCondition = (which: 'axis1' | 'axis2', gIdx: number, cIdx: number, patch: Partial<CrossCondition>) => {
    const setter = which === 'axis1' ? setAxis1 : setAxis2
    setter((a) => ({
      ...a,
      groups: a.groups.map((g, i) => i === gIdx
        ? { ...g, conditions: g.conditions.map((c, ci) => ci === cIdx ? { ...c, ...patch } : c) }
        : g)
    }))
  }

  const toggleConditionId = (which: 'axis1' | 'axis2', gIdx: number, cIdx: number, id: string) => {
    const axis = which === 'axis1' ? axis1 : axis2
    const condition = axis.groups[gIdx]?.conditions[cIdx]
    if (!condition) return
    const ids = condition.ids.includes(id) ? condition.ids.filter((x) => x !== id) : [...condition.ids, id]
    updateCondition(which, gIdx, cIdx, { ids })
  }

  const getConditionOptions = (type: CrossCondition['type']) => {
    if (type === 'tag') return tags.map((t) => ({ id: t.id, label: t.name, color: t.color || '#3B82F6' }))
    if (type === 'contact_mark') return marks.map((m) => ({ id: m.id, label: m.name, color: m.color }))
    if (type === 'repair_method') return REPAIR_METHODS.map((m) => ({ id: m.id, label: m.label, color: '#6b7280' }))
    if (type === 'delivery_store') return DELIVERY_STORES.map((s) => ({ id: s.id, label: s.label, color: '#6b7280' }))
    return []
  }

  // 列合計: APIから直接受け取った値（軸2グループの全ユーザー数）を優先
  const colTotals = result
    ? (result.colTotals
        ? result.colTotals.map((c) => c.count)
        : result.rows[0]?.cells.map((_, ci) =>
            result.rows.reduce((sum, row) => sum + row.cells[ci].count, 0)
          ) ?? [])
    : []
  // 列ヘッダー用グループ名リスト（colTotalsから取得）
  const axis2ColHeaders = result?.colTotals ?? result?.rows[0]?.cells ?? []
  const grandTotal = result ? result.rows.reduce((sum, row) => sum + row.total, 0) : 0

  const exportCSV = () => {
    if (!result) return
    const header = ['', ...result.rows[0].cells.map((c) => c.group), '合計']
    const rows = result.rows.map((r) => [r.group, ...r.cells.map((c) => c.count), r.total])
    const footer = ['合計', ...(colTotals ?? []), grandTotal]
    const csv = [header, ...rows, footer].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const AxisBuilder = ({ which, axis }: { which: 'axis1' | 'axis2'; axis: CrossAxisDef }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-white px-2 py-0.5 rounded" style={{ backgroundColor: which === 'axis1' ? '#3b82f6' : '#8b5cf6' }}>
          {which === 'axis1' ? '軸1（行）' : '軸2（列）'}
        </span>
        <input type="text" value={axis.label} onChange={(e) => updateAxis(which, { label: e.target.value })}
          placeholder="軸ラベル（例：依頼方法）"
          className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        <button onClick={() => addGroup(which)} className="text-xs px-2 py-1 font-medium text-white rounded" style={{ backgroundColor: '#06C755' }}>
          + グループ
        </button>
      </div>
      <div className="space-y-3">
        {axis.groups.map((group, gIdx) => (
          <div key={gIdx} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-500 font-medium w-4">{gIdx + 1}</span>
              <input type="text" value={group.name} onChange={(e) => updateGroup(which, gIdx, { name: e.target.value })}
                placeholder="グループ名"
                className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button onClick={() => addCondition(which, gIdx)} className="text-xs px-2 py-1 text-blue-600 hover:text-blue-800">+ 条件</button>
              {axis.groups.length > 1 && (
                <button onClick={() => removeGroup(which, gIdx)} className="text-xs text-red-400 hover:text-red-600">削除</button>
              )}
            </div>
            {group.conditions.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-1">条件を追加してください（未設定=全員）</p>
            )}
            {group.conditions.map((cond, cIdx) => {
              const options = getConditionOptions(cond.type)
              return (
                <div key={cIdx} className="bg-white border border-gray-200 rounded p-2 mb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <select value={cond.type}
                      onChange={(e) => updateCondition(which, gIdx, cIdx, { type: e.target.value as CrossCondition['type'], ids: [] })}
                      className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-green-500">
                      <option value="tag">タグ</option>
                      <option value="contact_mark">対応マーク</option>
                      <option value="repair_method">依頼方法</option>
                      <option value="delivery_store">配送先店舗</option>
                    </select>
                    <button onClick={() => removeCondition(which, gIdx, cIdx)} className="text-xs text-red-400 hover:text-red-600 ml-auto">×</button>
                  </div>
                  <div className="max-h-28 overflow-y-auto border border-gray-100 rounded">
                    {options.length === 0 ? <p className="p-2 text-xs text-gray-400">選択肢なし</p> :
                      options.map((opt) => (
                        <label key={opt.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0">
                          <input type="checkbox" checked={cond.ids.includes(opt.id)}
                            onChange={() => toggleConditionId(which, gIdx, cIdx, opt.id)} className="rounded" />
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                          <span className="text-xs truncate">{opt.label}</span>
                        </label>
                      ))
                    }
                  </div>
                  {cond.ids.length > 0 && <p className="text-xs text-gray-400 mt-1">{cond.ids.length}件選択（OR）</p>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Settings */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">分析名</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：郵送依頼×機種分析"
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">開始日</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">終了日</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <AxisBuilder which="axis1" axis={axis1} />
        <AxisBuilder which="axis2" axis={axis2} />
      </div>

      <div className="flex gap-3 mb-6">
        <button onClick={() => router.back()} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">キャンセル</button>
        <button onClick={handleRun} disabled={running}
          className="px-6 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#3b82f6' }}>
          {running ? '分析中...' : '▶ 分析実行'}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ml-auto" style={{ backgroundColor: '#06C755' }}>
          {saving ? '保存中...' : initial ? '更新して保存' : '保存'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">
              {result.name} — {result.period.from} 〜 {result.period.to}
            </h3>
            <button onClick={exportCSV} className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 font-medium">
              CSV出力
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 min-w-[120px]">
                    {result.axis1Label} ＼ {result.axis2Label}
                  </th>
                  {axis2ColHeaders.map((c, ci) => (
                    <th key={ci} className="border border-gray-200 bg-blue-50 px-3 py-2 text-center text-xs font-semibold text-blue-700 min-w-[80px]">
                      {c.group || `グループ${ci + 1}`}
                    </th>
                  ))}
                  <th className="border border-gray-200 bg-gray-100 px-3 py-2 text-center text-xs font-semibold text-gray-600 min-w-[80px]">合計</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50">
                    <td className="border border-gray-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700">
                      {row.group || `グループ${ri + 1}`}
                    </td>
                    {row.cells.map((cell, ci) => (
                      <td key={ci} className="border border-gray-200 px-3 py-2 text-center">
                        <button
                          onClick={() => setModalCell({ axis1: row.group || `グループ${ri + 1}`, axis2: cell.group || `グループ${ci + 1}`, count: cell.count })}
                          className={`text-sm font-medium hover:underline ${cell.count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          {cell.count}
                        </button>
                      </td>
                    ))}
                    <td className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm font-bold text-gray-700">{row.total}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">列合計（軸2）</td>
                  {colTotals.map((t, ci) => (
                    <td key={ci} className="border border-gray-200 px-3 py-2 text-center text-sm font-bold text-gray-700">{t}</td>
                  ))}
                  <td className="border border-gray-200 bg-gray-100 px-3 py-2 text-center text-sm font-bold text-gray-900">{grandTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModalCell(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">{modalCell.axis1} × {modalCell.axis2}</h3>
            <p className="text-3xl font-bold text-blue-600 mb-4">{modalCell.count} 人</p>
            <p className="text-xs text-gray-400 mb-4">※ 詳細なユーザー一覧は友だち管理画面でご確認ください</p>
            <button onClick={() => setModalCell(null)} className="w-full py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg">閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}
