'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { CrossAnalysis } from '@/lib/api'
import Header from '@/components/layout/header'
import CrossAnalysisForm from '@/components/cross-analyses/cross-analysis-form'

function getCrossAnalysisIdFromPath(): string {
  if (typeof window === 'undefined') return ''
  const m = window.location.pathname.match(/\/cross-analyses\/([^/]+)(?:\/|$)/)
  const id = m?.[1] ?? ''
  return id === '_placeholder' ? '' : id
}

export default function CrossAnalysisDetailClient() {
  const [item, setItem] = useState<CrossAnalysis | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = getCrossAnalysisIdFromPath()
    if (!id) { setLoading(false); return }
    api.crossAnalyses.get(id)
      .then((r) => { if (r.success) setItem(r.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">読み込み中...</div>
  if (!item) return <div className="p-8 text-center text-gray-500 text-sm">分析が見つかりません</div>

  return (
    <div>
      <Header title={item.name} />
      <CrossAnalysisForm initial={item} />
    </div>
  )
}
