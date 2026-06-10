import FunnelAnalyzeClient from './funnel-analyze-client'

export function generateStaticParams() {
  return [{ id: '_placeholder' }]
}

export default function FunnelAnalyzePage() {
  return <FunnelAnalyzeClient />
}
