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

  useEffect(() => {
    const realId = getFunnelIdFromPath()
    if (realId) {
      setId(realId)
    } else {
      setLoading(false)
      setError('ファネルIDが取得できませんでした')
    }
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

  const maxReached = result ? Math.max(result.total, ...result.steps.map((s) => s.reached), 1) : 1

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
          {/* Summary card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">期間内友だち追加</p>
              <p className="text-2xl font-bold text-gray-900">{result.total.toLocaleString('ja-JP')}</p>
              <p className="text-xs text-gray-400">母数</p>
            </div>
            {result.steps[0] && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
                <p className="text-xs text-gray-500 mb-1 truncate">{result.steps[0].name}</p>
                <p className="text-2xl font-bold text-green-600">{result.steps[0].rate}%</p>
                <p className="text-xs text-gray-400">Step 1 到達率</p>
              </div>
            )}
            {result.steps[result.steps.length - 1] && result.steps.length > 1 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
                <p className="text-xs text-gray-500 mb-1 truncate">{result.steps[result.steps.length - 1].name}</p>
                <p className="text-2xl font-bold text-blue-600">{result.steps[result.steps.length - 1].reached.toLocaleString('ja-JP')}</p>
                <p className="text-xs text-gray-400">最終ステップ到達</p>
              </div>
            )}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">全体CVR</p>
              <p className="text-2xl font-bold text-purple-600">
                {result.total > 0 && result.steps.length > 0
                  ? `${Math.round((result.steps[result.steps.length - 1]?.reached ?? 0) / result.total * 1000) / 10}%`
                  : '—'}
              </p>
              <p className="text-xs text-gray-400">母数→最終</p>
            </div>
          </div>

          {/* Funnel visualization */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-6">ファネル可視化</h3>
            <div className="space-y-3">
              {/* Base row: total cohort */}
              <div className="flex items-center gap-4">
                <div className="w-36 text-right flex-shrink-0">
                  <p className="text-xs font-medium text-gray-600">母数（友だち追加）</p>
                </div>
                <div className="flex-1 relative h-10 flex items-center">
                  <div className="h-10 rounded-md flex items-center justify-center" style={{ width: '100%', backgroundColor: '#e5e7eb' }}>
                    <span className="text-sm font-bold text-gray-700">{result.total.toLocaleString('ja-JP')} 人</span>
                  </div>
                </div>
                <div className="w-20 flex-shrink-0" />
              </div>

              {result.steps.map((step, idx) => {
                const widthPct = maxReached > 0 ? Math.max((step.reached / maxReached) * 100, 3) : 3
                const barColor = idx === result.steps.length - 1 ? '#06C755'
                  : step.rate >= 70 ? '#3b82f6'
                  : step.rate >= 40 ? '#f97316'
                  : '#ef4444'
                return (
                  <div key={idx} className="flex items-center gap-4">
                    <div className="w-36 text-right flex-shrink-0">
                      <p className="text-xs font-medium text-gray-700 leading-tight">{step.name}</p>
                      <p className="text-xs text-gray-400">Step {idx + 1}</p>
                    </div>
                    <div className="flex-1 relative h-10 bg-gray-50 rounded-md overflow-hidden">
                      <div
                        className="h-full rounded-md flex items-center justify-end pr-2 transition-all duration-500"
                        style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                      >
                        <span className="text-xs font-bold text-white whitespace-nowrap">{step.reached.toLocaleString('ja-JP')}</span>
                      </div>
                    </div>
                    <div className="w-20 flex-shrink-0 text-right">
                      <p className="text-sm font-bold text-gray-900">{step.rate}%</p>
                      <p className="text-xs text-red-400">▼ {step.dropoff}%</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Step detail table */}
            {result.steps.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="pb-2 text-left text-xs font-semibold text-gray-500">ステップ</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500">到達人数</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500">到達率</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500">離脱率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.steps.map((step, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="py-2 text-gray-700">{step.name}</td>
                        <td className="py-2 text-right font-medium">{step.reached.toLocaleString('ja-JP')}</td>
                        <td className="py-2 text-right text-blue-600 font-medium">{step.rate}%</td>
                        <td className="py-2 text-right text-red-500">{step.dropoff}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
