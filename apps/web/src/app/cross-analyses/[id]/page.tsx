import CrossAnalysisDetailClient from './cross-analysis-detail-client'

export function generateStaticParams() {
  return [{ id: '_placeholder' }]
}

export default function CrossAnalysisDetailPage() {
  return <CrossAnalysisDetailClient />
}
