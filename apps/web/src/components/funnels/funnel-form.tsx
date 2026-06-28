'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { FunnelWithSteps, ContactMark } from '@/lib/api'
import type { Tag } from '@line-crm/shared'
import { useAccount } from '@/contexts/account-context'

type ConditionType = 'tag' | 'contact_mark' | 'action'

interface StepDraft {
  id: string
  name: string
  conditionType: ConditionType
  conditionIds: string[]
}

const ACTION_TYPE_OPTIONS = [
  { id: 'friend_add',      label: '友達追加' },
  { id: 'menu_repair',     label: '修理依頼をする' },
  { id: 'product_select',  label: '機種選択（MacBook Air/Pro/その他）' },
  { id: 'model_select',    label: 'モデル名選択' },
  { id: 'symptom_select',  label: '症状選択' },
  { id: 'order_confirm',   label: '依頼する（依頼確定）' },
  { id: 'delivery_method', label: '郵送で依頼する / 来店予約する' },
  { id: 'store_select',    label: '発送先店舗選択' },
  { id: 'form_submit',     label: '郵送フォーム送信' },
  { id: 'consult',         label: '質問・相談したい' },
  { id: 'free_message',    label: '自由メッセージ送信' },
]

const CONDITION_TYPE_LABELS: Record<ConditionType, string> = {
  action: 'アクション',
  tag: 'タグ',
  contact_mark: '対応マーク',
}

const EXPLANATION_SUFFIX: Record<ConditionType, string> = {
  action: 'アクションを実行したユーザーが到達したとカウントされます',
  tag: 'タグを持つユーザーが到達したとカウントされます',
  contact_mark: '対応マークのユーザーが到達したとカウントされます',
}

interface FunnelFormProps {
  initial?: FunnelWithSteps
}

export default function FunnelForm({ initial }: FunnelFormProps) {
  const router = useRouter()
  const { selectedAccountId } = useAccount()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [steps, setSteps] = useState<StepDraft[]>(
    initial?.steps.map((s) => ({
      id: s.id, name: s.name,
      conditionType: s.conditionType as ConditionType,
      conditionIds: s.conditionIds,
    })) ?? []
  )
  const [tags, setTags] = useState<Tag[]>([])
  const [marks, setMarks] = useState<ContactMark[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // UI-only state: which step cards are expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.tags.list().then((r) => { if (r.success) setTags(r.data) }).catch(() => {})
    api.marks.list().then((r) => { if (r.success) setMarks(r.data) }).catch(() => {})
  }, [])

  const addStep = () => {
    const newId = crypto.randomUUID()
    setSteps((prev) => [...prev, { id: newId, name: '', conditionType: 'action', conditionIds: [] }])
    setExpandedIds((prev) => new Set([...prev, newId]))
  }

  const removeStep = (idx: number) => {
    const stepId = steps[idx].id
    setSteps((prev) => prev.filter((_, i) => i !== idx))
    setExpandedIds((prev) => { const s = new Set(prev); s.delete(stepId); return s })
  }

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  const toggleConditionId = (idx: number, id: string) => {
    setSteps((prev) => prev.map((s, i) => {
      if (i !== idx) return s
      const ids = s.conditionIds.includes(id) ? s.conditionIds.filter((x) => x !== id) : [...s.conditionIds, id]
      return { ...s, conditionIds: ids }
    }))
  }

  const toggleExpand = (stepId: string) => {
    setExpandedIds((prev) => {
      const s = new Set(prev)
      if (s.has(stepId)) s.delete(stepId)
      else s.add(stepId)
      return s
    })
  }

  const getConditionLabels = (step: StepDraft): string[] => {
    if (step.conditionIds.length === 0) return []
    if (step.conditionType === 'action') {
      return step.conditionIds.map(id => ACTION_TYPE_OPTIONS.find(o => o.id === id)?.label ?? id)
    }
    if (step.conditionType === 'tag') {
      return step.conditionIds.map(id => tags.find(t => t.id === id)?.name ?? id)
    }
    return step.conditionIds.map(id => marks.find(m => m.id === id)?.name ?? id)
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('ファネル名を入力してください'); return }
    if (steps.some((s) => !s.name.trim())) { setError('全ステップに名前を入力してください'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        lineAccountId: selectedAccountId || null,
        steps: steps.map((s, i) => ({
          name: s.name, step_order: i + 1,
          condition_type: s.conditionType,
          condition_ids: s.conditionIds,
        })),
      }
      if (initial) {
        await api.funnels.update(initial.id, payload)
        router.push(`/funnels/${initial.id}`)
      } else {
        const res = await api.funnels.create(payload)
        if (res.success) router.push(`/funnels/${res.data.id}`)
      }
    } catch { setError('保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <div className="max-w-2xl">
      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ファネル名 <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：郵送修理フロー"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">説明（任意）</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="このファネルの目的..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">ステップ設定</h3>
          <button onClick={addStep} className="text-xs px-3 py-1.5 font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>
            + ステップ追加
          </button>
        </div>

        {steps.length === 0 && (
          <div className="bg-white rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
            ステップを追加してください
          </div>
        )}

        <div className="space-y-3">
          {steps.map((step, idx) => {
            const isExpanded = expandedIds.has(step.id)
            const conditionLabels = getConditionLabels(step)
            const categoryLabel = CONDITION_TYPE_LABELS[step.conditionType]

            return (
              <div key={step.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {/* ── Collapsed header (always visible) ── */}
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(step.id)}
                >
                  <span
                    className="w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#06C755' }}
                  >{idx + 1}</span>

                  <span className="flex-1 text-sm font-medium text-gray-700 truncate min-w-0">
                    {step.name || <span className="text-gray-400 font-normal">ステップ名未入力</span>}
                  </span>

                  {/* Category badge */}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium flex-shrink-0">
                    {categoryLabel}
                  </span>

                  {/* Selected condition chips (max 2 + overflow count) */}
                  {conditionLabels.length > 0 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {conditionLabels.slice(0, 2).map((label, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 truncate max-w-[72px]">{label}</span>
                      ))}
                      {conditionLabels.length > 2 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">+{conditionLabels.length - 2}</span>
                      )}
                    </div>
                  )}

                  {/* Chevron */}
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>

                  <button
                    onClick={(e) => { e.stopPropagation(); removeStep(idx) }}
                    className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 px-1"
                  >削除</button>
                </div>

                {/* ── Expanded content ── */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                    {/* Step name input */}
                    <input
                      type="text"
                      value={step.name}
                      onChange={(e) => updateStep(idx, { name: e.target.value })}
                      placeholder="ステップ名（例：機種選択）"
                      className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />

                    {/* ① Segment control — 条件のカテゴリー */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">条件のカテゴリー</p>
                      <div className="inline-flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                        {(['action', 'tag', 'contact_mark'] as ConditionType[]).map((type) => {
                          const isActive = step.conditionType === type
                          const count = isActive ? step.conditionIds.length : 0
                          return (
                            <button
                              key={type}
                              onClick={() => updateStep(idx, { conditionType: type, conditionIds: [] })}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                                isActive
                                  ? 'bg-white text-gray-800 shadow-sm border border-gray-200'
                                  : 'text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              {type === 'action' ? 'アクション' : type === 'tag' ? 'タグ' : '対応マーク'}
                              {count > 0 && (
                                <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-blue-100 text-blue-600">
                                  {count}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* ② List header */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs text-gray-500">
                          対象となる<span className="font-semibold text-gray-600">{categoryLabel}</span>
                          <span className="text-gray-400 ml-1">（複数選択時はOR条件）</span>
                        </p>
                        {step.conditionIds.length > 0 && (
                          <span className="text-xs font-medium text-blue-600">{step.conditionIds.length}件選択中</span>
                        )}
                      </div>

                      {/* ③ Condition list with row highlight */}
                      <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto">
                        {step.conditionType === 'action' && ACTION_TYPE_OPTIONS.map((opt) => {
                          const checked = step.conditionIds.includes(opt.id)
                          return (
                            <label
                              key={opt.id}
                              className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-b border-gray-100 last:border-b-0 transition-colors ${
                                checked ? 'bg-blue-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              <input type="checkbox" checked={checked} onChange={() => toggleConditionId(idx, opt.id)} className="rounded accent-blue-500" />
                              <span className={checked ? 'font-medium text-blue-700' : 'text-gray-700'}>{opt.label}</span>
                            </label>
                          )
                        })}

                        {step.conditionType === 'tag' && (
                          tags.length === 0
                            ? <p className="p-3 text-xs text-gray-400">タグがありません</p>
                            : tags.map((t) => {
                              const checked = step.conditionIds.includes(t.id)
                              return (
                                <label
                                  key={t.id}
                                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-b border-gray-100 last:border-b-0 transition-colors ${
                                    checked ? 'bg-blue-50' : 'hover:bg-gray-50'
                                  }`}
                                >
                                  <input type="checkbox" checked={checked} onChange={() => toggleConditionId(idx, t.id)} className="rounded accent-blue-500" />
                                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || '#3B82F6' }} />
                                  <span className={checked ? 'font-medium text-blue-700' : 'text-gray-700'}>{t.name}</span>
                                </label>
                              )
                            })
                        )}

                        {step.conditionType === 'contact_mark' && (
                          marks.length === 0
                            ? <p className="p-3 text-xs text-gray-400">マークがありません</p>
                            : marks.map((m) => {
                              const checked = step.conditionIds.includes(m.id)
                              return (
                                <label
                                  key={m.id}
                                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-b border-gray-100 last:border-b-0 transition-colors ${
                                    checked ? 'bg-blue-50' : 'hover:bg-gray-50'
                                  }`}
                                >
                                  <input type="checkbox" checked={checked} onChange={() => toggleConditionId(idx, m.id)} className="rounded accent-blue-500" />
                                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                                  <span className={checked ? 'font-medium text-blue-700' : 'text-gray-700'}>{m.name}</span>
                                </label>
                              )
                            })
                        )}
                      </div>
                    </div>

                    {/* ⑤ Explanation box */}
                    {step.conditionIds.length > 0 && (
                      <div className="flex gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5">
                        <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          このステップは「<span className="font-medium text-gray-700">{getConditionLabels(step).join(' / ')}</span>」
                          {EXPLANATION_SUFFIX[step.conditionType]}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => router.back()} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">キャンセル</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#06C755' }}>
          {saving ? '保存中...' : initial ? '更新する' : '作成する'}
        </button>
      </div>
    </div>
  )
}
