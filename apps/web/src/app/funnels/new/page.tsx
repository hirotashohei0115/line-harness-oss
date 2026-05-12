'use client'
import Header from '@/components/layout/header'
import FunnelForm from '@/components/funnels/funnel-form'

export default function NewFunnelPage() {
  return (
    <div>
      <Header title="ファネル作成" />
      <FunnelForm />
    </div>
  )
}
