'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { ContactMark } from '@/lib/api'
import Header from '@/components/layout/header'

export default function MarksPage() {
  const [marks, setMarks] = useState<ContactMark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<ContactMark | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#cccccc')
  const [saving, setSaving] = useState(false)

  const loadMarks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.marks.list()
      if (res.success) setMarks(res.data)
    } catch {
      setError('マークの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMarks() }, [loadMarks])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await api.marks.create({ name: newName, color: newColor, sortOrder: marks.length })
      if (res.success) {
        setNewName('')
        setNewColor('#cccccc')
        await loadMarks()
      }
    } catch {
      setError('マークの追加に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (mark: ContactMark) => {
    setSaving(true)
    try {
      await api.marks.update(mark.id, { name: mark.name, color: mark.color, sortOrder: mark.sortOrder })
      setEditing(null)
      await loadMarks()
    } catch {
      setError('マークの更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このマークを削除しますか？')) return
    try {
      await api.marks.delete(id)
      await loadMarks()
    } catch {
      setError('マークの削除に失敗しました')
    }
  }

  return (
    <div>
      <Header title="対応マーク設定" />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 新規追加 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">新しいマークを追加</h3>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-10 h-10 rounded cursor-pointer border border-gray-300"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="マーク名を入力..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || saving}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            追加
          </button>
        </div>
      </div>

      {/* マーク一覧 */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-400 text-sm">
          読み込み中...
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">色</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">マーク名</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">順番</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">デフォルト</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {marks.map((mark) => (
                <tr key={mark.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {editing?.id === mark.id ? (
                      <input
                        type="color"
                        value={editing.color}
                        onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                      />
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full border border-gray-200"
                        style={{ backgroundColor: mark.color }}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editing?.id === mark.id ? (
                      <input
                        type="text"
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    ) : (
                      <span className="text-sm text-gray-900">{mark.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editing?.id === mark.id ? (
                      <input
                        type="number"
                        value={editing.sortOrder}
                        onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    ) : (
                      <span className="text-sm text-gray-500">{mark.sortOrder}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {mark.isDefault && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        デフォルト
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {editing?.id === mark.id ? (
                        <>
                          <button
                            onClick={() => handleUpdate(editing)}
                            disabled={saving}
                            className="px-3 py-1 text-xs font-medium text-white rounded disabled:opacity-50"
                            style={{ backgroundColor: '#06C755' }}
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded hover:bg-gray-300"
                          >
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditing(mark)}
                            className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            編集
                          </button>
                          {!mark.isDefault && (
                            <button
                              onClick={() => handleDelete(mark.id)}
                              className="px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700"
                            >
                              削除
                            </button>
                          )}
                        </>
                      )}
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
