'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api, fetchApi } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'
import CcPromptButton from '@/components/cc-prompt-button'
import FlexPreviewComponent from '@/components/flex-preview'

interface Chat {
  id: string
  friendId: string
  friendName: string
  friendPictureUrl: string | null
  operatorId: string | null
  status: 'unread' | 'in_progress' | 'resolved'
  notes: string | null
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

interface ChatMessage {
  id: string
  direction: 'incoming' | 'outgoing'
  messageType: string
  content: string
  createdAt: string
}

interface ChatDetail extends Chat {
  friendName: string
  friendPictureUrl: string | null
  messages?: ChatMessage[]
}

type StatusFilter = 'all' | 'unread' | 'in_progress' | 'resolved'

const statusConfig: Record<Chat['status'], { label: string; className: string }> = {
  unread: { label: '未読', className: 'bg-red-100 text-red-700' },
  in_progress: { label: '対応中', className: 'bg-yellow-100 text-yellow-700' },
  resolved: { label: '解決済', className: 'bg-green-100 text-green-700' },
}

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全て' },
  { key: 'unread', label: '未読' },
  { key: 'in_progress', label: '対応中' },
  { key: 'resolved', label: '解決済' },
]

function formatDatetime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ccPrompts = [
  {
    title: 'チャット対応テンプレート',
    prompt: `チャット対応で使えるテンプレートメッセージを作成してください。
1. よくある質問への回答テンプレート（挨拶、FAQ、サポート）
2. クレーム対応用の丁寧な返信テンプレート
3. フォローアップメッセージのテンプレート
手順を示してください。`,
  },
  {
    title: '未対応チャット確認',
    prompt: `未対応のチャットを確認し、対応優先度を整理してください。
1. 未読・対応中のチャット数を集計
2. 最終メッセージからの経過時間で優先度を判定
3. 長時間未対応のチャットへの対応アクションを提案
結果をレポートしてください。`,
  },
]

interface FriendItem {
  id: string
  displayName: string
  pictureUrl: string | null
  isFollowing: boolean
}

interface Template {
  id: string
  name: string
  category: string
  messageType: string
  messageContent: string
}

interface MessageLog {
  id: string
  direction: 'incoming' | 'outgoing'
  messageType: string
  content: string
  createdAt: string
}

interface RepairQuote {
  id: string
  productId: string | null
  symptomId: string | null
  modelName: string | null
  year: number | null
  priceFrom: number | null
  priceTo: number | null
  deliveryDaysFrom: number | null
  deliveryDaysTo: number | null
  requestType: string | null
  status: string
  createdAt: string
}

interface MailOrder {
  id: string
  friendId: string
  name: string
  postalCode: string
  address: string
  phone: string
  packagingKit: boolean
  deliveryStore: string
  status: string
  createdAt: string
}

function DirectMessagePanel({ friendId, friend, onBack, onSent }: {
  friendId: string
  friend: FriendItem | null
  onBack: () => void
  onSent: () => void
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadMessages = async () => {
      setLoadingMessages(true)
      try {
        const res = await fetchApi<{ success: boolean; data: MessageLog[] }>(
          `/api/friends/${friendId}/messages`
        )
        if (res.success) setMessages(res.data)
      } catch { /* silent */ }
      setLoadingMessages(false)
    }
    loadMessages()
  }, [friendId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    try {
      await fetchApi(`/api/friends/${friendId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: message, messageType: 'text' }),
      })
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        direction: 'outgoing',
        messageType: 'text',
        content: message,
        createdAt: new Date().toISOString(),
      }])
      setMessage('')
    } catch { /* silent */ } finally {
      setSending(false)
    }
  }

  function renderMessageContent(msg: MessageLog): React.ReactNode {
    if (msg.messageType === 'flex') {
      return <FlexPreviewComponent content={msg.content} maxWidth={260} />
    }
    if (msg.messageType === 'image') {
      try {
        const parsed = JSON.parse(msg.content)
        return <img src={parsed.originalContentUrl || parsed.previewImageUrl} alt="" className="max-w-[200px] rounded" />
      } catch {
        return <span>🖼️ [画像]</span>
      }
    }
    return <span className="text-sm whitespace-pre-wrap break-words">{msg.content}</span>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-gray-200 flex items-center gap-3">
        <button onClick={onBack} className="lg:hidden text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {friend?.pictureUrl ? (
          <img src={friend.pictureUrl} alt="" className="w-8 h-8 rounded-full" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-500 text-xs">{(friend?.displayName || '?').charAt(0)}</span>
          </div>
        )}
        <div>
          <p className="text-sm font-bold text-gray-900">{friend?.displayName || '不明'}</p>
          <p className="text-xs text-gray-400">メッセージ履歴</p>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundColor: '#7494C0' }}>
        {loadingMessages ? (
          <p className="text-center text-white/60 text-sm">読み込み中...</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-white/60 text-sm">メッセージ履歴がありません</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex items-end gap-2 ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
              {msg.direction === 'incoming' && (
                <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 mb-1" />
              )}
              <div className={`flex flex-col ${msg.direction === 'outgoing' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[280px] px-3 py-2 text-sm break-words ${
                  msg.direction === 'outgoing'
                    ? 'rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl text-white'
                    : 'rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl bg-white text-gray-900'
                } ${msg.messageType === 'flex' ? 'p-0 bg-transparent shadow-none' : ''}`}
                style={msg.direction === 'outgoing' && msg.messageType !== 'flex' ? { backgroundColor: '#06C755' } : undefined}
                >
                  {renderMessageContent(msg)}
                </div>
                <span className="text-xs text-white/50 mt-0.5 px-1">
                  {new Date(msg.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="メッセージを入力..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {sending ? '...' : '送信'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChatsPage() {
  const { selectedAccountId } = useAccount()
  const [chats, setChats] = useState<Chat[]>([])
  const [allFriends, setAllFriends] = useState<FriendItem[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)
  const [chatDetail, setChatDetail] = useState<ChatDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [messageContent, setMessageContent] = useState('')
  const [sending, setSending] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [repairQuote, setRepairQuote] = useState<RepairQuote | null>(null)
  const [repairAttrs, setRepairAttrs] = useState<Record<string, string>>({})
  const [mailOrder, setMailOrder] = useState<MailOrder | null>(null)
  const [repairEditMode, setRepairEditMode] = useState(false)
  const [repairEditData, setRepairEditData] = useState<Record<string, string>>({})
  const [savingRepair, setSavingRepair] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest')
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatDetail?.messages])

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const query = selectedAccountId ? `?accountId=${encodeURIComponent(selectedAccountId)}` : ''
        const res = await fetchApi<{ success: boolean; data: Template[] }>(`/api/templates${query}`)
        if (res.success) setTemplates(res.data.filter((t) => t.messageType === 'text'))
      } catch { /* silent */ }
    }
    loadTemplates()
  }, [selectedAccountId])

  const loadChats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: { status?: string; accountId?: string } = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (selectedAccountId) params.accountId = selectedAccountId
      const [chatRes, friendRes] = await Promise.allSettled([
        api.chats.list(params),
        api.friends.list({ accountId: selectedAccountId || undefined, limit: '800' }),
      ])
      if (chatRes.status === 'fulfilled' && chatRes.value.success) {
        setChats(chatRes.value.data as unknown as Chat[])
      }
      if (friendRes.status === 'fulfilled' && friendRes.value.success) {
        setAllFriends((friendRes.value.data as unknown as { items: FriendItem[] }).items)
      }
    } catch {
      setError('チャットの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, selectedAccountId])

  const loadChatDetail = useCallback(async (chatId: string) => {
    setDetailLoading(true)
    try {
      const res = await api.chats.get(chatId)
      if (res.success) {
        setChatDetail(res.data as unknown as ChatDetail)
        setNotes((res.data as unknown as ChatDetail).notes || '')
      }
    } catch {
      setError('チャット詳細の読み込みに失敗しました。')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const loadRepairInfo = useCallback(async (friendId: string) => {
    try {
      const [quoteRes, attrRes, mailOrderRes] = await Promise.allSettled([
        fetchApi<{ success: boolean; data: RepairQuote[] }>(`/api/repair/quotes/${friendId}`),
        fetchApi<{ success: boolean; data: Record<string, string> }>(`/api/repair/attributes/${friendId}`),
        fetchApi<{ success: boolean; data: MailOrder | null }>(`/api/repair/mail-orders/${friendId}`),
      ])
      if (quoteRes.status === 'fulfilled' && quoteRes.value.success) {
        setRepairQuote(quoteRes.value.data[0] ?? null)
      } else {
        setRepairQuote(null)
      }
      if (attrRes.status === 'fulfilled' && attrRes.value.success) {
        setRepairAttrs(attrRes.value.data)
      } else {
        setRepairAttrs({})
      }
      if (mailOrderRes.status === 'fulfilled' && mailOrderRes.value.success) {
        setMailOrder(mailOrderRes.value.data)
      } else {
        setMailOrder(null)
      }
    } catch {
      setRepairQuote(null)
      setRepairAttrs({})
      setMailOrder(null)
    }
  }, [])

  useEffect(() => {
    loadChats()
  }, [loadChats])

  useEffect(() => {
    if (selectedChatId) {
      loadChatDetail(selectedChatId)
    } else {
      setChatDetail(null)
    }
  }, [selectedChatId, loadChatDetail])

  useEffect(() => {
    if (chatDetail?.friendId) {
      loadRepairInfo(chatDetail.friendId)
    } else {
      setRepairQuote(null)
      setRepairAttrs({})
      setMailOrder(null)
    }
    setRepairEditMode(false)
  }, [chatDetail?.friendId, loadRepairInfo])

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId)
    setMessageContent('')
  }

  const handleSendMessage = async () => {
    if (!selectedChatId || !messageContent.trim() || sending) return
    setSending(true)
    try {
      await api.chats.send(selectedChatId, { content: messageContent.trim() })
      setMessageContent('')
      loadChatDetail(selectedChatId)
      loadChats()
    } catch {
      setError('メッセージの送信に失敗しました。')
    } finally {
      setSending(false)
    }
  }

  const handleStatusUpdate = async (newStatus: Chat['status']) => {
    if (!selectedChatId) return
    try {
      await api.chats.update(selectedChatId, { status: newStatus })
      loadChatDetail(selectedChatId)
      loadChats()
    } catch {
      setError('ステータスの更新に失敗しました。')
    }
  }

  const handleSaveNotes = async () => {
    if (!selectedChatId) return
    setSavingNotes(true)
    try {
      await api.chats.update(selectedChatId, { notes })
      loadChatDetail(selectedChatId)
    } catch {
      setError('メモの保存に失敗しました。')
    } finally {
      setSavingNotes(false)
    }
  }

  const filteredChats = useMemo(() => {
    let result = [...chats]
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(c => c.friendName.toLowerCase().includes(q))
    }
    if (sortOrder === 'newest') {
      result.sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt))
    } else if (sortOrder === 'oldest') {
      result.sort((a, b) => (a.lastMessageAt ?? a.createdAt).localeCompare(b.lastMessageAt ?? b.createdAt))
    } else if (sortOrder === 'name') {
      result.sort((a, b) => a.friendName.localeCompare(b.friendName, 'ja'))
    }
    return result
  }, [chats, searchQuery, sortOrder])

  const handleRepairEdit = () => {
    setRepairEditData({
      repair_product_name: repairAttrs.repair_product_name ?? '',
      repair_model_name: repairAttrs.repair_model_name ?? '',
      repair_symptom_name: repairAttrs.repair_symptom_name ?? '',
      repair_year: repairAttrs.repair_year ?? '',
      repair_inch_size: repairAttrs.repair_inch_size ?? '',
      repair_store: repairAttrs.repair_store ?? '',
      priceFrom: repairQuote?.priceFrom != null ? String(repairQuote.priceFrom) : '',
      priceTo: repairQuote?.priceTo != null ? String(repairQuote.priceTo) : '',
      deliveryDaysFrom: repairQuote?.deliveryDaysFrom != null ? String(repairQuote.deliveryDaysFrom) : '',
      deliveryDaysTo: repairQuote?.deliveryDaysTo != null ? String(repairQuote.deliveryDaysTo) : '',
      requestType: repairQuote?.requestType ?? '',
      status: repairQuote?.status ?? '',
    })
    setRepairEditMode(true)
  }

  const handleRepairSave = async () => {
    if (!chatDetail?.friendId) return
    setSavingRepair(true)
    try {
      await fetchApi(`/api/repair/attributes/${chatDetail.friendId}`, {
        method: 'PATCH',
        body: JSON.stringify(repairEditData),
      })
      setRepairEditMode(false)
      await loadRepairInfo(chatDetail.friendId)
    } catch {
      // silent
    } finally {
      setSavingRepair(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }

  return (
    <div>
      <Header title="オペレーターチャット" />

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-120px)] lg:h-[calc(100vh-180px)]">
        {/* Left Panel: Chat List */}
        <div className={`w-full lg:w-96 lg:flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 flex-col overflow-hidden ${selectedChatId ? 'hidden lg:flex' : 'flex'}`}>
          {/* Status Filter Tabs */}
          <div className="flex border-b border-gray-200">
            {statusFilters.map((filter) => (
              <button
                key={filter.key}
                onClick={() => { setStatusFilter(filter.key); setSelectedChatId(null) }}
                className={`flex-1 px-3 py-2.5 min-h-[44px] text-xs font-medium transition-colors ${
                  statusFilter === filter.key
                    ? 'text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={statusFilter === filter.key ? { backgroundColor: '#06C755' } : undefined}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Search & Sort */}
          <div className="px-3 py-2 border-b border-gray-100 space-y-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="名前で検索..."
              className="w-full text-xs border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as 'newest' | 'oldest' | 'name')}
              className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
            >
              <option value="newest">最終メッセージ（新しい順）</option>
              <option value="oldest">最終メッセージ（古い順）</option>
              <option value="name">名前（あいうえお順）</option>
            </select>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="px-4 py-3 border-b border-gray-100 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-200 rounded w-32" />
                        <div className="h-2 bg-gray-100 rounded w-20" />
                      </div>
                      <div className="h-5 bg-gray-100 rounded-full w-12" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {filteredChats.length === 0 && !loading && (
                  <p className="px-4 py-6 text-xs text-gray-400 text-center">該当するチャットがありません</p>
                )}
                {filteredChats.map((chat) => {
                  const statusInfo = statusConfig[chat.status]
                  const isSelected = selectedChatId === chat.id
                  return (
                    <button
                      key={chat.id}
                      onClick={() => { setSelectedFriendId(null); handleSelectChat(chat.id); }}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                        isSelected && !selectedFriendId ? 'bg-green-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {chat.friendPictureUrl ? (
                          <img src={chat.friendPictureUrl} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-gray-500 text-sm">{chat.friendName.charAt(0)}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{chat.friendName}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatDatetime(chat.lastMessageAt)}</p>
                        </div>
                        <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Right Panel: Chat Detail */}
        <div className={`flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex-col overflow-hidden ${selectedChatId || selectedFriendId ? 'flex' : 'hidden lg:flex'}`}>
          {selectedFriendId && !selectedChatId ? (
            /* Direct message to friend without existing chat */
            <DirectMessagePanel
              friendId={selectedFriendId}
              friend={allFriends.find((f) => f.id === selectedFriendId) || null}
              onBack={() => setSelectedFriendId(null)}
              onSent={() => { setSelectedFriendId(null); loadChats(); }}
            />
          ) : !selectedChatId ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-400 text-sm">チャットを選択してください</p>
            </div>
          ) : detailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-400 text-sm">読み込み中...</p>
            </div>
          ) : chatDetail ? (
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Chat Header */}
              <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setSelectedChatId(null)}
                    className="lg:hidden flex-shrink-0 p-1 -ml-1 text-gray-500 hover:text-gray-700"
                    aria-label="戻る"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  {chatDetail.friendPictureUrl && (
                    <img src={chatDetail.friendPictureUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {chatDetail.friendName}
                    </p>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${statusConfig[chatDetail.status].className}`}
                    >
                      {statusConfig[chatDetail.status].label}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {chatDetail.status !== 'unread' && (
                    <button
                      onClick={() => handleStatusUpdate('unread')}
                      className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                    >
                      未読に戻す
                    </button>
                  )}
                  {chatDetail.status !== 'in_progress' && (
                    <button
                      onClick={() => handleStatusUpdate('in_progress')}
                      className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-md transition-colors"
                    >
                      対応中にする
                    </button>
                  )}
                  {chatDetail.status !== 'resolved' && (
                    <button
                      onClick={() => handleStatusUpdate('resolved')}
                      className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors"
                    >
                      解決済にする
                    </button>
                  )}
                </div>
              </div>

              {/* Messages — LINE-style chat bubbles */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundColor: '#7494C0' }}>
                {(!chatDetail.messages || chatDetail.messages.length === 0) ? (
                  <div className="text-center py-8">
                    <p className="text-white/60 text-sm">メッセージはまだありません。</p>
                  </div>
                ) : (
                  (chatDetail.messages ?? []).map((msg) => {
                    const isOutgoing = msg.direction === 'outgoing'

                    // メッセージ表示の分岐
                    let bubbleContent: React.ReactNode
                    if (msg.messageType === 'flex') {
                      bubbleContent = (
                        <div className="max-w-[300px]">
                          <FlexPreviewComponent content={msg.content} maxWidth={280} />
                        </div>
                      )
                    } else if (msg.messageType === 'image') {
                      try {
                        const parsed = JSON.parse(msg.content)
                        bubbleContent = (
                          <img src={parsed.originalContentUrl || parsed.previewImageUrl} alt="" className="max-w-[200px] rounded" />
                        )
                      } catch {
                        bubbleContent = <span>🖼️ [画像]</span>
                      }
                    } else {
                      bubbleContent = <span>{msg.content}</span>
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`flex items-end gap-2 ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                      >
                        {/* 相手のアイコン（incoming のみ） */}
                        {!isOutgoing && (
                          chatDetail.friendPictureUrl ? (
                            <img src={chatDetail.friendPictureUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mb-1" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 mb-1" />
                          )
                        )}

                        <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}>
                          {/* メッセージバブル */}
                          <div
                            className={`max-w-[320px] px-3 py-2 text-sm break-words whitespace-pre-wrap ${
                              isOutgoing
                                ? 'rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl text-white'
                                : 'rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl bg-white text-gray-900'
                            }`}
                            style={isOutgoing ? { backgroundColor: '#06C755' } : undefined}
                          >
                            {bubbleContent}
                          </div>
                          {/* 時刻 */}
                          <span className="text-xs text-white/50 mt-0.5 px-1">
                            {new Date(msg.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Notes */}
              <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="メモを入力..."
                    className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
                  >
                    {savingNotes ? '保存中...' : 'メモ保存'}
                  </button>
                </div>
              </div>

              {/* Send Message Form */}
              <div className="px-4 py-3 border-t border-gray-200">
                {/* Template picker */}
                {showTemplates && templates.length > 0 && (
                  <div className="mb-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-sm">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setMessageContent(t.messageContent); setShowTemplates(false) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <span className="font-medium text-gray-800">{t.name}</span>
                        <span className="ml-2 text-xs text-gray-400 truncate">{t.messageContent.slice(0, 40)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showTemplates && templates.length === 0 && (
                  <p className="mb-2 text-xs text-gray-400 text-center">テンプレートがありません</p>
                )}
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => setShowTemplates((v) => !v)}
                    className="flex-shrink-0 px-2 py-2 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors mt-0.5"
                    title="テンプレート"
                  >
                    📋
                  </button>
                  <textarea
                    rows={4}
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onInput={handleTextareaInput}
                    placeholder="メッセージを入力..."
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    style={{ minHeight: '88px', maxHeight: '240px' }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !messageContent.trim()}
                    className="flex-shrink-0 px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed mt-0.5"
                    style={{ backgroundColor: '#06C755' }}
                  >
                    {sending ? '送信中...' : '送信'}
                  </button>
                </div>
              </div>
              </div>

              {/* Repair Info Sidebar */}
              <div className="flex w-56 flex-shrink-0 flex-col border-l border-gray-200 bg-gray-50 overflow-y-auto">
                <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">修理情報</p>
                  {!repairEditMode && chatDetail && (
                    <button
                      onClick={handleRepairEdit}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                    >編集</button>
                  )}
                </div>

                {repairEditMode ? (
                  /* ─── Edit Mode ─── */
                  <div className="p-3 space-y-2 text-xs">
                    {([
                      { key: 'repair_product_name', label: '機種' },
                      { key: 'repair_model_name', label: 'モデル番号' },
                      { key: 'repair_symptom_name', label: '症状' },
                      { key: 'repair_year', label: '年式' },
                      { key: 'repair_inch_size', label: 'インチ' },
                      { key: 'repair_store', label: '希望店舗' },
                      { key: 'priceFrom', label: '料金（下限）¥' },
                      { key: 'priceTo', label: '料金（上限）¥' },
                      { key: 'deliveryDaysFrom', label: '納期（下限）日' },
                      { key: 'deliveryDaysTo', label: '納期（上限）日' },
                    ] as { key: string; label: string }[]).map(({ key, label }) => (
                      <div key={key}>
                        <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
                        <input
                          type="text"
                          value={repairEditData[key] ?? ''}
                          onChange={e => setRepairEditData(d => ({ ...d, [key]: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                      </div>
                    ))}
                    <div>
                      <p className="text-[10px] text-gray-400 mb-0.5">依頼方法</p>
                      <select
                        value={repairEditData.requestType ?? ''}
                        onChange={e => setRepairEditData(d => ({ ...d, requestType: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                      >
                        <option value="">未設定</option>
                        <option value="mail">郵送</option>
                        <option value="store">来店</option>
                        <option value="consult">相談</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 mb-0.5">ステータス</p>
                      <select
                        value={repairEditData.status ?? ''}
                        onChange={e => setRepairEditData(d => ({ ...d, status: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                      >
                        <option value="">未設定</option>
                        <option value="quoted">見積済</option>
                        <option value="accepted">対応中</option>
                        <option value="completed">修理完了</option>
                        <option value="shipped">返送済</option>
                      </select>
                    </div>
                    <div className="flex gap-1 pt-1">
                      <button
                        onClick={handleRepairSave}
                        disabled={savingRepair}
                        className="flex-1 py-1 rounded text-[11px] font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: '#06C755' }}
                      >{savingRepair ? '保存中...' : '保存'}</button>
                      <button
                        onClick={() => setRepairEditMode(false)}
                        className="flex-1 py-1 rounded text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-600"
                      >キャンセル</button>
                    </div>
                  </div>
                ) : (
                  /* ─── View Mode ─── */
                  (() => {
                    const product = repairAttrs?.repair_product_name
                    const symptom = repairAttrs?.repair_symptom_name
                    const modelName = repairAttrs?.repair_model_name
                    const year = repairAttrs?.repair_year
                    const rawInch = repairAttrs?.repair_inch_size
                    const inchDisplay = rawInch
                      ? String(rawInch).includes('インチ') ? rawInch : `${rawInch}インチ`
                      : ''
                    const store = repairAttrs?.repair_store
                    const hasAnyInfo = product || symptom || repairQuote

                    return (
                      <div className="p-3 space-y-2 text-xs text-gray-700">
                        {repairQuote && (
                          <p className="text-[10px] text-gray-400">
                            {new Date(repairQuote.createdAt).toLocaleDateString('ja-JP')}
                          </p>
                        )}

                        {product && (
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">機種</p>
                            <p className="font-medium">{product}</p>
                          </div>
                        )}

                        {modelName && (
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">モデル</p>
                            <p className="font-medium">
                              {modelName}
                              {(year || inchDisplay) && (
                                <span className="font-normal text-gray-500">
                                  {`（${[year ? `${year}年` : '', inchDisplay].filter(Boolean).join(' ')}）`}
                                </span>
                              )}
                            </p>
                          </div>
                        )}

                        {symptom && (
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">症状</p>
                            <p className="font-medium">{symptom}</p>
                          </div>
                        )}

                        {repairQuote?.priceFrom != null && (
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">料金</p>
                            <p className="font-medium text-green-700">
                              ¥{repairQuote.priceFrom.toLocaleString()}
                              {repairQuote.priceTo ? `〜¥${repairQuote.priceTo.toLocaleString()}` : '〜'}
                            </p>
                          </div>
                        )}

                        {repairQuote && (repairQuote.deliveryDaysFrom != null || repairQuote.deliveryDaysTo != null) && (
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">納期</p>
                            <p>{repairQuote.deliveryDaysFrom}〜{repairQuote.deliveryDaysTo}日</p>
                          </div>
                        )}

                        {repairQuote?.requestType && (
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">依頼方法</p>
                            <p>{{mail:'郵送',store:'店舗持込',consult:'相談'}[repairQuote.requestType] ?? repairQuote.requestType}</p>
                          </div>
                        )}

                        {store && (
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">希望店舗</p>
                            <p className="font-medium">{store}</p>
                          </div>
                        )}

                        {repairQuote && (
                          <div className="pt-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              repairQuote.status === 'quoted' ? 'bg-blue-100 text-blue-700' :
                              repairQuote.status === 'accepted' ? 'bg-green-100 text-green-700' :
                              repairQuote.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {repairQuote.status === 'quoted' ? '見積済' :
                               repairQuote.status === 'accepted' ? '受注済' :
                               repairQuote.status === 'completed' ? '完了' : repairQuote.status}
                            </span>
                          </div>
                        )}

                        {/* 郵送依頼情報 */}
                        {mailOrder && (
                          <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">郵送依頼情報</p>
                            <div>
                              <p className="text-[10px] text-gray-400 mb-0.5">お名前</p>
                              <p className="font-medium">{mailOrder.name}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 mb-0.5">郵便番号</p>
                              <p>{mailOrder.postalCode}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 mb-0.5">ご住所</p>
                              <p>{mailOrder.address}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 mb-0.5">電話番号</p>
                              <p>{mailOrder.phone}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 mb-0.5">梱包キット</p>
                              <p>{mailOrder.packagingKit ? 'あり（無料）' : 'なし'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 mb-0.5">配送先店舗</p>
                              <p className="font-medium">{mailOrder.deliveryStore}</p>
                            </div>
                            <div>
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                mailOrder.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                mailOrder.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                                mailOrder.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                                'bg-orange-100 text-orange-700'
                              }`}>
                                {mailOrder.status === 'pending' ? '受付済' :
                                 mailOrder.status === 'shipped' ? '発送済' :
                                 mailOrder.status === 'completed' ? '完了' : mailOrder.status}
                              </span>
                            </div>
                          </div>
                        )}

                        {!hasAnyInfo && !mailOrder && (
                          <p className="text-gray-400">修理情報なし</p>
                        )}
                      </div>
                    )
                  })()
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
