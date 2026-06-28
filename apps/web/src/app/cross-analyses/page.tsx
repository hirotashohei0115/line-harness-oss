'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { CrossAnalysis } from '@/lib/api'
import Header from '@/components/layout/header'
import { useAccount } from '@/contexts/account-context'

export default function CrossAnalysesPage() {
  const router = useRouter()
  const { selectedAccountId } = useAccount()
  const [items, setItems] = useState<CrossAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.crossAnalyses.list(selectedAccountId ? { accountId: selectedAccountId } : undefined)
      if (res.success) setItems(res.data)
    } catch { setError('読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [selectedAccountId])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return
    try {
      await api.crossAnalyses.delete(id)
      await load()
    } catch { setError('削除に失敗しました') }
  }

  return (
    <div>
      <Header title="クロス分析" />
      <div className="flex justify-end mb-4">
        <button onClick={() => router.push('/cross-analyses/new')}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>
          + 新規クロス分析
        </button>
      </div>
      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-400 text-sm">読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">クロス分析がまだありません</p>
          <button onClick={() => router.push('/cross-analyses/new')}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>
            最初の分析を作成
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">分析名</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">軸1</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">軸2</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">作成日</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button onClick={() => router.push(`/cross-analyses/${item.id}`)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left">
                      {item.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{item.axis1Type === 'tag' ? 'タグ' : '対応マーク'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{item.axis2Type === 'tag' ? 'タグ' : '対応マーク'}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 hidden sm:table-cell">{new Date(item.createdAt).toLocaleDateString('ja-JP')}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => router.push(`/cross-analyses/${item.id}`)} className="text-xs px-3 py-1 text-green-600 hover:text-green-800 font-medium">実行</button>
                      <button onClick={() => handleDelete(item.id)} className="text-xs px-3 py-1 text-red-500 hover:text-red-700">削除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
