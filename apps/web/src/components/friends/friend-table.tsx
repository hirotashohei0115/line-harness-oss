'use client'

import { useState, useMemo } from 'react'
import type { Tag } from '@line-crm/shared'
import type { FriendWithTags } from '@/lib/api'
import type { ContactMark } from '@/lib/api'
import { api } from '@/lib/api'
import TagBadge from './tag-badge'

interface FriendTableProps {
  friends: FriendWithTags[]
  allTags: Tag[]
  allMarks: ContactMark[]
  onRefresh: () => void
}

export default function FriendTable({ friends, allTags, allMarks, onRefresh }: FriendTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingTagForFriend, setAddingTagForFriend] = useState<string | null>(null)
  const [selectedTagId, setSelectedTagId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [markSelectorFor, setMarkSelectorFor] = useState<string | null>(null)
  const markMap = useMemo(() => new Map(allMarks.map((m) => [m.id, m])), [allMarks])

  const handleMarkChange = async (friendId: string, markId: string | null) => {
    try {
      await api.friends.updateMark(friendId, markId)
      setMarkSelectorFor(null)
      onRefresh()
    } catch {
      setError('マークの変更に失敗しました')
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
    setAddingTagForFriend(null)
    setSelectedTagId('')
    setError('')
  }

  const handleAddTag = async (friendId: string) => {
    if (!selectedTagId) return
    setLoading(true)
    setError('')
    try {
      await api.friends.addTag(friendId, selectedTagId)
      setAddingTagForFriend(null)
      setSelectedTagId('')
      onRefresh()
    } catch {
      setError('タグの追加に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveTag = async (friendId: string, tagId: string) => {
    setLoading(true)
    setError('')
    try {
      await api.friends.removeTag(friendId, tagId)
      onRefresh()
    } catch {
      setError('タグの削除に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  if (friends.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500">友だちが見つかりません</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {error && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-red-700 text-sm">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              アイコン / 表示名
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              ステータス
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              タグ / 流入
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              登録日
            </th>
            <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-10">
              マーク
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {friends.map((friend) => {
            const isExpanded = expandedId === friend.id
            const isAddingTag = addingTagForFriend === friend.id
            const availableTags = allTags.filter(
              (t) => !friend.tags.some((ft) => ft.id === t.id)
            )

            return (
              <>
                <tr
                  key={friend.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => toggleExpand(friend.id)}
                >
                  {/* Avatar + Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {friend.pictureUrl ? (
                        <img
                          src={friend.pictureUrl}
                          alt={friend.displayName}
                          className="w-9 h-9 rounded-full object-cover bg-gray-100"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
                          {friend.displayName?.charAt(0) ?? '?'}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{friend.displayName}</p>
                        {friend.statusMessage && (
                          <p className="text-xs text-gray-400 truncate max-w-[160px]">{friend.statusMessage}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Following status */}
                  <td className="px-4 py-3">
                    {friend.isFollowing ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        フォロー中
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        ブロック/退会
                      </span>
                    )}
                  </td>

                  {/* Tags + Ref */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(friend as unknown as { refCode?: string }).refCode && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {(friend as unknown as { refCode: string }).refCode}
                        </span>
                      )}
                      {friend.tags.length > 0 ? (
                        friend.tags.map((tag) => <TagBadge key={tag.id} tag={tag} />)
                      ) : !((friend as unknown as { refCode?: string }).refCode) ? (
                        <span className="text-xs text-gray-400">なし</span>
                      ) : null}
                    </div>
                  </td>

                  {/* Registered date */}
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(friend.createdAt)}
                  </td>

                  {/* Mark dot */}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        className="w-5 h-5 rounded-full border border-gray-300 block hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 transition-all"
                        style={{ backgroundColor: markMap.get(friend.contactMarkId ?? '')?.color ?? '#e5e7eb' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setMarkSelectorFor(markSelectorFor === friend.id ? null : friend.id)
                        }}
                        title={markMap.get(friend.contactMarkId ?? '')?.name ?? 'マークなし'}
                      />
                      {markSelectorFor === friend.id && (
                        <div
                          className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-64 overflow-y-auto"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 flex items-center gap-2"
                            onClick={() => handleMarkChange(friend.id, null)}
                          >
                            <span className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0 inline-block" />
                            マークなし
                          </button>
                          {allMarks.map((m) => (
                            <button
                              key={m.id}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                              onClick={() => handleMarkChange(friend.id, m.id)}
                            >
                              <span className="w-4 h-4 rounded-full flex-shrink-0 border border-gray-200 inline-block" style={{ backgroundColor: m.color }} />
                              <span className="truncate">{m.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Expand indicator */}
                  <td className="px-4 py-3 text-right">
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </td>
                </tr>

                {/* Expanded detail row */}
                {isExpanded && (
                  <tr key={`${friend.id}-detail`} className="bg-gray-50">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1">LINE ユーザーID</p>
                          <p className="text-xs text-gray-600 font-mono">{friend.lineUserId}</p>
                        </div>

                        {/* Tag management */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2">タグ管理</p>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {friend.tags.map((tag) => (
                              <TagBadge
                                key={tag.id}
                                tag={tag}
                                onRemove={() => handleRemoveTag(friend.id, tag.id)}
                              />
                            ))}
                          </div>

                          {isAddingTag ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <select
                                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500"
                                value={selectedTagId}
                                onChange={(e) => setSelectedTagId(e.target.value)}
                              >
                                <option value="">タグを選択...</option>
                                {availableTags.map((tag) => (
                                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleAddTag(friend.id)}
                                disabled={!selectedTagId || loading}
                                className="px-3 py-1 text-xs font-medium rounded-md text-white disabled:opacity-50 transition-opacity"
                                style={{ backgroundColor: '#06C755' }}
                              >
                                追加
                              </button>
                              <button
                                onClick={() => { setAddingTagForFriend(null); setSelectedTagId('') }}
                                className="px-3 py-1 text-xs font-medium rounded-md text-gray-600 bg-gray-200 hover:bg-gray-300 transition-colors"
                              >
                                キャンセル
                              </button>
                            </div>
                          ) : (
                            availableTags.length > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setAddingTagForFriend(friend.id) }}
                                className="text-xs font-medium text-green-600 hover:text-green-700 flex items-center gap-1 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                タグを追加
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}
