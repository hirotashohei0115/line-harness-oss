'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import type { FunnelWithSteps } from '@/lib/api'
import Header from '@/components/layout/header'
import FunnelForm from '@/components/funnels/funnel-form'

export default function EditFunnelPage() {
  const { id } = useParams<{ id: string }>()
  const [funnel, setFunnel] = useState<FunnelWithSteps | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.funnels.get(id).then((r) => { if (r.success) setFunnel(r.data) }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">読み込み中...</div>
  if (!funnel) return <div className="p-8 text-center text-gray-500 text-sm">ファネルが見つかりません</div>

  return (
    <div>
      <Header title="ファネル編集" />
      <FunnelForm initial={funnel} />
    </div>
  )
}
