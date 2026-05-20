'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { FunnelAnalyzeResult, FunnelStepUser, ContactMark } from '@/lib/api'
import Header from '@/components/layout/header'

function getFunnelIdFromPath(): string {
  if (typeof window === 'undefined') return ''
  const m = window.location.pathname.match(/\/funnels\/([^/]+)(?:\/|$)/)
  const id = m?.[1] ?? ''
  return id === '_placeholder' ? '' : id
}

function getMarkTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#374151' : '#ffffff'
}

function formatDate(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type StepModalState = {
  title: string
  count: number
  stepIndex: number
  variant: 'reached' | 'not_reached' | 'base'
}

export default function FunnelAnalyzeClient() {
  const router = useRouter()

  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const [id, setId] = useState<string>('')
  const [from, setFrom] = useState(thirtyDaysAgo)
  const [to, setTo] = useState(today)
  const [result, setResult] = useState<FunnelAnalyzeResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modal, setModal] = useState<StepModalState | null>(null)
  const [modalUsers, setModalUsers] = useState<FunnelStepUser[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [allMarks, setAllMarks] = useState<ContactMark[]>([])

  useEffect(() => {
    const realId = getFunnelIdFromPath()
    if (realId) { setId(realId) }
    else { setLoading(false); setError('ファネルIDが取得できませんでした') }
  }, [])

  useEffect(() => {
    api.marks.list().then(r => { if (r.success) setAllMarks(r.data) }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const res = await api.funnels.analyze(id, from, to)
      if (res.success) setResult(res.data)
      else setError('分析に失敗しました')
    } catch { setError('分析に失敗しました') }
    finally { setLoading(false) }
  }, [id, from, to])

  useEffect(() => { if (id) load() }, [id, load])

  const openModal = useCallback(async (state: StepModalState) => {
    setModal(state)
    setModalUsers([])
    setModalLoading(true)
    try {
      const res = await api.funnels.stepUsers(id, state.stepIndex, state.variant, from, to)
      if (res.success) setModalUsers(res.data.users)
    } catch { /* silent */ }
    finally { setModalLoading(false) }
  }, [id, from, to])

  const closeModal = () => { setModal(null); setModalUsers([]) }

  const markMap = new Map(allMarks.map(m => [m.id, m]))

  const finalCVR = result && result.total > 0 && result.steps.length > 0
    ? Math.round((result.steps[result.steps.length - 1].reached / result.total) * 1000) / 10
    : 0

  return (
    <div>
      <Header title={result?.funnel.name ?? 'ファネル分析'} />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 text-sm">
          <label className="font-medium text-gray-600">開始日</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="font-medium text-gray-600">終了日</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <button onClick={load} className="px-4 py-1.5 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>
          再計算
        </button>
        <button onClick={() => router.push(`/funnels/${id}/edit`)} className="ml-auto px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
          編集
        </button>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-400 text-sm">分析中...</div>
      ) : result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">計測対象（母数）</p>
              <p className="text-2xl font-bold text-gray-900">{result.total.toLocaleString('ja-JP')}</p>
              <p className="text-xs text-gray-400">期間内友だち追加</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">最終CVR</p>
              <p className="text-2xl font-bold text-green-600">{finalCVR}%</p>
              <p className="text-xs text-gray-400">母数→最終ステップ</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">最終到達</p>
              <p className="text-2xl font-bold text-blue-600">{(result.steps[result.steps.length - 1]?.reached ?? 0).toLocaleString('ja-JP')}</p>
              <p className="text-xs text-gray-400">人</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">ステップ数</p>
              <p className="text-2xl font-bold text-purple-600">{result.steps.length}</p>
              <p className="text-xs text-gray-400">コンバージョン</p>
            </div>
          </div>

          {/* L-step style funnel table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">ファネル分析</h3>
              <span className="text-xs text-gray-400">{result.period.from} 〜 {result.period.to}</span>
            </div>

            {/* Header row */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_2fr] gap-0 px-6 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <div>コンバージョン名</div>
              <div className="text-right w-20">到達人数</div>
              <div className="text-right w-20">未到達</div>
              <div className="text-right w-20">全体比</div>
              <div className="pl-4">全体比グラフ</div>
            </div>

            {/* Base row */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_2fr] gap-0 px-6 py-3 border-b border-gray-100 items-center hover:bg-gray-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-gray-400 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">0</span>
                  <span className="text-sm font-medium text-gray-700">計測開始（友だち追加）</span>
                </div>
              </div>
              <div className="text-right w-20">
                <button
                  onClick={() => openModal({ title: '計測開始（友だち追加）', count: result.total, stepIndex: -1, variant: 'base' })}
                  className="text-sm font-bold text-blue-600 hover:underline"
                >{result.total.toLocaleString('ja-JP')}</button>
              </div>
              <div className="text-right w-20 text-sm text-gray-400">—</div>
              <div className="text-right w-20 text-sm font-bold text-gray-700">100%</div>
              <div className="pl-4">
                <div className="h-5 rounded-sm" style={{ width: '100%', backgroundColor: '#06C755', opacity: 0.8 }} />
              </div>
            </div>

            {/* Step rows */}
            {result.steps.map((step, idx) => {
              const barWidth = Math.max(step.totalRate, 1)
              const barColor = idx === result.steps.length - 1 ? '#06C755'
                : step.prevRate >= 70 ? '#3b82f6'
                : step.prevRate >= 40 ? '#f97316'
                : '#ef4444'

              return (
                <div key={idx}>
                  {/* Conversion rate arrow between steps */}
                  <div className="px-6 py-1 bg-gray-50 border-y border-gray-100 flex items-center gap-2">
                    <span className="text-gray-400 text-xs">↓</span>
                    <span className="text-xs font-semibold text-gray-600">
                      {step.prevRate}%
                    </span>
                    <span className="text-xs text-gray-400">（前ステップからの移行率）</span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_auto_auto_2fr] gap-0 px-6 py-3 border-b border-gray-100 items-center hover:bg-gray-50">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: barColor }}
                        >{idx + 1}</span>
                        <span className="text-sm font-medium text-gray-700">{step.name}</span>
                      </div>
                    </div>
                    <div className="text-right w-20">
                      <button
                        onClick={() => openModal({ title: `${step.name}（到達）`, count: step.reached, stepIndex: idx, variant: 'reached' })}
                        className="text-sm font-bold text-blue-600 hover:underline"
                      >{step.reached.toLocaleString('ja-JP')}</button>
                    </div>
                    <div className="text-right w-20">
                      <button
                        onClick={() => openModal({ title: `${step.name}（未到達）`, count: step.notReached, stepIndex: idx, variant: 'not_reached' })}
                        className="text-sm font-bold text-red-400 hover:underline"
                      >{step.notReached.toLocaleString('ja-JP')}</button>
                    </div>
                    <div className="text-right w-20">
                      <span className="text-sm font-bold" style={{ color: barColor }}>{step.totalRate}%</span>
                    </div>
                    <div className="pl-4">
                      <div className="h-5 rounded-sm bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-sm transition-all duration-500"
                          style={{ width: `${barWidth}%`, backgroundColor: barColor, opacity: 0.85 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* User list modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeModal}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full mx-4 flex flex-col"
            style={{ maxWidth: '680px', maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">{modal.title}のユーザー一覧</h3>
                <p className="text-sm text-blue-600 font-semibold mt-0.5">{modal.count.toLocaleString('ja-JP')} 人</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1">
              {modalLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">読み込み中...</div>
              ) : modalUsers.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">ユーザーが見つかりません</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 text-xs">ユーザー</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 text-xs">対応マーク</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 text-xs">最終メッセージ</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalUsers.map((user) => {
                      const mark = user.contactMarkId ? markMap.get(user.contactMarkId) : null
                      return (
                        <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              {user.pictureUrl ? (
                                <img src={user.pictureUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                                  </svg>
                                </div>
                              )}
                              <span className="font-medium text-gray-800 text-sm truncate max-w-[140px]">
                                {user.displayName ?? '名前なし'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            {mark ? (
                              <span
                                className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{ backgroundColor: mark.color, color: getMarkTextColor(mark.color) }}
                              >{mark.name}</span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(user.lastMessageAt)}</td>
                          <td className="px-4 py-2.5 text-right">
                            {user.chatId && (
                              <button
                                onClick={() => { router.push(`/chats?chatId=${user.chatId}`); closeModal() }}
                                className="px-3 py-1 text-xs font-medium text-white rounded-lg"
                                style={{ backgroundColor: '#06C755' }}
                              >
                                チャットを開く
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
              <button onClick={closeModal} className="w-full py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
