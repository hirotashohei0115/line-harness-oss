'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api, fetchApi } from '@/lib/api'
import type { ContactMark } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'
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
  contactMarkId?: string | null
  isPinned?: boolean
  pinnedAt?: string | null
  unreadCount?: number
}

interface ChatMessage {
  id: string
  direction: 'incoming' | 'outgoing'
  messageType: string
  content: string
  sentByStaffName: string | null
  createdAt: string
}

interface ChatDetail extends Chat {
  friendName: string
  friendPictureUrl: string | null
  messages?: ChatMessage[]
}

type StatusFilter = 'all' | 'unread'

const statusConfig: Record<Chat['status'], { label: string; className: string }> = {
  unread: { label: '未読', className: 'bg-red-100 text-red-700' },
  in_progress: { label: '対応中', className: 'bg-yellow-100 text-yellow-700' },
  resolved: { label: '解決済', className: 'bg-green-100 text-green-700' },
}

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全て' },
  { key: 'unread', label: '未読' },
]

function getMarkTextColor(bgColor: string): string {
  const hex = bgColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16) || 0
  const g = parseInt(hex.substring(2, 4), 16) || 0
  const b = parseInt(hex.substring(4, 6), 16) || 0
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000000' : '#ffffff'
}

const WORKER_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

function getImageSrc(content: string): { type: 'dataurl' | 'url'; src: string } | null {
  try {
    const parsed = JSON.parse(content)
    if (parsed.messageId) return { type: 'url', src: `${WORKER_API_URL}/api/messages/${parsed.messageId}/content` }
    const url = parsed.originalContentUrl || parsed.previewImageUrl
    if (url) return { type: 'url', src: url }
  } catch { /* not JSON */ }
  if (content.startsWith('data:image/')) return { type: 'dataurl', src: content }
  if (content.startsWith('http')) return { type: 'url', src: content }
  return null
}

// JS fetch → blob URL で表示（<img src> のクロスオリジン問題を回避）
function ImageBubble({ content, onClick }: { content: string; onClick?: () => void }) {
  const imgSrc = getImageSrc(content)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const imgClass = `block max-w-[220px] rounded-lg${onClick ? ' cursor-pointer hover:opacity-90 transition-opacity' : ''}`

  // base64 data URLs can be displayed directly without fetch
  if (imgSrc?.type === 'dataurl') {
    return <img src={imgSrc.src} alt="送信された画像" className={imgClass} onClick={onClick} />
  }

  // HTTP URLs: use blob URL to avoid CORS issues
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!imgSrc) { setFailed(true); return }
    const controller = new AbortController()
    let objectUrl: string | null = null

    fetch(imgSrc.src, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      })
      .catch(err => {
        if (err instanceof Error && err.name === 'AbortError') return
        setFailed(true)
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imgSrc?.src])

  if (failed) return <span className="text-sm text-gray-400 px-3 py-2">🖼️ [画像]</span>
  if (!blobUrl) return <span className="text-xs text-gray-400 px-3 py-2">読み込み中...</span>
  return <img src={blobUrl} alt="送信された画像" className={imgClass} onClick={onClick} />
}

function ImageZoomModal({ content, onClose }: { content: string; onClose: () => void }) {
  const imgSrc = getImageSrc(content)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (imgSrc?.type !== 'url') return
    const controller = new AbortController()
    let objectUrl: string | null = null
    fetch(imgSrc.src, { signal: controller.signal })
      .then(r => r.blob())
      .then(blob => { objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl) })
      .catch(() => {})
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [imgSrc?.src, imgSrc?.type])

  const displaySrc = imgSrc?.type === 'dataurl' ? imgSrc.src : blobUrl

  const handleDownload = () => {
    if (!displaySrc) return
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const a = document.createElement('a')
    a.href = displaySrc
    a.download = `image_${ts}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 text-xl leading-none"
        aria-label="閉じる"
      >×</button>
      <div className="flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
        {displaySrc ? (
          <img
            src={displaySrc}
            alt="拡大表示"
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain' }}
            className="rounded-lg shadow-2xl"
          />
        ) : (
          <div className="text-white/60 text-sm">読み込み中...</div>
        )}
        <button
          onClick={handleDownload}
          disabled={!displaySrc}
          className="px-5 py-2 bg-white text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-100 disabled:opacity-50 shadow"
        >
          ⬇ ダウンロード
        </button>
      </div>
    </div>
  )
}

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
  sentByStaffName: string | null
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

interface Tag {
  id: string
  name: string
  color: string | null
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
  const [zoomedImageContent, setZoomedImageContent] = useState<string | null>(null)
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
        sentByStaffName: null,
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
      return <ImageBubble content={msg.content} onClick={() => setZoomedImageContent(msg.content)} />
    }
    return <span className="text-sm whitespace-pre-wrap break-words">{msg.content}</span>
  }

  return (
    <div className="flex flex-col h-full">
      {zoomedImageContent && <ImageZoomModal content={zoomedImageContent} onClose={() => setZoomedImageContent(null)} />}
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
                {msg.direction === 'outgoing' && msg.sentByStaffName && (
                  <span className="text-xs text-gray-400 px-1">{msg.sentByStaffName}</span>
                )}
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
            onKeyDown={(e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); handleSend() } }}
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
  const [pendingMessageType, setPendingMessageType] = useState('text')
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateCategory, setTemplateCategory] = useState<string>('all')
  const [repairQuote, setRepairQuote] = useState<RepairQuote | null>(null)
  const [repairAttrs, setRepairAttrs] = useState<Record<string, string>>({})
  const [mailOrder, setMailOrder] = useState<MailOrder | null>(null)
  const [repairEditMode, setRepairEditMode] = useState(false)
  const [repairEditData, setRepairEditData] = useState<Record<string, string>>({})
  const [savingRepair, setSavingRepair] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest')
  const [friendTags, setFriendTags] = useState<Tag[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tagInput, setTagInput] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [allMarks, setAllMarks] = useState<ContactMark[]>([])
  const [selectedFriendMarkId, setSelectedFriendMarkId] = useState<string | null>(null)
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterMarkId, setFilterMarkId] = useState<string | null>(null)
  const [advancedSearch, setAdvancedSearch] = useState('')
  const [advancedSearchIds, setAdvancedSearchIds] = useState<string[] | null>(null)
  const [filterFriendIdSet, setFilterFriendIdSet] = useState<Set<string> | null>(null)
  const [showTagFilter, setShowTagFilter] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [readConfirmed, setReadConfirmed] = useState(false)
  const [readingAll, setReadingAll] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [zoomedImageContent, setZoomedImageContent] = useState<string | null>(null)
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('chat_left_collapsed') === '1'
  })
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [layoutMode, setLayoutMode] = useState<'normal' | 'focus' | 'info'>('normal')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const prevChatsRef = useRef<Chat[]>([])
  const isAtBottomRef = useRef(true)
  const notifPermRef = useRef(false)

  const handleTogglePin = async (chat: Chat) => {
    const newPinned = !chat.isPinned
    try {
      await fetchApi(`/api/friends/${chat.friendId}/pin`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: newPinned }),
      })
      setChats(prev => prev.map(c =>
        c.id === chat.id
          ? { ...c, isPinned: newPinned, pinnedAt: newPinned ? new Date().toISOString() : null }
          : c
      ))
    } catch { /* silent */ }
  }

  // Notification permission request
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'granted') { notifPermRef.current = true; return }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => { notifPermRef.current = p === 'granted' })
    }
  }, [])

  // Reset tab title when leaving the chats page
  useEffect(() => {
    return () => { document.title = 'LINE Harness' }
  }, [])

  // Auto-scroll: always on open, conditional on poll
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [chatDetail?.messages])

  // Track scroll position to decide auto-scroll
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    const onScroll = () => {
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [chatDetail?.id])

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const query = selectedAccountId ? `?accountId=${encodeURIComponent(selectedAccountId)}` : ''
        const res = await fetchApi<{ success: boolean; data: Template[] }>(`/api/templates${query}`)
        if (res.success) setTemplates(res.data)
      } catch { /* silent */ }
    }
    loadTemplates()
  }, [selectedAccountId])

  const loadChats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: { unread?: boolean; accountId?: string } = {}
      if (statusFilter === 'unread') params.unread = true
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

  const silentLoadMessages = useCallback(async (chatId: string) => {
    try {
      const res = await api.chats.get(chatId)
      if (!res.success) return
      const detail = res.data as unknown as ChatDetail
      setChatDetail(prev => {
        if (!prev || prev.id !== chatId) return prev
        const msgs = detail.messages ?? []
        const prevMsgs = prev.messages ?? []
        // 件数だけでなく最新メッセージIDで比較（件数が同じでも新着を検出）
        const prevLastId = prevMsgs[prevMsgs.length - 1]?.id ?? ''
        const newLastId = msgs[msgs.length - 1]?.id ?? ''
        if (prevLastId === newLastId && prevMsgs.length === msgs.length) return prev
        return { ...prev, messages: msgs }
      })
    } catch { /* silent */ }
  }, [])

  const silentLoadChats = useCallback(async () => {
    try {
      const params: { unread?: boolean; accountId?: string } = {}
      if (statusFilter === 'unread') params.unread = true
      if (selectedAccountId) params.accountId = selectedAccountId
      const res = await api.chats.list(params)
      if (!res.success) return
      const newChats = res.data as unknown as Chat[]

      // Browser notification for new messages (background tab only)
      if (document.hidden && notifPermRef.current && prevChatsRef.current.length > 0) {
        for (const nc of newChats) {
          const prev = prevChatsRef.current.find(c => c.id === nc.id)
          if (
            prev &&
            nc.status === 'unread' &&
            nc.lastMessageAt &&
            nc.lastMessageAt !== prev.lastMessageAt
          ) {
            const n = new Notification('新着メッセージ', {
              body: `${nc.friendName}からメッセージが届きました`,
              icon: '/favicon.ico',
            })
            const capturedId = nc.id
            n.onclick = () => {
              window.focus()
              isAtBottomRef.current = true
              setSelectedChatId(capturedId)
              setSelectedFriendId(null)
              n.close()
            }
          }
        }
      }

      prevChatsRef.current = newChats
      setChats(newChats)

      // Update tab title with unread count (users with unread messages)
      const unread = newChats.filter(c => (c.unreadCount ?? 0) > 0).length
      document.title = unread > 0 ? `(${unread}) LINE Harness` : 'LINE Harness'
    } catch { /* silent */ }
  }, [statusFilter, selectedAccountId])

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

  const loadFriendTags = useCallback(async (friendId: string) => {
    try {
      const res = await fetchApi<{ success: boolean; data: { tags: Tag[]; contactMarkId?: string | null } }>(`/api/friends/${friendId}`)
      if (res.success) {
        setFriendTags(res.data.tags ?? [])
        setSelectedFriendMarkId(res.data.contactMarkId ?? null)
      }
    } catch { setFriendTags([]) }
  }, [])

  const loadAllTags = useCallback(async () => {
    try {
      const res = await fetchApi<{ success: boolean; data: Tag[] }>(`/api/tags`)
      if (res.success) setAllTags(res.data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    loadAllTags()
  }, [loadAllTags])

  // 5-second polling: chat list + open chat messages
  useEffect(() => {
    const id = setInterval(() => {
      void silentLoadChats()
      if (selectedChatId) void silentLoadMessages(selectedChatId)
    }, 5000)
    return () => clearInterval(id)
  }, [silentLoadChats, silentLoadMessages, selectedChatId])

  useEffect(() => {
    api.marks.list().then((res) => {
      if (res.success) setAllMarks(res.data as ContactMark[])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (filterTagIds.length === 0) { setFilterFriendIdSet(null); return }
    const tagIdsStr = filterTagIds.join(',')
    const base = `/api/friends?tagIds=${tagIdsStr}&limit=1000`
    const url = selectedAccountId ? `${base}&lineAccountId=${encodeURIComponent(selectedAccountId)}` : base
    fetchApi<{ success: boolean; data: { items: { id: string }[] } }>(url)
      .then(res => { if (res.success) setFilterFriendIdSet(new Set(res.data.items.map(f => f.id))) })
      .catch(() => {})
  }, [filterTagIds, selectedAccountId])

  useEffect(() => {
    if (!advancedSearch.trim()) { setAdvancedSearchIds(null); return }
    const timer = setTimeout(() => {
      fetchApi<{ success: boolean; data: string[] }>(
        `/api/friends/search?q=${encodeURIComponent(advancedSearch.trim())}`
      ).then(res => { if (res.success) setAdvancedSearchIds(res.data) }).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [advancedSearch])

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
      loadFriendTags(chatDetail.friendId)
    } else {
      setRepairQuote(null)
      setRepairAttrs({})
      setMailOrder(null)
      setFriendTags([])
      setSelectedFriendMarkId(null)
    }
    setRepairEditMode(false)
    setTagInput('')
  }, [chatDetail?.friendId, loadRepairInfo, loadFriendTags])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    document.addEventListener('webkitfullscreenchange', handler)
    return () => {
      document.removeEventListener('fullscreenchange', handler)
      document.removeEventListener('webkitfullscreenchange', handler)
    }
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  const handleSelectChat = (chatId: string) => {
    isAtBottomRef.current = true
    setSelectedChatId(chatId)
    setMessageContent('')
    setPendingImage(null)
    setPendingMessageType('text')
    setReadConfirmed(false)
    setEditingName(false)
  }

  const handleReadAll = async () => {
    if (!selectedChatId || readingAll || readConfirmed) return
    setReadingAll(true)
    try {
      await api.chats.readAll(selectedChatId)
      setReadConfirmed(true)
      setChats(prev => prev.map(c =>
        c.id === selectedChatId ? { ...c, unreadCount: 0 } : c
      ))
    } catch { /* silent */ }
    setReadingAll(false)
  }

  const handleSendMessage = async () => {
    if (!selectedChatId || sending) return
    if (!messageContent.trim() && !pendingImage) return
    setSending(true)
    try {
      if (pendingImage) {
        await api.chats.send(selectedChatId, { content: pendingImage, messageType: 'image' })
        setPendingImage(null)
      } else {
        await api.chats.send(selectedChatId, { content: messageContent.trim(), messageType: pendingMessageType })
        setMessageContent('')
        setPendingMessageType('text')
      }
      loadChatDetail(selectedChatId)
      loadChats()
    } catch {
      setError('メッセージの送信に失敗しました。')
    } finally {
      setSending(false)
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPendingImage(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
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
    if (advancedSearchIds !== null) {
      const idSet = new Set(advancedSearchIds)
      result = result.filter(c => idSet.has(c.friendId))
    }
    if (filterFriendIdSet !== null) {
      result = result.filter(c => filterFriendIdSet.has(c.friendId))
    }
    if (filterMarkId) {
      result = result.filter(c => c.contactMarkId === filterMarkId)
    }
    if (sortOrder === 'newest') {
      result.sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt))
    } else if (sortOrder === 'oldest') {
      result.sort((a, b) => (a.lastMessageAt ?? a.createdAt).localeCompare(b.lastMessageAt ?? b.createdAt))
    } else if (sortOrder === 'name') {
      result.sort((a, b) => a.friendName.localeCompare(b.friendName, 'ja'))
    }
    result.sort((a, b) => Number(b.isPinned ?? false) - Number(a.isPinned ?? false))
    return result
  }, [chats, searchQuery, sortOrder, advancedSearchIds, filterFriendIdSet, filterMarkId])

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
    } catch (err) {
      alert(`保存に失敗しました: ${err instanceof Error ? err.message : '不明なエラー'}`)
    } finally {
      setSavingRepair(false)
    }
  }

  const handleAddTag = async () => {
    const name = tagInput.trim()
    if (!name || !chatDetail?.friendId || addingTag) return
    setAddingTag(true)
    try {
      let tag = allTags.find(t => t.name.toLowerCase() === name.toLowerCase())
      if (!tag) {
        const createRes = await fetchApi<{ success: boolean; data: Tag }>(`/api/tags`, {
          method: 'POST',
          body: JSON.stringify({ name }),
        })
        if (!createRes.success) throw new Error('タグの作成に失敗しました')
        tag = createRes.data
        setAllTags(prev => [...prev, tag!])
      }
      if (friendTags.some(t => t.id === tag!.id)) { setTagInput(''); return }
      await fetchApi(`/api/friends/${chatDetail.friendId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tagId: tag.id }),
      })
      setFriendTags(prev => [...prev, tag!])
      setTagInput('')
    } catch (err) {
      alert(`タグの追加に失敗しました: ${err instanceof Error ? err.message : '不明なエラー'}`)
    } finally {
      setAddingTag(false)
    }
  }

  const handleRemoveTag = async (tagId: string) => {
    if (!chatDetail?.friendId) return
    try {
      await fetchApi(`/api/friends/${chatDetail.friendId}/tags/${tagId}`, { method: 'DELETE' })
      setFriendTags(prev => prev.filter(t => t.id !== tagId))
    } catch {
      alert('タグの削除に失敗しました')
    }
  }

  const handleStartEditName = () => {
    setEditNameValue(chatDetail?.friendName ?? '')
    setEditingName(true)
  }

  const handleSaveName = async () => {
    const newName = editNameValue.trim()
    if (!newName || !chatDetail?.friendId || savingName) return
    setSavingName(true)
    try {
      await fetchApi(`/api/friends/${chatDetail.friendId}`, {
        method: 'PATCH',
        body: JSON.stringify({ display_name: newName }),
      })
      setChatDetail(prev => prev ? { ...prev, friendName: newName } : prev)
      setChats(prev => prev.map(c => c.friendId === chatDetail.friendId ? { ...c, friendName: newName } : c))
      setEditingName(false)
    } catch {
      alert('名前の更新に失敗しました')
    } finally {
      setSavingName(false)
    }
  }

  const handleCancelEditName = () => setEditingName(false)

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void handleSaveName() }
    if (e.key === 'Escape') handleCancelEditName()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
    // Enter alone = newline (default behavior)
  }

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }

  return (
    <div>
      {zoomedImageContent && <ImageZoomModal content={zoomedImageContent} onClose={() => setZoomedImageContent(null)} />}
      <Header title="オペレーターチャット" />

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Layout mode controls */}
      <div className="flex items-center justify-end mb-2 gap-2">
        <button
          onClick={toggleFullscreen}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${isFullscreen ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
          title={isFullscreen ? '通常表示に戻す' : 'フルスクリーン'}
        >{isFullscreen ? '✕ 通常表示' : '⛶ フルスクリーン'}</button>
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {([
            { mode: 'normal' as const, icon: '⊞', label: '通常' },
            { mode: 'focus' as const, icon: '⊡', label: '集中' },
            { mode: 'info' as const, icon: '⊟', label: '情報' },
          ]).map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => {
                setLayoutMode(mode)
                if (mode === 'focus') { setLeftCollapsed(true); setRightCollapsed(true) }
                else { setLeftCollapsed(false); setRightCollapsed(false) }
              }}
              title={label}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${layoutMode === mode ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >{icon} {label}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 h-[calc(100vh-120px)] lg:h-[calc(100vh-195px)]">
        {/* Left Panel: Chat List */}
        <div className={`relative flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 flex-col overflow-hidden transition-all duration-200 ${
          leftCollapsed ? 'w-8' : (layoutMode === 'info' ? 'lg:w-72' : 'lg:w-80')
        } ${selectedChatId ? 'hidden lg:flex' : 'flex'}`}>
          {/* Left collapse toggle */}
          {leftCollapsed ? (
            <button
              onClick={() => { setLeftCollapsed(false); localStorage.setItem('chat_left_collapsed', '0') }}
              className="w-full h-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              title="チャット一覧を表示"
            >▶</button>
          ) : (
          <>
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
            <button
              onClick={() => { setLeftCollapsed(true); localStorage.setItem('chat_left_collapsed', '1') }}
              className="px-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-l border-gray-200 flex-shrink-0"
              title="チャット一覧を折りたたむ"
            >◀</button>
          </div>

          {/* Filter toggle button */}
          {(() => {
            const activeCount = [
              searchQuery.trim() !== '',
              advancedSearch.trim() !== '',
              sortOrder !== 'newest',
              filterTagIds.length > 0,
              filterMarkId !== null,
            ].filter(Boolean).length
            return (
              <div className="border-b border-gray-100">
                <button
                  onClick={() => setShowFilterPanel(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    {showFilterPanel ? '✕ 閉じる' : '🔍 絞り込み'}
                    {!showFilterPanel && activeCount > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                        絞り込み中 ({activeCount})
                      </span>
                    )}
                  </span>
                  <span className="text-gray-300 text-[10px]">{showFilterPanel ? '▲' : '▼'}</span>
                </button>
                {showFilterPanel && (
                  <div className="px-3 pb-2 pt-1 space-y-1.5 bg-gray-50">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="名前で検索..."
                      className="w-full text-xs border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
                    />
                    <input
                      type="text"
                      value={advancedSearch}
                      onChange={e => setAdvancedSearch(e.target.value)}
                      placeholder="電話/郵便番号/住所で検索..."
                      className="w-full text-xs border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
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
                    {/* Tag filter */}
                    <div className="relative">
                      <button
                        onClick={() => setShowTagFilter(v => !v)}
                        className={`w-full text-xs border rounded-md px-2.5 py-1.5 text-left flex items-center justify-between bg-white focus:outline-none focus:ring-1 focus:ring-green-500 ${filterTagIds.length > 0 ? 'border-green-400 text-green-700 font-medium' : 'border-gray-300 text-gray-400'}`}
                      >
                        <span>{filterTagIds.length > 0 ? `タグ: ${filterTagIds.length}件選択中` : 'タグで絞り込み...'}</span>
                        <span className="text-gray-400 text-[10px]">▾</span>
                      </button>
                      {showTagFilter && (
                        <div className="absolute top-full left-0 right-0 mt-0.5 z-20 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {allTags.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-gray-400">タグがありません</p>
                          ) : (
                            allTags.map(tag => (
                              <label key={tag.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={filterTagIds.includes(tag.id)}
                                  onChange={() => setFilterTagIds(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                                  className="rounded accent-green-500"
                                />
                                <span className="text-xs text-gray-700">{tag.name}</span>
                              </label>
                            ))
                          )}
                          {filterTagIds.length > 0 && (
                            <button
                              onClick={() => { setFilterTagIds([]); setShowTagFilter(false) }}
                              className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 border-t border-gray-100"
                            >クリア</button>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Mark filter */}
                    <select
                      value={filterMarkId ?? ''}
                      onChange={e => setFilterMarkId(e.target.value || null)}
                      className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
                    >
                      <option value="">対応マークで絞り込み...</option>
                      {allMarks.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )
          })()}

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
                  const pinned = Boolean(chat.isPinned)
                  return (
                    <div
                      key={chat.id}
                      onClick={() => { setSelectedFriendId(null); handleSelectChat(chat.id); }}
                      className={`w-full text-left py-3 border-b border-gray-100 transition-colors cursor-pointer flex ${
                        isSelected && !selectedFriendId
                          ? 'bg-green-50'
                          : pinned
                            ? 'bg-orange-50 hover:bg-orange-100'
                            : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Pin indicator — left border */}
                      <div className={`flex-shrink-0 w-1 rounded-r-sm self-stretch ${pinned ? 'bg-orange-400' : ''}`} />
                      <div className="flex items-center gap-3 flex-1 px-3">
                        <div className="relative flex-shrink-0">
                          {chat.friendPictureUrl ? (
                            <img src={chat.friendPictureUrl} alt="" className="w-10 h-10 rounded-full" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-gray-500 text-sm">{chat.friendName.charAt(0)}</span>
                            </div>
                          )}
                          {(chat.unreadCount ?? 0) > 0 && (
                            <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                              {(chat.unreadCount ?? 0) >= 10 ? '9+' : chat.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{chat.friendName}</p>
                          {(() => {
                            const mark = allMarks.find((m) => m.id === chat.contactMarkId)
                            if (!mark) return null
                            return (
                              <span
                                className="inline-block px-2 py-0.5 rounded text-xs font-medium mt-0.5 mb-0.5"
                                style={{ backgroundColor: mark.color, color: getMarkTextColor(mark.color) }}
                              >
                                {mark.name}
                              </span>
                            )
                          })()}
                          <p className="text-xs text-gray-400 mt-0.5">{formatDatetime(chat.lastMessageAt)}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); void handleTogglePin(chat) }}
                            className="p-1 rounded leading-none transition-all text-base hover:bg-gray-100"
                            style={pinned ? { opacity: 1 } : { filter: 'grayscale(1)', opacity: 0.3 }}
                            title={pinned ? 'ピン解除' : 'ピン止め'}
                          >📌</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
          </>
          )}
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
              <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between gap-2">
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
                  <div className="min-w-0 flex items-center gap-1">
                    {editingName ? (
                      <>
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onKeyDown={handleNameKeyDown}
                          autoFocus
                          className="text-sm font-medium text-gray-900 border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400 w-40"
                        />
                        <button
                          onClick={() => void handleSaveName()}
                          disabled={savingName || !editNameValue.trim()}
                          className="text-xs px-2 py-0.5 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
                        >{savingName ? '…' : '保存'}</button>
                        <button
                          onClick={handleCancelEditName}
                          className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded"
                        >✕</button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {chatDetail.friendName}
                        </p>
                        <button
                          onClick={handleStartEditName}
                          title="名前を編集"
                          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </>
                    )}
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
                </div>
              </div>

              {/* Read confirmation banner */}
              {(() => {
                const currentUnread = chats.find(c => c.id === selectedChatId)?.unreadCount ?? 0
                if (currentUnread === 0 && !readConfirmed) return null
                return (
                  <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2">
                    {readConfirmed ? (
                      <span className="text-xs text-green-600 font-medium">確認済み ✓</span>
                    ) : (
                      <>
                        <span className="text-xs text-gray-500">未読メッセージが {currentUnread} 件あります</span>
                        <button
                          onClick={handleReadAll}
                          disabled={readingAll}
                          className="px-3 py-1 text-xs font-medium text-white rounded-md disabled:opacity-50 transition-colors"
                          style={{ backgroundColor: '#06C755' }}
                        >
                          {readingAll ? '処理中...' : 'メッセージをすべて確認済みにする'}
                        </button>
                      </>
                    )}
                  </div>
                )
              })()}

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
                    const isFlex = msg.messageType === 'flex'
                    const isImage = msg.messageType === 'image'
                    let bubbleContent: React.ReactNode
                    if (isFlex) {
                      bubbleContent = (
                        <div className="max-w-[300px]">
                          <FlexPreviewComponent content={msg.content} maxWidth={280} />
                        </div>
                      )
                    } else if (isImage) {
                      bubbleContent = <ImageBubble content={msg.content} onClick={() => setZoomedImageContent(msg.content)} />
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
                          {/* メッセージバブル — 画像/flexはパディングなし */}
                          <div
                            className={`max-w-[320px] text-sm break-words whitespace-pre-wrap ${
                              isFlex || isImage ? '' : 'px-3 py-2'
                            } ${
                              isOutgoing
                                ? 'rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl text-white'
                                : 'rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl bg-white text-gray-900'
                            } ${
                              (isFlex || isImage) ? 'bg-transparent' : ''
                            }`}
                            style={isOutgoing && !isFlex && !isImage ? { backgroundColor: '#06C755' } : undefined}
                          >
                            {bubbleContent}
                          </div>
                          {/* 時刻・送信者名 */}
                          <span className="text-xs text-white/50 mt-0.5 px-1">
                            {new Date(msg.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isOutgoing && msg.sentByStaffName && (
                            <span className="text-xs text-gray-400 px-1">{msg.sentByStaffName}</span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Notes */}
              <div className="px-4 py-1.5 border-t border-gray-200 bg-gray-50">
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
              <div className="px-4 py-2 border-t border-gray-200">
                {/* Template picker */}
                {showTemplates && (
                  <div className="mb-2 border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
                    {/* Category tabs */}
                    <div className="flex gap-0 border-b border-gray-100 overflow-x-auto">
                      {['all', '来店予約', '郵送案内', '見積もり関連', 'よくある質問', 'その他'].map((cat) => {
                        const label = cat === 'all' ? '全て' : cat
                        const isActive = templateCategory === cat
                        const count = cat === 'all' ? templates.length : templates.filter(t => t.category === cat).length
                        return (
                          <button
                            key={cat}
                            onClick={() => setTemplateCategory(cat)}
                            className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
                              isActive
                                ? 'border-green-500 text-green-700 bg-green-50'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {label}{count > 0 && <span className="ml-1 text-gray-400">({count})</span>}
                          </button>
                        )
                      })}
                    </div>
                    {/* Template list */}
                    {(() => {
                      const filtered = templateCategory === 'all' ? templates : templates.filter(t => t.category === templateCategory)
                      if (filtered.length === 0) return (
                        <p className="px-3 py-3 text-xs text-gray-400 text-center">テンプレートがありません</p>
                      )
                      return (
                        <div className="max-h-40 overflow-y-auto">
                          {filtered.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => { setMessageContent(t.messageContent); setPendingMessageType(t.messageType || 'text'); setShowTemplates(false) }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                            >
                              <span className="font-medium text-gray-800">{t.name}</span>
                              <span className="ml-2 text-xs text-gray-400 truncate">{t.messageContent.slice(0, 40)}</span>
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )}
                {/* 画像プレビュー */}
                {pendingImage && (
                  <div className="mb-2 relative inline-block">
                    <img src={pendingImage} alt="プレビュー" className="max-h-32 rounded-lg border border-gray-200" />
                    <button
                      onClick={() => setPendingImage(null)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-gray-800"
                    >×</button>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  {/* 📎 画像添付 */}
                  <label className="flex-shrink-0 px-2 py-2 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors mt-0.5 cursor-pointer" title="画像を添付">
                    📎
                    <input type="file" accept="image/jpeg,image/png,image/gif" className="hidden" onChange={handleImageSelect} />
                  </label>
                  <button
                    onClick={() => setShowTemplates((v) => !v)}
                    className="flex-shrink-0 px-2 py-2 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors mt-0.5"
                    title="テンプレート"
                  >
                    📋
                  </button>
                  <textarea
                    rows={5}
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onInput={handleTextareaInput}
                    placeholder="メッセージを入力..."
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    style={{ minHeight: '120px', maxHeight: '200px' }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || (!messageContent.trim() && !pendingImage)}
                    className="flex-shrink-0 px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed mt-0.5"
                    style={{ backgroundColor: '#06C755' }}
                  >
                    {sending ? '送信中...' : '送信'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 text-center mt-1">Shift + Enter で送信</p>
              </div>
              </div>

              {/* Repair Info Sidebar */}
              <div className={`flex-shrink-0 flex-col border-l border-gray-200 bg-gray-50 overflow-y-auto transition-all duration-200 ${
                rightCollapsed ? 'w-8 overflow-hidden' : (layoutMode === 'info' ? 'w-96' : 'w-56')
              } flex`}>
                {rightCollapsed ? (
                  <button
                    onClick={() => setRightCollapsed(false)}
                    className="w-full h-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xs"
                    title="修理情報を表示"
                  >▶</button>
                ) : (
                <>
                <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center justify-between">
                  <button
                    onClick={() => setRightCollapsed(true)}
                    className="text-gray-400 hover:text-gray-600 text-xs mr-1"
                    title="修理情報を折りたたむ"
                  >◀</button>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex-1">修理情報</p>
                  {!repairEditMode && chatDetail && (
                    <button
                      onClick={handleRepairEdit}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                    >編集</button>
                  )}
                </div>

                {/* 対応マーク */}
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2">対応マーク</p>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-4 h-4 rounded-full border border-gray-200 flex-shrink-0"
                      style={{ backgroundColor: allMarks.find((m) => m.id === selectedFriendMarkId)?.color ?? '#e5e7eb' }}
                    />
                    <span className="text-xs text-gray-600">
                      {allMarks.find((m) => m.id === selectedFriendMarkId)?.name ?? 'マークなし'}
                    </span>
                  </div>
                  <select
                    className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={selectedFriendMarkId ?? ''}
                    onChange={async (e) => {
                      const markId = e.target.value || null
                      if (chatDetail) {
                        try {
                          await api.friends.updateMark(chatDetail.friendId, markId)
                          setSelectedFriendMarkId(markId)
                        } catch { /* silent */ }
                      }
                    }}
                  >
                    <option value="">マークなし</option>
                    {allMarks.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
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
                      <p className="text-[10px] text-gray-400 mb-0.5">希望店舗</p>
                      <select
                        value={repairEditData.repair_store ?? ''}
                        onChange={e => setRepairEditData(d => ({ ...d, repair_store: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
                      >
                        <option value="">（未選択）</option>
                        <option value="青森店">青森店</option>
                        <option value="盛岡店">盛岡店</option>
                        <option value="宇都宮店">宇都宮店</option>
                        <option value="菖蒲店">菖蒲店</option>
                        <option value="成田店">成田店</option>
                        <option value="幕張店">幕張店</option>
                        <option value="錦糸町店">錦糸町店</option>
                        <option value="五反田店">五反田店</option>
                        <option value="長岡店">長岡店</option>
                        <option value="岐阜店">岐阜店</option>
                        <option value="木津川店">木津川店</option>
                        <option value="大分店">大分店</option>
                      </select>
                    </div>
                    {/* dummy to satisfy trailing syntax */}
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
                        <option value="ordered">受注済</option>
                        <option value="cancelled">キャンセル</option>
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
                              repairQuote.status === 'ordered' ? 'bg-green-100 text-green-700' :
                              repairQuote.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {repairQuote.status === 'quoted' ? '見積済' :
                               repairQuote.status === 'ordered' ? '受注済' :
                               repairQuote.status === 'cancelled' ? 'キャンセル' : repairQuote.status}
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

                {/* Tag Section */}
                <div className="border-t border-gray-200">
                  <div className="px-3 py-2 bg-white flex items-center">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">タグ</p>
                  </div>
                  <div className="p-3 space-y-2">
                    {/* Tag list */}
                    <div className="flex flex-wrap gap-1 min-h-[24px]">
                      {friendTags.length === 0 ? (
                        <p className="text-[11px] text-gray-400">タグなし</p>
                      ) : (
                        friendTags.map(tag => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-700"
                          >
                            {tag.name}
                            <button
                              onClick={() => handleRemoveTag(tag.id)}
                              className="ml-0.5 text-blue-500 hover:text-blue-800 leading-none"
                              title="削除"
                            >×</button>
                          </span>
                        ))
                      )}
                    </div>
                    {/* Tag input */}
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleAddTag() } }}
                        placeholder="タグを入力..."
                        className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-green-500 min-w-0"
                        list="tag-suggestions"
                      />
                      <datalist id="tag-suggestions">
                        {allTags.filter(t => !friendTags.some(ft => ft.id === t.id)).map(t => (
                          <option key={t.id} value={t.name} />
                        ))}
                      </datalist>
                      <button
                        onClick={() => void handleAddTag()}
                        disabled={!tagInput.trim() || addingTag}
                        className="px-2 py-1 rounded text-[11px] font-medium text-white disabled:opacity-50 flex-shrink-0"
                        style={{ backgroundColor: '#06C755' }}
                      >{addingTag ? '...' : '追加'}</button>
                    </div>
                  </div>
                </div>
                </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
