'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { FunnelAnalyzeResult } from '@/lib/api'
import Header from '@/components/layout/header'

function getFunnelIdFromPath(): string {
  if (typeof window === 'undefined') return ''
  const m = window.location.pathname.match(/\/funnels\/([^/]+)(?:\/|$)/)
  const id = m?.[1] ?? ''
  return id === '_placeholder' ? '' : id
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
  const [modal, setModal] = useState<{ title: string; count: number } | null>(null)

  useEffect(() => {
    const realId = getFunnelIdFromPath()
    if (realId) { setId(realId) }
    else { setLoading(false); setError('ファネルIDが取得できませんでした') }
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
                  onClick={() => setModal({ title: '計測開始', count: result.total })}
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
                        onClick={() => setModal({ title: step.name + '：到達', count: step.reached })}
                        className="text-sm font-bold text-blue-600 hover:underline"
                      >{step.reached.toLocaleString('ja-JP')}</button>
                    </div>
                    <div className="text-right w-20">
                      <button
                        onClick={() => setModal({ title: step.name + '：未到達', count: step.notReached })}
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

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">{modal.title}</h3>
            <p className="text-3xl font-bold text-blue-600 mb-4">{modal.count.toLocaleString('ja-JP')} 人</p>
            <p className="text-xs text-gray-400 mb-4">※ 詳細なユーザー一覧は友だち管理画面でご確認ください</p>
            <button onClick={() => setModal(null)} className="w-full py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg">閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}
