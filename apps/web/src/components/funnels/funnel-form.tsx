'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { FunnelWithSteps, ContactMark } from '@/lib/api'
import type { Tag } from '@line-crm/shared'

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

interface FunnelFormProps {
  initial?: FunnelWithSteps
}

export default function FunnelForm({ initial }: FunnelFormProps) {
  const router = useRouter()
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

  useEffect(() => {
    api.tags.list().then((r) => { if (r.success) setTags(r.data) }).catch(() => {})
    api.marks.list().then((r) => { if (r.success) setMarks(r.data) }).catch(() => {})
  }, [])

  const addStep = () => {
    setSteps((prev) => [...prev, { id: crypto.randomUUID(), name: '', conditionType: 'action', conditionIds: [] }])
  }

  const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx))

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

  const handleSave = async () => {
    if (!name.trim()) { setError('ファネル名を入力してください'); return }
    if (steps.some((s) => !s.name.trim())) { setError('全ステップに名前を入力してください'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
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
          {steps.map((step, idx) => (
            <div key={step.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#06C755' }}>{idx + 1}</span>
                <input type="text" value={step.name} onChange={(e) => updateStep(idx, { name: e.target.value })} placeholder="ステップ名（例：機種選択）"
                  className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <button onClick={() => removeStep(idx)} className="text-xs text-red-400 hover:text-red-600 px-2">削除</button>
              </div>

              {/* Condition type selector */}
              <div className="flex gap-4 mb-3">
                {(['action', 'tag', 'contact_mark'] as ConditionType[]).map((type) => (
                  <label key={type} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio" name={`type-${step.id}`}
                      checked={step.conditionType === type}
                      onChange={() => updateStep(idx, { conditionType: type, conditionIds: [] })}
                    />
                    {type === 'action' ? 'アクション' : type === 'tag' ? 'タグ' : '対応マーク'}
                  </label>
                ))}
              </div>

              {/* Condition options */}
              <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto">
                {step.conditionType === 'action' && (
                  ACTION_TYPE_OPTIONS.map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-100 last:border-b-0">
                      <input type="checkbox" checked={step.conditionIds.includes(opt.id)} onChange={() => toggleConditionId(idx, opt.id)} className="rounded" />
                      <span className="text-gray-700">{opt.label}</span>
                    </label>
                  ))
                )}
                {step.conditionType === 'tag' && (
                  tags.length === 0 ? <p className="p-3 text-xs text-gray-400">タグがありません</p> :
                  tags.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-100 last:border-b-0">
                      <input type="checkbox" checked={step.conditionIds.includes(t.id)} onChange={() => toggleConditionId(idx, t.id)} className="rounded" />
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || '#3B82F6' }} />
                      {t.name}
                    </label>
                  ))
                )}
                {step.conditionType === 'contact_mark' && (
                  marks.length === 0 ? <p className="p-3 text-xs text-gray-400">マークがありません</p> :
                  marks.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-100 last:border-b-0">
                      <input type="checkbox" checked={step.conditionIds.includes(m.id)} onChange={() => toggleConditionId(idx, m.id)} className="rounded" />
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                      {m.name}
                    </label>
                  ))
                )}
              </div>
              {step.conditionIds.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">{step.conditionIds.length}件選択中（OR条件）</p>
              )}
            </div>
          ))}
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
