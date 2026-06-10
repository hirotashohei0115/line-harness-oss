import EditFunnelClient from './edit-funnel-client'

export function generateStaticParams() {
  return [{ id: '_placeholder' }]
}

export default function EditFunnelPage() {
  return <EditFunnelClient />
}
