'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'
import CcPromptButton from '@/components/cc-prompt-button'
import { useAccount } from '@/contexts/account-context'

interface NotificationRule {
  id: string
  name: string
  eventType: string
  conditions: Record<string, unknown>
  channels: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface Notification {
  id: string
  ruleId: string | null
  eventType: string
  title: string
  body: string
  channel: string
  status: 'pending' | 'sent' | 'failed'
  metadata: string | null
  createdAt: string
}

const STORE_KEY_LIST = [
  { key: 'aomori',     label: '青森店' },
  { key: 'morioka',    label: '盛岡店' },
  { key: 'utsunomiya', label: '宇都宮店' },
  { key: 'shobu',      label: '菖蒲店' },
  { key: 'narita',     label: '成田店' },
  { key: 'makuhari',   label: '幕張店' },
  { key: 'kinshicho',  label: '錦糸町店' },
  { key: 'gotanda',    label: '五反田店' },
  { key: 'nagaoka',    label: '長岡店' },
  { key: 'gifu',       label: '岐阜店' },
  { key: 'kizugawa',   label: '木津川店' },
  { key: 'oita',       label: '大分店' },
]

interface CreateFormState {
  name: string
  eventType: string
  channels: string
  folder: string
  store: string
  storeKey: string
  tagName: string
  chatworkApiToken: string
  chatworkRoomId: string
  chatworkToId: string
  lineGroupId: string
}

interface Tag {
  id: string
  name: string
}

const statusConfig: Record<
  Notification['status'],
  { label: string; className: string }
> = {
  pending: { label: '保留中', className: 'bg-gray-100 text-gray-600' },
  sent: { label: '送信済み', className: 'bg-green-100 text-green-700' },
  failed: { label: '失敗', className: 'bg-red-100 text-red-700' },
}

const statusFilterOptions: { value: string; label: string }[] = [
  { value: '', label: 'すべて' },
  { value: 'pending', label: '保留中' },
  { value: 'sent', label: '送信済み' },
  { value: 'failed', label: '失敗' },
]

function formatDatetime(iso: string): string {
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
    title: '通知ルール設定',
    prompt: `通知ルールの設定をサポートしてください。
1. 利用可能なイベントタイプと通知条件の説明
2. 効果的な通知ルールの設計パターンを提案
3. 通知の優先度と頻度のベストプラクティス
手順を示してください。`,
  },
  {
    title: '通知チャネル追加',
    prompt: `新しい通知チャネルの追加手順をガイドしてください。
1. 利用可能な通知チャネル（email、Slack、Webhook）の設定方法
2. 各チャネルの接続テストと動作確認手順
3. チャネル別の通知内容カスタマイズ方法
手順を示してください。`,
  },
]

const EVENT_TYPE_LABELS: Record<string, string> = {
  message_received: 'メッセージ受信',
  reservation_created: '来店予約',
  visit_order_created: '訪問修理依頼',
  order_received: '受注',
  friend_add: '友だち追加',
  tag_added: 'タグ付与',
  contact_form_submitted: 'お問い合わせフォーム送信',
}

const EMPTY_FORM: CreateFormState = {
  name: '',
  eventType: '',
  channels: '',
  folder: '',
  store: '',
  storeKey: '',
  tagName: '',
  chatworkApiToken: '',
  chatworkRoomId: '',
  chatworkToId: '',
  lineGroupId: '',
}

export default function NotificationsPage() {
  const { selectedAccountId } = useAccount()
  const formRef = useRef<HTMLDivElement>(null)
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const loadRules = useCallback(async () => {
    try {
      const res = await api.notifications.rules.list(selectedAccountId ? { accountId: selectedAccountId } : undefined)
      if (res.success) {
        // channels may be a JSON string or already parsed array
        setRules((res.data as unknown as NotificationRule[]).map((r: NotificationRule) => ({
          ...r,
          channels: typeof r.channels === 'string' ? JSON.parse(r.channels) : r.channels,
          conditions: typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions,
        })))
      }
      else setError(res.error)
    } catch {
      setError('通知ルールの読み込みに失敗しました。もう一度お試しください。')
    }
  }, [selectedAccountId])

  const loadNotifications = useCallback(async (status?: string) => {
    try {
      const params: { status?: string; limit?: string; accountId?: string } = { limit: '50' }
      if (status) params.status = status
      if (selectedAccountId) params.accountId = selectedAccountId
      const res = await api.notifications.list(params)
      if (res.success) setNotifications(res.data)
      else setError(res.error)
    } catch {
      setError('通知履歴の読み込みに失敗しました。もう一度お試しください。')
    }
  }, [selectedAccountId])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadRules(), loadNotifications(statusFilter || undefined)])
    } finally {
      setLoading(false)
    }
  }, [loadRules, loadNotifications, statusFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.tags.list().then((res) => {
      if (res.success) setAllTags(res.data as Tag[])
    }).catch(() => {})
  }, [])

  const scrollToForm = () => {
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
    scrollToForm()
  }

  const openEdit = (rule: NotificationRule) => {
    setEditingId(rule.id)
    setForm({
      name: rule.name,
      eventType: rule.eventType,
      channels: rule.channels.join(', '),
      folder: String(rule.conditions?.folder ?? ''),
      store: String(rule.conditions?.store ?? ''),
      storeKey: String(rule.conditions?.storeKey ?? ''),
      tagName: String(rule.conditions?.tagName ?? ''),
      chatworkApiToken: String(rule.conditions?.chatworkApiToken ?? ''),
      chatworkRoomId: String(rule.conditions?.chatworkRoomId ?? ''),
      chatworkToId: String(rule.conditions?.chatworkToId ?? ''),
      lineGroupId: String(rule.conditions?.lineGroupId ?? ''),
    })
    setFormError('')
    setShowForm(true)
    scrollToForm()
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormError('')
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('ルール名を入力してください')
      return
    }
    if (!form.eventType.trim()) {
      setFormError('イベントタイプを入力してください')
      return
    }

    const conditions: Record<string, unknown> = {}
    if (form.folder.trim()) {
      conditions.folder = form.folder.trim()
    }
    if (form.store) {
      conditions.store = form.store
    }
    if (form.storeKey) {
      conditions.storeKey = form.storeKey
    }
    if (form.tagName) {
      conditions.tagName = form.tagName
    }
    if (form.chatworkApiToken.trim()) {
      conditions.chatworkApiToken = form.chatworkApiToken.trim()
    }
    if (form.chatworkRoomId.trim()) {
      conditions.chatworkRoomId = form.chatworkRoomId.trim()
    }
    if (form.chatworkToId.trim()) {
      conditions.chatworkToId = form.chatworkToId.trim()
    }
    if (form.lineGroupId.trim()) {
      conditions.lineGroupId = form.lineGroupId.trim()
    }

    const channels = form.channels
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)

    setSaving(true)
    setFormError('')
    try {
      let res
      if (editingId) {
        res = await api.notifications.rules.update(editingId, {
          name: form.name,
          eventType: form.eventType,
          conditions,
          channels,
        })
      } else {
        res = await api.notifications.rules.create({
          name: form.name,
          eventType: form.eventType,
          conditions,
          channels,
          lineAccountId: selectedAccountId,
        })
      }
      if (res.success) {
        closeForm()
        loadRules()
      } else {
        setFormError(res.error)
      }
    } catch {
      setFormError(editingId ? '更新に失敗しました' : '作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await api.notifications.rules.update(id, { isActive: !current })
      loadRules()
    } catch {
      setError('ステータスの変更に失敗しました')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このルールを削除してもよいですか？')) return
    try {
      await api.notifications.rules.delete(id)
      loadRules()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    loadNotifications(value || undefined)
  }

  return (
    <div>
      <Header
        title="通知ルール設定"
        action={
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + 新規ルール
          </button>
        }
      />

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div ref={formRef} className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">{editingId ? 'ルールを編集' : '新規ルールを作成'}</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ルール名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: 新規友だち追加通知"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            {(() => {
              // カスタムフォルダ（イベント種別キーでないもの）
              const customFolders = Array.from(new Set(
                rules.map(r => String(r.conditions?.folder ?? '')).filter(f => f && !(f in EVENT_TYPE_LABELS))
              ))
              // 現在ルールに存在するイベント種別
              const usedEventTypes = Array.from(new Set(rules.map(r => r.eventType))).filter(t => t in EVENT_TYPE_LABELS)
              const folderIsExisting = customFolders.includes(form.folder) || (form.folder in EVENT_TYPE_LABELS)
              const selectVal = form.folder === '' ? '' : folderIsExisting ? form.folder : '__new__'
              return (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">フォルダ</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    value={selectVal}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setForm({ ...form, folder: folderIsExisting ? '' : form.folder })
                      } else {
                        setForm({ ...form, folder: e.target.value })
                      }
                    }}
                  >
                    <option value="">フォルダなし（イベント種別でグループ化）</option>
                    {customFolders.length > 0 && (
                      <optgroup label="カスタムフォルダ">
                        {customFolders.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="イベント種別グループ">
                      {usedEventTypes.map(t => (
                        <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                      ))}
                    </optgroup>
                    <option value="__new__">＋ 新しいフォルダを作成...</option>
                  </select>
                  {selectVal === '__new__' && (
                    <input
                      type="text"
                      autoFocus
                      className="mt-2 w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="新しいフォルダ名を入力"
                      value={form.folder}
                      onChange={(e) => setForm({ ...form, folder: e.target.value })}
                    />
                  )}
                  <p className="text-xs text-gray-400 mt-1">同じフォルダのルールはまとめて表示されます</p>
                </div>
              )
            })()}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">イベントタイプ <span className="text-red-500">*</span></label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={form.eventType}
                onChange={(e) => setForm({ ...form, eventType: e.target.value })}
              >
                <option value="">選択してください</option>
                <option value="contact_form_submitted">contact_form_submitted（お問い合わせフォーム送信）</option>
                <option value="order_received">order_received（受注）</option>
                <option value="reservation_created">reservation_created（来店予約）</option>
                <option value="visit_order_created">visit_order_created（訪問修理依頼）</option>
                <option value="friend_add">friend_add（友だち追加）</option>
                <option value="message_received">message_received（メッセージ受信）</option>
                <option value="tag_added">tag_added（タグ付与）</option>
              </select>
            </div>
            {form.eventType === 'order_received' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">対象店舗</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={form.store}
                  onChange={(e) => setForm({ ...form, store: e.target.value })}
                >
                  <option value="">すべての店舗（店舗未指定）</option>
                  {STORE_KEY_LIST.map(s => (
                    <option key={s.key} value={s.label}>{s.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">選択した店舗で受注したときのみ通知されます</p>
              </div>
            )}
            {(form.eventType === 'reservation_created' || form.eventType === 'visit_order_created' || form.eventType === 'message_received') && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  対象店舗
                  {form.eventType === 'message_received' && <span className="font-normal text-gray-400">（ユーザーの関連店舗）</span>}
                </label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={form.storeKey}
                  onChange={(e) => setForm({ ...form, storeKey: e.target.value })}
                >
                  <option value="">すべての店舗（店舗未指定）</option>
                  {STORE_KEY_LIST.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {form.eventType === 'message_received'
                    ? '選択した店舗に関連するユーザーからのメッセージのみ通知されます'
                    : '選択した店舗のイベントのみ通知されます'}
                </p>
              </div>
            )}
            {form.eventType === 'tag_added' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">対象タグ</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={form.tagName}
                  onChange={(e) => setForm({ ...form, tagName: e.target.value })}
                >
                  <option value="">すべてのタグ（タグ未指定）</option>
                  {allTags.map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">選択したタグが付与されたときのみ通知されます</p>
              </div>
            )}
            {form.eventType === 'message_received' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">対象タグ（複数選択可）</label>
                {allTags.length === 0 ? (
                  <p className="text-xs text-gray-400">タグがありません</p>
                ) : (
                  <div className="border border-gray-200 rounded-lg p-2 max-h-44 overflow-y-auto space-y-1">
                    {allTags.map(t => {
                      const selected = form.tagName.split(',').map(s => s.trim()).filter(Boolean)
                      const checked = selected.includes(t.name)
                      return (
                        <label key={t.id} className="flex items-center gap-2 px-1 py-0.5 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? selected.filter(s => s !== t.name)
                                : [...selected, t.name]
                              setForm({ ...form, tagName: next.join(',') })
                            }}
                            className="accent-green-500 w-3.5 h-3.5"
                          />
                          <span className="text-sm text-gray-700">{t.name}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {form.tagName
                    ? 'いずれかのタグが付いているユーザーからのメッセージのみ通知されます'
                    : '未選択の場合はすべてのユーザーのメッセージが通知されます'}
                </p>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">通知チャンネル</label>
              <div className="flex gap-4 mt-1">
                {[
                  { value: 'chatwork', label: 'チャットワーク' },
                  { value: 'line', label: 'LINE' },
                ].map(({ value, label }) => {
                  const selected = form.channels.split(',').map(c => c.trim()).filter(Boolean)
                  const checked = selected.includes(value)
                  return (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? selected.filter(c => c !== value)
                            : [...selected, value]
                          setForm({ ...form, channels: next.join(',') })
                        }}
                        className="accent-green-500 w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            {(() => {
              const selected = form.channels.split(',').map(c => c.trim()).filter(Boolean)
              return (
                <>
                  {selected.includes('chatwork') && (
                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Chatwork 設定</p>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">APIトークン</label>
                        <input
                          type="password"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="Chatwork の APIトークン"
                          value={form.chatworkApiToken}
                          onChange={(e) => setForm({ ...form, chatworkApiToken: e.target.value })}
                        />
                        <p className="text-xs text-gray-400 mt-1">空欄の場合は環境変数のデフォルトトークンを使用します</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">ルームID</label>
                        <input
                          type="text"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="例: 123456789"
                          value={form.chatworkRoomId}
                          onChange={(e) => setForm({ ...form, chatworkRoomId: e.target.value })}
                        />
                        <p className="text-xs text-gray-400 mt-1">空欄の場合は環境変数のデフォルトルームに送信されます</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">TO（アカウントID）</label>
                        <input
                          type="text"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="例: 12345678,87654321（カンマ区切りで複数指定可）"
                          value={form.chatworkToId}
                          onChange={(e) => setForm({ ...form, chatworkToId: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                  {selected.includes('line') && (
                    <div className="space-y-4 p-4 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">LINE 設定</p>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">通知先グループID / ユーザーID <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="例: Cxxxxxxxxxx（グループ）/ Uxxxxxxxxxx（ユーザー）"
                          value={form.lineGroupId}
                          onChange={(e) => setForm({ ...form, lineGroupId: e.target.value })}
                        />
                        <p className="text-xs text-gray-400 mt-1">通知を送信するLINEグループまたはユーザーのIDを入力してください</p>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: '#06C755' }}
              >
                {saving ? (editingId ? '更新中...' : '作成中...') : (editingId ? '更新' : '作成')}
              </button>
              <button
                onClick={closeForm}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules section */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">通知ルール</h2>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-48" />
              </div>
            ))}
          </div>
        ) : rules.length === 0 && !showForm ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">通知ルールがありません。「新規ルール」から作成してください。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(() => {
              // フォルダ名 > イベント種別でグループ化（出現順を維持）
              const grouped = rules.reduce<Record<string, { key: string; label: string; sub?: string; rules: NotificationRule[] }>>((acc, rule) => {
                const folder = String(rule.conditions?.folder ?? '').trim()
                let groupKey: string
                let label: string
                let sub: string | undefined
                if (!folder) {
                  // フォルダなし → イベント種別でグループ化
                  groupKey = `__type__${rule.eventType}`
                  label = EVENT_TYPE_LABELS[rule.eventType] ?? rule.eventType
                  sub = rule.eventType
                } else if (folder in EVENT_TYPE_LABELS) {
                  // フォルダがイベント種別キー → そのイベント種別グループに統合
                  groupKey = `__type__${folder}`
                  label = EVENT_TYPE_LABELS[folder]
                  sub = folder
                } else {
                  // カスタムフォルダ
                  groupKey = `__folder__${folder}`
                  label = folder
                }
                if (!acc[groupKey]) acc[groupKey] = { key: groupKey, label, sub, rules: [] }
                acc[groupKey].rules.push(rule)
                return acc
              }, {})
              const toggleGroup = (key: string) => {
                setCollapsedGroups(prev => {
                  const next = new Set(prev)
                  if (next.has(key)) next.delete(key)
                  else next.add(key)
                  return next
                })
              }
              return Object.values(grouped).map(({ key: groupKey, label, sub, rules: groupRules }) => {
                const isCollapsed = collapsedGroups.has(groupKey)
                const activeCount = groupRules.filter(r => r.isActive).length
                return (
                  <div key={groupKey} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {/* グループヘッダー */}
                    <button
                      onClick={() => toggleGroup(groupKey)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`transition-transform duration-200 text-gray-400 text-xs ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                        <span className="text-sm font-semibold text-gray-800">{label}</span>
                        {sub && <span className="text-xs text-gray-400">{sub}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{activeCount}/{groupRules.length} 有効</span>
                      </div>
                    </button>

                    {/* グループ内ルール一覧 */}
                    {!isCollapsed && (
                      <div className="border-t border-gray-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
                          {groupRules.map((rule: NotificationRule) => (
                            <div
                              key={rule.id}
                              className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex flex-col gap-2"
                            >
                              {/* Header */}
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-gray-900 leading-snug">{rule.name}</p>
                                <button
                                  onClick={() => handleToggleActive(rule.id, rule.isActive)}
                                  className={`relative flex-shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                    rule.isActive ? 'bg-green-500' : 'bg-gray-300'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                                      rule.isActive ? 'translate-x-4' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>

                              {/* Channels */}
                              <div className="flex flex-wrap gap-1">
                                {rule.channels.map((ch) => (
                                  <span
                                    key={ch}
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
                                  >
                                    {ch}
                                  </span>
                                ))}
                              </div>

                              {/* 条件サマリー */}
                              <div className="space-y-0.5">
                                {Boolean(rule.conditions?.store) && (
                                  <p className="text-xs text-gray-500">店舗: <span className="font-medium text-gray-700">{String(rule.conditions.store)}</span></p>
                                )}
                                {Boolean(rule.conditions?.storeKey) && (
                                  <p className="text-xs text-gray-500">店舗: <span className="font-medium text-gray-700">
                                    {STORE_KEY_LIST.find(s => s.key === rule.conditions.storeKey)?.label ?? String(rule.conditions.storeKey)}
                                  </span></p>
                                )}
                                {Boolean(rule.conditions?.tagName) && (
                                  <p className="text-xs text-gray-500">タグ: <span className="font-medium text-gray-700">{String(rule.conditions.tagName)}</span></p>
                                )}
                                {Boolean(rule.conditions?.chatworkRoomId) && (
                                  <p className="text-xs text-gray-500">Room: <span className="font-mono text-gray-700">{String(rule.conditions.chatworkRoomId)}</span></p>
                                )}
                              </div>

                              {/* Footer */}
                              <div className="flex gap-2 mt-auto pt-2 border-t border-gray-200">
                                <button
                                  onClick={() => openEdit(rule)}
                                  className="flex-1 py-1 text-xs font-medium text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                                >
                                  編集
                                </button>
                                <button
                                  onClick={() => handleDelete(rule.id)}
                                  className="flex-1 py-1 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                                >
                                  削除
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>

      {/* Notification log section */}
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">通知履歴</h2>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
          >
            {statusFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-48" />
                  <div className="h-2 bg-gray-100 rounded w-32" />
                </div>
                <div className="h-5 bg-gray-100 rounded-full w-16" />
                <div className="h-3 bg-gray-100 rounded w-24" />
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">通知履歴がありません。</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    タイトル
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    イベントタイプ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    チャンネル
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    ステータス
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    日時
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {notifications.map((notification) => {
                  const statusInfo = statusConfig[notification.status]
                  return (
                    <tr key={notification.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {notification.eventType}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {notification.channel}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDatetime(notification.createdAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
