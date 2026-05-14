'use client'
import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

const STORES = [
  { key: 'gotanda', name: '五反田店' },
  { key: 'kinshicho', name: '錦糸町店' },
  { key: 'narita', name: '成田店' },
  { key: 'makuhari', name: '幕張店' },
  { key: 'shobu', name: '菖蒲店' },
  { key: 'gifu', name: '岐阜店' },
  { key: 'utsunomiya', name: '宇都宮店' },
  { key: 'aomori', name: '青森店' },
  { key: 'morioka', name: '盛岡店' },
  { key: 'oita', name: '大分店' },
  { key: 'kizugawa', name: '木津川店' },
  { key: 'nagaoka', name: '長岡店' },
]

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: '未確認', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: '確認済', color: 'bg-blue-100 text-blue-800' },
  completed: { label: '完了',   color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'キャンセル', color: 'bg-red-100 text-red-800' },
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

interface Reservation {
  id: string
  line_user_id: string
  store_key: string
  date: string
  time: string
  name: string
  phone: string
  notes: string
  status: string
  created_at: string
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>{s.label}</span>
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const dateObj = new Date(dateStr + 'T00:00:00+09:00')
  return `${y}/${m}/${d}（${DAY_LABELS[dateObj.getDay()]}）`
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStore, setFilterStore] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [updatingId, setUpdatingId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStore) params.set('storeKey', filterStore)
      if (filterDate) params.set('date', filterDate)
      if (filterStatus) params.set('status', filterStatus)
      const qs = params.toString()
      const res = await fetchApi<{ success: boolean; data: Reservation[] }>(
        `/api/reservations${qs ? `?${qs}` : ''}`
      )
      if (res.success) setReservations(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [filterStore, filterDate, filterStatus])

  useEffect(() => { load() }, [load])

  const handleStatus = async (id: string, status: string) => {
    setUpdatingId(id)
    try {
      await fetchApi(`/api/reservations/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    } catch { alert('更新に失敗しました') }
    setUpdatingId('')
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name} 様の予約を削除しますか？`)) return
    try {
      await fetchApi(`/api/reservations/${id}`, { method: 'DELETE' })
      setReservations(prev => prev.filter(r => r.id !== id))
    } catch { alert('削除に失敗しました') }
  }

  return (
    <div>
      <Header title="予約管理" description="来店予約の確認と管理" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">全店舗</option>
          {STORES.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">全ステータス</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={load} className="px-4 py-2 text-sm text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>
          検索
        </button>
        <button onClick={() => { setFilterStore(''); setFilterDate(''); setFilterStatus('') }}
          className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
          リセット
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">日時</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">店舗</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">お名前</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">電話番号</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">ご要望</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reservations.map(r => {
                  const storeName = STORES.find(s => s.key === r.store_key)?.name ?? r.store_key
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {formatDate(r.date)}<br />
                        <span className="text-gray-500 font-normal">{r.time}〜</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{storeName}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.name} 様</td>
                      <td className="px-4 py-3 text-gray-600">{r.phone || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{r.notes || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {r.status === 'pending' && (
                          <button onClick={() => handleStatus(r.id, 'confirmed')} disabled={updatingId === r.id}
                            className="text-xs text-blue-600 hover:underline mr-2">確認済にする</button>
                        )}
                        {r.status === 'confirmed' && (
                          <button onClick={() => handleStatus(r.id, 'completed')} disabled={updatingId === r.id}
                            className="text-xs text-green-600 hover:underline mr-2">完了にする</button>
                        )}
                        {r.status !== 'cancelled' && (
                          <button onClick={() => handleStatus(r.id, 'cancelled')} disabled={updatingId === r.id}
                            className="text-xs text-orange-400 hover:underline mr-2">キャンセル</button>
                        )}
                        <button onClick={() => handleDelete(r.id, r.name)}
                          className="text-xs text-red-400 hover:underline">削除</button>
                      </td>
                    </tr>
                  )
                })}
                {reservations.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">予約がありません</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
