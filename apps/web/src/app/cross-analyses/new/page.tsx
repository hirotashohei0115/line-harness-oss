'use client'
import Header from '@/components/layout/header'
import CrossAnalysisForm from '@/components/cross-analyses/cross-analysis-form'

export default function NewCrossAnalysisPage() {
  return (
    <div>
      <Header title="クロス分析 作成" />
      <CrossAnalysisForm />
    </div>
  )
}
