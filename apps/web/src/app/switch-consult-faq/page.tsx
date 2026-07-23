'use client'
import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

interface ConsultCategory {
  id: string
  label: string
  sort_order: number
  is_active: number
}

interface ConsultFaq {
  id: string
  category_id: string
  question: string
  answer: string
  sort_order: number
  is_active: number
}

interface ApiData {
  success: boolean
  categories: ConsultCategory[]
  faqs: ConsultFaq[]
}

export default function SwitchConsultFaqPage() {
  const [categories, setCategories] = useState<ConsultCategory[]>([])
  const [faqs, setFaqs] = useState<ConsultFaq[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [editingFaq, setEditingFaq] = useState<string | null>(null)
  const [editFaqState, setEditFaqState] = useState<{ question: string; answer: string } | null>(null)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editCategoryLabel, setEditCategoryLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<ApiData>('/api/switch-repair/consult-categories')
      if (res.success) {
        setCategories(res.categories)
        setFaqs(res.faqs)
        if (!activeCategory && res.categories.length > 0) {
          setActiveCategory(res.categories[0].id)
        }
      }
    } catch { setError('読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [activeCategory])

  useEffect(() => { load() }, [])

  const activeFaqs = faqs.filter(f => f.category_id === activeCategory).sort((a, b) => a.sort_order - b.sort_order)

  async function saveCategoryLabel(cat: ConsultCategory) {
    setSaving(true)
    try {
      const res = await fetchApi<{ success: boolean; data: ConsultCategory }>(
        `/api/switch-repair/consult-categories/${cat.id}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: editCategoryLabel }) }
      )
      if (res.success && res.data) {
        setCategories(prev => prev.map(c => c.id === cat.id ? res.data : c))
        setEditingCategory(null)
      }
    } catch { setError('保存に失敗しました') }
    finally { setSaving(false) }
  }

  async function saveFaq(faq: ConsultFaq) {
    if (!editFaqState) return
    setSaving(true)
    try {
      const res = await fetchApi<{ success: boolean; data: ConsultFaq }>(
        `/api/switch-repair/consult-faqs/${faq.id}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editFaqState) }
      )
      if (res.success && res.data) {
        setFaqs(prev => prev.map(f => f.id === faq.id ? res.data : f))
        setEditingFaq(null)
        setEditFaqState(null)
      }
    } catch { setError('保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <Header title="Switch 質問・相談 FAQ設定" />
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-400 text-sm">読み込み中...</div>
      ) : (
        <div className="flex gap-4">
          {/* カテゴリ一覧 */}
          <div className="w-56 shrink-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">カテゴリ</span>
              </div>
              {categories.map(cat => (
                <div key={cat.id} className={`border-b border-gray-100 last:border-0 ${activeCategory === cat.id ? 'bg-blue-50' : ''}`}>
                  {editingCategory === cat.id ? (
                    <div className="p-2 flex flex-col gap-1">
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        value={editCategoryLabel}
                        onChange={e => setEditCategoryLabel(e.target.value)}
                      />
                      <div className="flex gap-1">
                        <button onClick={() => saveCategoryLabel(cat)} disabled={saving} className="px-2 py-1 bg-green-600 text-white rounded text-xs disabled:opacity-50">保存</button>
                        <button onClick={() => setEditingCategory(null)} className="px-2 py-1 border border-gray-300 rounded text-xs text-gray-600">キャンセル</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setActiveCategory(cat.id)}
                    >
                      <span className={`text-sm ${activeCategory === cat.id ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{cat.label}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingCategory(cat.id); setEditCategoryLabel(cat.label) }}
                        className="text-xs text-gray-400 hover:text-gray-600 ml-2"
                      >編集</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400 px-1">※カテゴリ名はLINEのボタンラベルになります</p>
          </div>

          {/* FAQ一覧 */}
          <div className="flex-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {categories.find(c => c.id === activeCategory)?.label ?? ''} の質問・回答
                </span>
              </div>
              {activeFaqs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">質問がありません</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activeFaqs.map(faq => (
                    <div key={faq.id} className="p-4">
                      {editingFaq === faq.id && editFaqState ? (
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-medium text-gray-500">質問（ボタンラベル）</label>
                          <input
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                            value={editFaqState.question}
                            onChange={e => setEditFaqState(s => s ? { ...s, question: e.target.value } : s)}
                          />
                          <label className="text-xs font-medium text-gray-500 mt-1">回答メッセージ</label>
                          <textarea
                            rows={5}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono resize-y"
                            value={editFaqState.answer}
                            onChange={e => setEditFaqState(s => s ? { ...s, answer: e.target.value } : s)}
                          />
                          <p className="text-xs text-gray-400">※回答が空の場合は「電話/チャットで相談する」と同じメッセージが送信されます</p>
                          <div className="flex gap-2 mt-1">
                            <button onClick={() => saveFaq(faq)} disabled={saving} className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-medium disabled:opacity-50">保存</button>
                            <button onClick={() => { setEditingFaq(null); setEditFaqState(null) }} className="px-4 py-1.5 border border-gray-300 rounded text-sm text-gray-600">キャンセル</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 mb-1">{faq.question}</div>
                            {faq.answer ? (
                              <div className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-3">{faq.answer}</div>
                            ) : (
                              <div className="text-xs text-gray-400 italic">（回答なし：電話/チャット案内を表示）</div>
                            )}
                          </div>
                          <button
                            onClick={() => { setEditingFaq(faq.id); setEditFaqState({ question: faq.question, answer: faq.answer }) }}
                            className="shrink-0 px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200"
                          >編集</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
