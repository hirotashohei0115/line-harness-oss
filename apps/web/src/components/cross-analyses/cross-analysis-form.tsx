'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { CrossAnalysis, CrossRunResult, AxisGroup } from '@/lib/api'
import type { Tag } from '@line-crm/shared'
import type { ContactMark } from '@/lib/api'

interface Props {
  initial?: CrossAnalysis
}

type AxisType = 'tag' | 'contact_mark'

type AxisGroupState = {
  id: string
  name: string
  itemIds: string[]
}

const AXIS_TYPE_OPTIONS: { value: AxisType; label: string }[] = [
  { value: 'tag', label: 'タグ' },
  { value: 'contact_mark', label: '対応マーク' },
]

interface AxisItem { id: string; name: string; color: string }

// ── Module-scope helpers (never defined inside the component render) ──────────
// Defining these outside prevents React from unmounting/remounting child
// components on each render due to changed function references, which would
// cause scroll position resets.

function toggleItemInGroup(
  groups: AxisGroupState[],
  setGroups: (g: AxisGroupState[]) => void,
  groupId: string,
  itemId: string,
) {
  setGroups(groups.map((grp) => {
    if (grp.id !== groupId) return grp
    const has = grp.itemIds.includes(itemId)
    return { ...grp, itemIds: has ? grp.itemIds.filter((x) => x !== itemId) : [...grp.itemIds, itemId] }
  }))
}

function updateGroupName(
  groups: AxisGroupState[],
  setGroups: (g: AxisGroupState[]) => void,
  groupId: string,
  name: string,
) {
  setGroups(groups.map((grp) => grp.id !== groupId ? grp : { ...grp, name }))
}

function removeGroup(
  groups: AxisGroupState[],
  setGroups: (g: AxisGroupState[]) => void,
  groupId: string,
) {
  setGroups(groups.filter((grp) => grp.id !== groupId))
}

function addGroup(
  groups: AxisGroupState[],
  setGroups: (g: AxisGroupState[]) => void,
) {
  const newId = crypto.randomUUID()
  setGroups([...groups, { id: newId, name: `グループ${groups.length + 1}`, itemIds: [] }])
}

// Single group panel — defined at module scope for stable reference
interface GroupPanelProps {
  group: AxisGroupState
  items: AxisItem[]
  groups: AxisGroupState[]
  setGroups: (g: AxisGroupState[]) => void
  canDelete: boolean
}

function GroupPanel({ group, items, groups, setGroups, canDelete }: GroupPanelProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={group.name}
          onChange={(e) => updateGroupName(groups, setGroups, group.id, e.target.value)}
          placeholder="グループ名"
          className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {canDelete && (
          <button
            onClick={() => removeGroup(groups, setGroups, group.id)}
            className="text-xs px-2 py-1 text-red-500 hover:text-red-700 border border-red-200 rounded"
          >削除</button>
        )}
      </div>
      <hr className="border-gray-100 mb-2" />
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">項目がありません</p>
      ) : (
        <div className="space-y-0.5 max-h-44 overflow-y-auto">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={group.itemIds.includes(item.id)}
                onChange={() => toggleItemInGroup(groups, setGroups, group.id, item.id)}
                className="rounded accent-green-500"
              />
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-sm text-gray-700">{item.name}</span>
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2">{group.itemIds.length}件選択中</p>
    </div>
  )
}

interface AxisSelectorProps {
  label: string
  color: string
  type: AxisType
  setType: (t: AxisType) => void
  items: AxisItem[]
  groups: AxisGroupState[]
  setGroups: (g: AxisGroupState[]) => void
}

function AxisSelector({ label, color, type, setType, items, groups, setGroups }: AxisSelectorProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-white px-2 py-0.5 rounded" style={{ backgroundColor: color }}>
          {label}
        </span>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as AxisType)
            // Reset groups when type changes
            setGroups([{ id: crypto.randomUUID(), name: 'グループ1', itemIds: [] }])
          }}
          className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          {AXIS_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {groups.map((grp) => (
          <GroupPanel
            key={grp.id}
            group={grp}
            items={items}
            groups={groups}
            setGroups={setGroups}
            canDelete={groups.length > 1}
          />
        ))}
      </div>

      <button
        onClick={() => addGroup(groups, setGroups)}
        className="mt-3 w-full text-sm text-green-600 hover:text-green-800 border border-dashed border-green-300 hover:border-green-500 rounded-lg py-2"
      >
        ＋ グループを追加
      </button>
    </div>
  )
}

// ── Helper: convert initial CrossAnalysis groups or itemIds to AxisGroupState[] ─
function initialGroups(axisGroups: AxisGroup[] | undefined, axisItemIds: string[]): AxisGroupState[] {
  if (axisGroups && axisGroups.length > 0) {
    return axisGroups.map((g) => ({ id: g.id, name: g.name, itemIds: g.itemIds }))
  }
  if (axisItemIds && axisItemIds.length > 0) {
    return axisItemIds.map((id) => ({ id, name: id, itemIds: [id] }))
  }
  return [{ id: crypto.randomUUID(), name: 'グループ1', itemIds: [] }]
}

export default function CrossAnalysisForm({ initial }: Props) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const [name, setName] = useState(initial?.name ?? '')
  const [from, setFrom] = useState(thirtyDaysAgo)
  const [to, setTo] = useState(today)
  const [axis1Type, setAxis1Type] = useState<AxisType>(initial?.axis1Type ?? 'tag')
  const [axis1Groups, setAxis1Groups] = useState<AxisGroupState[]>(() =>
    initialGroups(initial?.axis1Groups, initial?.axis1ItemIds ?? [])
  )
  const [axis2Type, setAxis2Type] = useState<AxisType>(initial?.axis2Type ?? 'contact_mark')
  const [axis2Groups, setAxis2Groups] = useState<AxisGroupState[]>(() =>
    initialGroups(initial?.axis2Groups, initial?.axis2ItemIds ?? [])
  )

  const [tags, setTags] = useState<Tag[]>([])
  const [marks, setMarks] = useState<ContactMark[]>([])
  const [result, setResult] = useState<CrossRunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  type ModalCell = {
    a1Name: string
    a2Name: string
    count: number
    axis1Type: AxisType
    axis2Type: AxisType
    axis1ItemIds: string[]
    axis2ItemIds: string[]
    period: { from: string; to: string }
  }
  const [modalCell, setModalCell] = useState<ModalCell | null>(null)
  const [modalUsers, setModalUsers] = useState<{ id: string; displayName: string; pictureUrl: string | null }[]>([])
  const [modalLoading, setModalLoading] = useState(false)

  useEffect(() => {
    api.tags.list().then((r) => { if (r.success) setTags(r.data) }).catch(() => {})
    api.marks.list().then((r) => { if (r.success) setMarks(r.data) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!modalCell || modalCell.count === 0) { setModalUsers([]); return }
    setModalLoading(true)
    api.crossAnalyses.users({
      period: modalCell.period,
      axis1: { type: modalCell.axis1Type, itemIds: modalCell.axis1ItemIds },
      axis2: { type: modalCell.axis2Type, itemIds: modalCell.axis2ItemIds },
    }).then((r) => {
      if (r.success) setModalUsers(r.data)
    }).catch(() => {}).finally(() => setModalLoading(false))
  }, [modalCell])

  const getAxisItems = (type: AxisType): AxisItem[] => {
    if (type === 'tag') return tags.map((t) => ({ id: t.id, name: t.name, color: t.color || '#3B82F6' }))
    return marks.map((m) => ({ id: m.id, name: m.name, color: m.color }))
  }

  const handleRun = useCallback(async () => {
    if (axis1Groups.length === 0 || axis1Groups.every((g) => g.itemIds.length === 0)) {
      setError('軸1に1つ以上の項目を持つグループを作成してください')
      return
    }
    if (axis2Groups.length === 0 || axis2Groups.every((g) => g.itemIds.length === 0)) {
      setError('軸2に1つ以上の項目を持つグループを作成してください')
      return
    }
    setRunning(true)
    setError('')
    try {
      const res = await api.crossAnalyses.run({
        name: name || 'クロス分析',
        period: { from, to },
        axis1: { type: axis1Type, itemIds: [], groups: axis1Groups },
        axis2: { type: axis2Type, itemIds: [], groups: axis2Groups },
      })
      if (res.success) setResult(res.data)
      else setError('分析に失敗しました')
    } catch { setError('分析に失敗しました') }
    finally { setRunning(false) }
  }, [name, from, to, axis1Type, axis1Groups, axis2Type, axis2Groups])

  const handleSave = async () => {
    if (!name.trim()) { setError('分析名を入力してください'); return }
    setSaving(true)
    setError('')
    try {
      if (initial) {
        await api.crossAnalyses.update(initial.id, {
          name,
          axis1: { type: axis1Type, itemIds: [], groups: axis1Groups },
          axis2: { type: axis2Type, itemIds: [], groups: axis2Groups },
        })
      } else {
        const res = await api.crossAnalyses.create({
          name,
          axis1: { type: axis1Type, itemIds: [], groups: axis1Groups },
          axis2: { type: axis2Type, itemIds: [], groups: axis2Groups },
        })
        if (res.success) { router.push('/cross-analyses'); return }
      }
      router.push('/cross-analyses')
    } catch { setError('保存に失敗しました') }
    finally { setSaving(false) }
  }

  const exportCSV = () => {
    if (!result) return
    const header = ['', ...result.axis2Items.map((i) => i.name), '行合計']
    const rows = result.axis1Items.map((a1) => [
      a1.name,
      ...result.axis2Items.map((a2) => result.cells[a1.id]?.[a2.id] ?? 0),
      displayRowTotals[a1.id] ?? 0,
    ])
    const footer = ['列合計（表示中）', ...result.axis2Items.map((a2) => displayColTotals[a2.id] ?? 0), grandTotal]
    const csv = [header, ...rows, footer].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${result.name}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Compute display totals from cells to guarantee table internal consistency
  const displayRowTotals: Record<string, number> = {}
  const displayColTotals: Record<string, number> = {}
  let grandTotal = 0
  if (result) {
    for (const a1 of result.axis1Items) {
      displayRowTotals[a1.id] = result.axis2Items.reduce((s, a2) => s + (result.cells[a1.id]?.[a2.id] ?? 0), 0)
    }
    for (const a2 of result.axis2Items) {
      displayColTotals[a2.id] = result.axis1Items.reduce((s, a1) => s + (result.cells[a1.id]?.[a2.id] ?? 0), 0)
    }
    grandTotal = Object.values(displayRowTotals).reduce((s, v) => s + v, 0)
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Settings */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">分析名</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="例：タグ×マーク分析"
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">開始日</label>
            <input
              type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">終了日</label>
            <input
              type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      </div>

      {/* Axis Selectors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <AxisSelector
          label="軸1（行）" color="#3b82f6"
          type={axis1Type} setType={setAxis1Type}
          items={getAxisItems(axis1Type)}
          groups={axis1Groups} setGroups={setAxis1Groups}
        />
        <AxisSelector
          label="軸2（列）" color="#8b5cf6"
          type={axis2Type} setType={setAxis2Type}
          items={getAxisItems(axis2Type)}
          groups={axis2Groups} setGroups={setAxis2Groups}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
        >キャンセル</button>
        <button
          onClick={handleRun} disabled={running}
          className="px-6 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: '#3b82f6' }}
        >{running ? '分析中...' : '▶ 分析実行'}</button>
        <button
          onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ml-auto"
          style={{ backgroundColor: '#06C755' }}
        >{saving ? '保存中...' : initial ? '更新して保存' : '保存'}</button>
      </div>

      {/* Results */}
      {result && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">
              {result.name} — {result.period.from} 〜 {result.period.to}
            </h3>
            <button
              onClick={exportCSV}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 font-medium"
            >CSV出力</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 min-w-[120px]">
                    軸1 ＼ 軸2
                  </th>
                  {result.axis2Items.map((a2) => (
                    <th key={a2.id} className="border border-gray-200 bg-blue-50 px-3 py-2 text-center text-xs font-semibold text-blue-700 min-w-[80px]">
                      {a2.name}
                    </th>
                  ))}
                  <th className="border border-gray-200 bg-gray-100 px-3 py-2 text-center text-xs font-semibold text-gray-600 min-w-[80px]">
                    行合計
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.axis1Items.map((a1) => (
                  <tr key={a1.id} className="hover:bg-gray-50">
                    <td className="border border-gray-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700">
                      {a1.name}
                    </td>
                    {result.axis2Items.map((a2) => {
                      const count = result.cells[a1.id]?.[a2.id] ?? 0
                      const a1Group = axis1Groups.find(g => g.id === a1.id)
                      const a2Group = axis2Groups.find(g => g.id === a2.id)
                      return (
                        <td key={a2.id} className="border border-gray-200 px-3 py-2 text-center">
                          <button
                            onClick={() => {
                              setModalUsers([])
                              setModalCell({
                                a1Name: a1.name, a2Name: a2.name, count,
                                axis1Type, axis2Type,
                                axis1ItemIds: a1Group?.itemIds ?? [],
                                axis2ItemIds: a2Group?.itemIds ?? [],
                                period: result.period,
                              })
                            }}
                            className={`text-sm font-medium hover:underline ${count > 0 ? 'text-blue-600 cursor-pointer' : 'text-gray-400 cursor-default'}`}
                          >{count}</button>
                        </td>
                      )
                    })}
                    <td className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm font-bold text-gray-700">
                      {displayRowTotals[a1.id] ?? 0}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">列合計（表示中）</td>
                  {result.axis2Items.map((a2) => (
                    <td key={a2.id} className="border border-gray-200 px-3 py-2 text-center text-sm font-bold text-gray-700">
                      {displayColTotals[a2.id] ?? 0}
                    </td>
                  ))}
                  <td className="border border-gray-200 bg-gray-100 px-3 py-2 text-center text-sm font-extrabold text-gray-900">
                    {grandTotal}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModalCell(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">{modalCell.a1Name} × {modalCell.a2Name}</h3>
                <p className="text-2xl font-bold text-blue-600 mt-0.5">{modalCell.count} 人</p>
              </div>
              <button onClick={() => setModalCell(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 -mx-2 px-2">
              {modalLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">読み込み中...</div>
              ) : modalCell.count === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">該当するユーザーはいません</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {modalUsers.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-1 transition-colors"
                      onClick={() => { router.push(`/chats?friendId=${u.id}`); setModalCell(null) }}
                    >
                      {u.pictureUrl ? (
                        <img src={u.pictureUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs text-gray-500">{u.displayName?.[0] ?? '?'}</span>
                        </div>
                      )}
                      <span className="text-sm text-gray-800 truncate flex-1">{u.displayName || '（名前なし）'}</span>
                      <span className="text-xs text-blue-400 flex-shrink-0">チャット →</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button onClick={() => setModalCell(null)} className="mt-4 w-full py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg">
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
