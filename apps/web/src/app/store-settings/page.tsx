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

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

interface StoreHour {
  id: string
  store_key: string
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: number
}

type HoursMap = Record<string, StoreHour[]>

export default function StoreSettingsPage() {
  const [hoursMap, setHoursMap] = useState<HoursMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [selectedStore, setSelectedStore] = useState(STORES[0].key)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: StoreHour[] }>('/api/store-hours')
      if (res.success) {
        const map: HoursMap = {}
        for (const h of res.data) {
          if (!map[h.store_key]) map[h.store_key] = []
          map[h.store_key].push(h)
        }
        // Sort by day_of_week within each store
        for (const key of Object.keys(map)) {
          map[key].sort((a, b) => a.day_of_week - b.day_of_week)
        }
        setHoursMap(map)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const updateHour = (storeKey: string, dayOfWeek: number, field: 'open_time' | 'close_time' | 'is_closed', value: string | boolean) => {
    setHoursMap(prev => {
      const hours = (prev[storeKey] ?? []).map(h =>
        h.day_of_week === dayOfWeek ? { ...h, [field]: field === 'is_closed' ? (value ? 1 : 0) : value } : h
      )
      return { ...prev, [storeKey]: hours }
    })
  }

  const handleSave = async (storeKey: string) => {
    setSaving(storeKey)
    const hours = hoursMap[storeKey] ?? []
    try {
      await fetchApi(`/api/store-hours/${storeKey}`, {
        method: 'PUT',
        body: JSON.stringify({
          hours: hours.map(h => ({
            dayOfWeek: h.day_of_week,
            openTime: h.open_time,
            closeTime: h.close_time,
            isClosed: h.is_closed === 1,
          })),
        }),
      })
      alert('保存しました')
    } catch { alert('保存に失敗しました') }
    setSaving('')
  }

  const currentHours = hoursMap[selectedStore] ?? []

  return (
    <div>
      <Header title="店舗設定" description="各店舗の営業時間設定" />

      {/* Store selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STORES.map(s => (
          <button key={s.key} onClick={() => setSelectedStore(s.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedStore === s.key
                ? 'text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={selectedStore === s.key ? { backgroundColor: '#06C755' } : {}}>
            {s.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-lg">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">
              {STORES.find(s => s.key === selectedStore)?.name} — 営業時間設定
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {(currentHours.length === 7 ? currentHours : Array.from({ length: 7 }, (_, i) => ({
              id: '', store_key: selectedStore, day_of_week: i, open_time: '10:00', close_time: '19:00', is_closed: 0,
            }))).map(h => (
              <div key={h.day_of_week} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-8 text-sm font-bold ${h.day_of_week === 0 ? 'text-red-500' : h.day_of_week === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                  {DAY_LABELS[h.day_of_week]}
                </span>
                <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={h.is_closed === 1}
                    onChange={e => updateHour(selectedStore, h.day_of_week, 'is_closed', e.target.checked)}
                    className="rounded" />
                  定休日
                </label>
                {h.is_closed !== 1 && (
                  <>
                    <input type="time" value={h.open_time}
                      onChange={e => updateHour(selectedStore, h.day_of_week, 'open_time', e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    <span className="text-gray-400 text-sm">〜</span>
                    <input type="time" value={h.close_time}
                      onChange={e => updateHour(selectedStore, h.day_of_week, 'close_time', e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </>
                )}
                {h.is_closed === 1 && <span className="text-sm text-gray-400">—</span>}
              </div>
            ))}
          </div>
          <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
            <button onClick={() => handleSave(selectedStore)} disabled={saving === selectedStore}
              className="px-6 py-2 text-sm text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}>
              {saving === selectedStore ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
