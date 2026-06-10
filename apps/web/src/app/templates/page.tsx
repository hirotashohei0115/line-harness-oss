'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'
import CcPromptButton from '@/components/cc-prompt-button'
import FlexPreviewComponent from '@/components/flex-preview'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Template {
  id: string
  name: string
  category: string
  messageType: string
  messageContent: string
  createdAt: string
  updatedAt: string
}

const messageTypeLabels: Record<string, string> = {
  text: 'テキスト',
  image: '画像',
  flex: 'Flex',
  store_card: '店舗案内カード（Flex）',
  custom_flex: 'カスタムFlex',
}

function SortableTemplateRow({
  template,
  onEdit,
  onDuplicate,
  onDelete,
  formatDate,
}: {
  template: Template
  onEdit: (t: Template) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  formatDate: (s: string) => string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: template.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-gray-50 transition-colors">
      <td className="pl-3 pr-1 py-3 w-8">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 text-base leading-none select-none"
          title="ドラッグして並べ替え"
        >⠿</button>
      </td>
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{template.name}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
            {template.messageContent.slice(0, 50)}{template.messageContent.length > 50 ? '...' : ''}
          </p>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          {template.category}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {messageTypeLabels[template.messageType] || template.messageType}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(template.createdAt)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button onClick={() => onEdit(template)} className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors">編集</button>
          <button onClick={() => onDuplicate(template.id)} className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">複製</button>
          <button onClick={() => onDelete(template.id)} className="px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors">削除</button>
        </div>
      </td>
    </tr>
  )
}

interface CreateFormState {
  name: string
  category: string
  messageType: string
  messageContent: string
}

interface StoreCardFields {
  headerImageUrl: string
  storeName: string
  address: string
  phone: string
  hours: string
  buttonText: string
  buttonUrl: string
}

const defaultStoreCard: StoreCardFields = {
  headerImageUrl: '',
  storeName: '',
  address: '',
  phone: '',
  hours: '',
  buttonText: '',
  buttonUrl: '',
}

function buildStoreCardJson(f: StoreCardFields): string {
  const infoRows = [
    f.address ? { label: '住所', value: f.address } : null,
    f.phone   ? { label: '電話', value: f.phone }   : null,
    f.hours   ? { label: '営業', value: f.hours }   : null,
  ].filter(Boolean) as { label: string; value: string }[]

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: f.storeName || '店舗名', weight: 'bold', size: 'xl', wrap: true },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: infoRows.map(row => ({
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: row.label, color: '#aaaaaa', size: 'sm', flex: 1 },
              { type: 'text', text: row.value, wrap: true, color: '#666666', size: 'sm', flex: 5 },
            ],
          })),
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: '#06C755',
          action: {
            type: 'uri',
            label: f.buttonText || 'ボタン',
            uri: f.buttonUrl || 'https://example.com',
          },
        },
      ],
    },
  }

  if (f.headerImageUrl) {
    bubble.hero = {
      type: 'image',
      url: f.headerImageUrl,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    }
  }

  return JSON.stringify(bubble, null, 2)
}

// ===== Custom Flex Visual Editor =====

interface FlexPart {
  id: string
  type: 'text' | 'image' | 'button' | 'separator' | 'spacer'
  text?: string
  size?: string
  color?: string
  bold?: boolean
  align?: string
  url?: string
  aspectRatio?: string
  aspectMode?: string
  label?: string
  style?: string
}

interface FlexEditorSettings { bgColor: string }

const FLEX_PART_LABELS: Record<string, string> = {
  text: 'テキスト', image: '画像', button: 'ボタン', separator: '区切り線', spacer: '余白',
}

function buildCustomFlexJson(parts: FlexPart[], settings: FlexEditorSettings): string {
  const spacerH: Record<string, string> = { sm: '10px', md: '20px', lg: '30px', xl: '40px' }
  const contents = parts.map(p => {
    if (p.type === 'text') return { type: 'text', text: p.text || 'テキスト', size: p.size || 'md', color: p.color || '#333333', weight: p.bold ? 'bold' : 'regular', align: p.align || 'start', wrap: true }
    if (p.type === 'image') {
      const isOriginal = p.aspectRatio === 'original'
      return { type: 'image', url: p.url || 'https://via.placeholder.com/400x200', size: p.size || 'full', aspectRatio: isOriginal ? '20:13' : (p.aspectRatio || '20:13'), aspectMode: isOriginal ? 'fit' : (p.aspectMode || 'cover') }
    }
    if (p.type === 'button') return { type: 'button', action: { type: 'uri', label: p.label || 'ボタン', uri: p.url || 'https://example.com' }, style: p.style || 'primary', ...(!p.style || p.style === 'primary' ? { color: p.color || '#06C755' } : {}) }
    if (p.type === 'separator') return { type: 'separator' }
    return { type: 'box', layout: 'vertical', height: spacerH[p.size || 'md'] || '20px', contents: [] }
  }).filter(Boolean)
  const bubble: Record<string, unknown> = { type: 'bubble', body: { type: 'box', layout: 'vertical', contents } }
  if (settings.bgColor && settings.bgColor.toUpperCase() !== '#FFFFFF') {
    bubble.styles = { body: { backgroundColor: settings.bgColor } }
  }
  return JSON.stringify(bubble, null, 2)
}

function ImagePartSettings({
  part, onUpdate, inp, sel,
}: { part: FlexPart; onUpdate: (u: Partial<FlexPart>) => void; inp: string; sel: string }) {
  const [tab, setTab] = useState<'url' | 'upload'>('url')
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setUploadError('画像ファイルを選択してください'); return }
    setUploadError('')
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target?.result as string
      setPreview(base64)
      setUploading(true)
      try {
        const res = await fetchApi<{ success: boolean; url?: string; error?: string }>(
          '/api/images/upload',
          { method: 'POST', body: JSON.stringify({ image: base64 }) }
        )
        if (res.success && res.url) {
          onUpdate({ url: res.url })
        } else {
          setUploadError(res.error ?? 'アップロードに失敗しました')
        }
      } catch {
        setUploadError('アップロードに失敗しました')
      } finally {
        setUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-1.5">
      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded p-0.5 gap-0.5 w-fit text-xs">
        {(['url', 'upload'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-2.5 py-1 rounded transition-colors font-medium ${
              tab === t ? 'bg-white shadow-sm text-gray-800 border border-gray-200' : 'text-gray-500 hover:text-gray-700'
            }`}
          >{t === 'url' ? 'URLを入力' : 'ファイル'}</button>
        ))}
      </div>

      {tab === 'url' ? (
        <input type="text" value={part.url || ''} onChange={e => onUpdate({ url: e.target.value })}
          placeholder="画像URL" className={inp} />
      ) : (
        <div className="space-y-1.5">
          <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-md px-3 py-3 cursor-pointer hover:bg-gray-50 text-xs text-gray-500 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          >
            <input type="file" accept="image/jpeg,image/png,image/gif" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            {uploading ? '📤 アップロード中...' : '📎 クリックまたはドラッグ＆ドロップ'}
          </label>
          {uploadError && <p className="text-[10px] text-red-500">{uploadError}</p>}
          {preview && (
            <div className="relative w-full">
              <img src={preview} alt="" className="w-full max-h-24 object-contain rounded border border-gray-200" />
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded text-xs text-gray-600">
                  アップロード中...
                </div>
              )}
              {!uploading && part.url && part.url.startsWith('http') && (
                <div className="mt-0.5 text-[10px] text-green-600 truncate">✓ {part.url}</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        <select value={part.size || 'full'} onChange={e => onUpdate({ size: e.target.value })} className={sel}>
          {['full','lg','md','sm'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={part.aspectRatio || '20:13'} onChange={e => {
          const v = e.target.value
          onUpdate({ aspectRatio: v, ...(v === 'original' ? { aspectMode: 'fit' } : {}) })
        }} className={sel}>
          <option value="20:13">20:13（横長）</option>
          <option value="1:1">1:1（正方形）</option>
          <option value="4:3">4:3</option>
          <option value="3:4">3:4（縦長）</option>
          <option value="2:3">2:3（縦長）</option>
          <option value="9:16">9:16（縦長）</option>
          <option value="original">オリジナル（fit）</option>
        </select>
        {part.aspectRatio !== 'original' && (
          <select value={part.aspectMode || 'cover'} onChange={e => onUpdate({ aspectMode: e.target.value })} className={sel}>
            <option value="cover">cover（トリミング）</option>
            <option value="fit">fit（全体表示）</option>
          </select>
        )}
      </div>
    </div>
  )
}

function PartSettings({ part, onUpdate }: { part: FlexPart; onUpdate: (u: Partial<FlexPart>) => void }) {
  const inp = 'w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500'
  const sel = 'text-xs border border-gray-200 rounded px-1 py-0.5'

  if (part.type === 'text') return (
    <div className="space-y-1.5">
      <textarea rows={2} value={part.text || ''} onChange={e => onUpdate({ text: e.target.value })}
        placeholder="テキストを入力" className={`${inp} resize-none`} />
      <div className="flex flex-wrap gap-1.5 items-center">
        <select value={part.size || 'md'} onChange={e => onUpdate({ size: e.target.value })} className={sel}>
          {['sm','md','lg','xl','xxl'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={part.align || 'start'} onChange={e => onUpdate({ align: e.target.value })} className={sel}>
          <option value="start">左</option><option value="center">中央</option><option value="end">右</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!part.bold} onChange={e => onUpdate({ bold: e.target.checked })} className="rounded" />太字
        </label>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">色</span>
          <input type="color" value={part.color || '#333333'} onChange={e => onUpdate({ color: e.target.value })}
            className="w-6 h-6 p-0 border rounded cursor-pointer" />
        </div>
      </div>
    </div>
  )
  if (part.type === 'image') return <ImagePartSettings part={part} onUpdate={onUpdate} inp={inp} sel={sel} />
  if (part.type === 'button') {
    const urlValid = !part.url || /^(https?:\/\/|tel:|mailto:)/.test(part.url)
    return (
    <div className="space-y-1.5">
      <input type="text" value={part.label || ''} onChange={e => onUpdate({ label: e.target.value })} placeholder="ラベル" className={inp} />
      <input type="text" value={part.url || ''} onChange={e => onUpdate({ url: e.target.value })} placeholder="https://..." className={`${inp} ${!urlValid ? 'border-orange-400' : ''}`} />
      {!urlValid && <p className="text-[10px] text-orange-500">⚠ URLは https:// / http:// / tel: で始める必要があります（LINE APIが拒否します）</p>}
      <div className="flex gap-1.5 items-center">
        <select value={part.style || 'primary'} onChange={e => onUpdate({ style: e.target.value })} className={sel}>
          <option value="primary">primary</option>
          <option value="secondary">secondary</option>
          <option value="link">link</option>
        </select>
        {(!part.style || part.style === 'primary') && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">色</span>
            <input type="color" value={part.color || '#06C755'} onChange={e => onUpdate({ color: e.target.value })}
              className="w-6 h-6 p-0 border rounded cursor-pointer" />
          </div>
        )}
      </div>
    </div>
  )
  }
  if (part.type === 'separator') return <div className="border-t border-gray-300 mx-1" />
  return (
    <select value={part.size || 'md'} onChange={e => onUpdate({ size: e.target.value })} className={sel}>
      {['sm','md','lg','xl'].map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  )
}

function FlexVisualEditor({ parts, setParts, settings, setSettings }: {
  parts: FlexPart[]
  setParts: React.Dispatch<React.SetStateAction<FlexPart[]>>
  settings: FlexEditorSettings
  setSettings: React.Dispatch<React.SetStateAction<FlexEditorSettings>>
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const addPart = (type: FlexPart['type']) => {
    const defaults: Record<string, Partial<FlexPart>> = {
      text: { text: '', size: 'md', color: '#333333', bold: false, align: 'start' },
      image: { url: '', size: 'full', aspectRatio: '20:13', aspectMode: 'cover' },
      button: { label: '', url: '', style: 'primary', color: '#06C755' },
      separator: {}, spacer: { size: 'md' },
    }
    setParts(prev => [...prev, { id: crypto.randomUUID(), type, ...defaults[type] } as FlexPart])
  }

  const removePart = (id: string) => setParts(prev => prev.filter(p => p.id !== id))
  const updatePart = (id: string, updates: Partial<FlexPart>) =>
    setParts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return }
    setParts(prev => {
      const next = [...prev]
      const [item] = next.splice(dragIndex, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
    setDragIndex(null)
  }

  return (
    <div className="flex gap-3">
      {/* Left: Add buttons + global settings */}
      <div className="w-28 flex-shrink-0 space-y-1.5">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">パーツ追加</p>
        {(['text','image','button','separator','spacer'] as FlexPart['type'][]).map(type => (
          <button key={type} type="button" onClick={() => addPart(type)}
            className="w-full py-1.5 text-[11px] border border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 hover:text-green-700 transition-colors text-gray-600">
            ＋ {FLEX_PART_LABELS[type]}
          </button>
        ))}
        <div className="pt-3 mt-1 border-t border-gray-200 space-y-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">全体設定</p>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">背景色</label>
            <div className="flex items-center gap-1.5">
              <input type="color" value={settings.bgColor}
                onChange={e => setSettings(p => ({ ...p, bgColor: e.target.value }))}
                className="w-8 h-6 p-0 border rounded cursor-pointer" />
              <span className="text-[10px] text-gray-400 font-mono">{settings.bgColor}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Canvas */}
      <div className="flex-1 border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
        <div className="px-3 py-1.5 border-b border-gray-200 bg-white flex items-center justify-between">
          <p className="text-[10px] font-semibold text-gray-500 uppercase">キャンバス</p>
          {parts.length > 0 && (
            <span className="text-[10px] text-gray-400">{parts.length} パーツ</span>
          )}
        </div>
        <div className="p-2 space-y-1.5 min-h-[240px]">
          {parts.length === 0 && (
            <div className="flex items-center justify-center h-52">
              <p className="text-xs text-gray-400 text-center">左のボタンでパーツを追加</p>
            </div>
          )}
          {parts.map((part, index) => (
            <div key={part.id} draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, index)}
              className={`bg-white border rounded-lg p-2 transition-all ${dragIndex === index ? 'opacity-40 border-green-300' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-gray-400 cursor-grab text-sm select-none" title="ドラッグで並び替え">⠿</span>
                <span className="text-[10px] font-semibold text-gray-500 flex-1">{FLEX_PART_LABELS[part.type]}</span>
                <button type="button" onClick={() => removePart(part.id)}
                  className="text-gray-300 hover:text-red-400 text-sm leading-none transition-colors">×</button>
              </div>
              <PartSettings part={part} onUpdate={updates => updatePart(part.id, updates)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LinePreviewPanel({ messageType, content }: { messageType: string; content: string }) {
  const hasContent = content.trim().length > 0

  let messageEl: React.ReactNode = null
  if (!hasContent) {
    messageEl = <p className="text-xs text-center text-white/60 mt-8 px-2">メッセージを入力すると<br />プレビューが表示されます</p>
  } else if (messageType === 'text') {
    messageEl = (
      <div className="flex justify-end">
        <div className="max-w-[75%] px-3 py-2 text-sm text-white whitespace-pre-wrap break-words"
             style={{ backgroundColor: '#06C755', borderRadius: '18px 4px 18px 18px' }}>
          {content}
        </div>
      </div>
    )
  } else if (messageType === 'flex') {
    let valid = true
    try { JSON.parse(content) } catch { valid = false }
    messageEl = valid
      ? <div className="flex justify-end"><FlexPreviewComponent content={content} maxWidth={240} /></div>
      : <p className="text-xs text-center text-red-300 mt-4 px-2">プレビューできません（JSONエラー）</p>
  } else if (messageType === 'image') {
    if (content.startsWith('data:image/') || content.startsWith('http')) {
      messageEl = (
        <div className="flex justify-end">
          <img src={content} alt="プレビュー" className="max-w-[75%] rounded-xl" />
        </div>
      )
    }
  }

  return (
    <div className="sticky top-4 flex-shrink-0" style={{ width: '280px' }}>
      <p className="text-xs font-medium text-gray-500 mb-2 text-center">プレビュー</p>
      <div className="rounded-2xl overflow-hidden shadow-lg border-4 border-gray-800">
        {/* Smartphone status bar */}
        <div className="bg-gray-800 px-4 py-1.5 flex items-center justify-between">
          <span className="text-white text-[10px]">9:41</span>
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full bg-white" />
            <div className="w-1 h-1 rounded-full bg-white" />
            <div className="w-1 h-1 rounded-full bg-white" />
          </div>
        </div>
        {/* LINE chat header */}
        <div className="bg-gray-100 px-3 py-2 border-b border-gray-200 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
               style={{ backgroundColor: '#06C755' }}>H</div>
          <span className="text-xs font-semibold text-gray-800 flex-1">LINE Harness</span>
        </div>
        {/* Chat body */}
        <div className="p-3 space-y-2 min-h-[280px]" style={{ backgroundColor: '#B2C8BA' }}>
          {messageEl}
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CategorySelect({
  value,
  onChange,
  existingCategories,
  selectClassName,
}: {
  value: string
  onChange: (v: string) => void
  existingCategories: string[]
  selectClassName: string
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const allOptions = Array.from(
    new Set([...existingCategories, ...(value && value !== '' && value !== '__new__' ? [value] : [])])
  )

  const confirm = () => {
    const trimmed = newName.trim()
    if (trimmed) onChange(trimmed)
    setCreating(false)
    setNewName('')
  }

  if (creating) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          autoFocus
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); confirm() }
            if (e.key === 'Escape') { setCreating(false); setNewName('') }
          }}
          placeholder="新しいカテゴリー名を入力"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button type="button" onClick={confirm}
          className="px-3 py-2 text-xs font-medium text-white rounded-lg whitespace-nowrap"
          style={{ backgroundColor: '#06C755' }}>確定</button>
        <button type="button" onClick={() => { setCreating(false); setNewName('') }}
          className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">×</button>
      </div>
    )
  }

  return (
    <select
      className={selectClassName}
      value={value}
      onChange={e => {
        if (e.target.value === '__new__') { setCreating(true) }
        else { onChange(e.target.value) }
      }}
    >
      <option value="">選択してください</option>
      {allOptions.map(cat => (
        <option key={cat} value={cat}>{cat}</option>
      ))}
      <option value="__new__">＋ 新しいカテゴリーを作成</option>
    </select>
  )
}

const ccPrompts = [
  {
    title: 'テンプレート作成',
    prompt: `新しいメッセージテンプレートの作成をサポートしてください。
1. 用途別（挨拶、キャンペーン、通知、フォローアップ）のテンプレート文例を提案
2. テキスト・画像・Flexメッセージそれぞれの効果的な使い方
3. カテゴリ分類と命名規則のベストプラクティス
手順を示してください。`,
  },
  {
    title: 'テンプレート整理',
    prompt: `既存のテンプレートを整理・最適化してください。
1. カテゴリ別のテンプレート数と使用頻度を分析
2. 重複・類似テンプレートの統合提案
3. 不足しているカテゴリやテンプレートの追加推奨
結果をレポートしてください。`,
  },
]

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = templates.findIndex(t => t.id === active.id)
    const newIndex = templates.findIndex(t => t.id === over.id)
    const reordered = arrayMove(templates, oldIndex, newIndex)
    setTemplates(reordered)
    try {
      await api.templates.reorder(reordered.map((t, i) => ({ id: t.id, sort_order: i + 1 })))
    } catch {
      setError('並び順の保存に失敗しました')
    }
  }
  const [showCreate, setShowCreate] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [form, setForm] = useState<CreateFormState>({
    name: '',
    category: '',
    messageType: 'text',
    messageContent: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [storeCard, setStoreCard] = useState<StoreCardFields>(defaultStoreCard)
  const [customFlexParts, setCustomFlexParts] = useState<FlexPart[]>([])
  const [customFlexSettings, setCustomFlexSettings] = useState<FlexEditorSettings>({ bgColor: '#ffffff' })
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [editName, setEditName] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [allCategories, setAllCategories] = useState<string[]>([])

  // Sync store card fields → form.messageContent (real-time JSON generation)
  useEffect(() => {
    if (form.messageType !== 'store_card') return
    setForm(prev => ({ ...prev, messageContent: buildStoreCardJson(storeCard) }))
  }, [storeCard, form.messageType])

  // Sync custom flex parts/settings → form.messageContent
  useEffect(() => {
    if (form.messageType !== 'custom_flex') return
    setForm(prev => ({ ...prev, messageContent: buildCustomFlexJson(customFlexParts, customFlexSettings) }))
  }, [customFlexParts, customFlexSettings, form.messageType])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.templates.list(
        selectedCategory !== 'all' ? selectedCategory : undefined
      )
      if (res.success) {
        setTemplates(res.data)
        const newCats = res.data.map(t => t.category).filter(Boolean) as string[]
        setAllCategories(prev => Array.from(new Set([...prev, ...newCats])))
      } else {
        setError(res.error)
      }
    } catch {
      setError('テンプレートの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [selectedCategory])

  useEffect(() => {
    load()
  }, [load])

  const categories = Array.from(
    new Set(templates.map((t) => t.category).filter(Boolean))
  )

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImagePreview(dataUrl)
      setForm(prev => ({ ...prev, messageContent: dataUrl }))
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleStoreCardImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setStoreCard(prev => ({ ...prev, headerImageUrl: reader.result as string }))
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setFormError('テンプレート名を入力してください')
      return
    }
    if (!form.category.trim()) {
      setFormError('カテゴリを入力してください')
      return
    }
    if (form.messageType === 'store_card') {
      if (!storeCard.storeName.trim()) { setFormError('店舗名を入力してください'); return }
    } else if (form.messageType === 'custom_flex') {
      if (customFlexParts.length === 0) { setFormError('パーツを1つ以上追加してください'); return }
    } else if (!form.messageContent.trim()) {
      setFormError(form.messageType === 'image' ? '画像を選択してください' : 'メッセージ内容を入力してください')
      return
    }
    if (form.messageType === 'flex') {
      try { JSON.parse(form.messageContent) } catch {
        setFormError('有効なJSON形式で入力してください')
        return
      }
    }
    setSaving(true)
    setFormError('')
    const saveType = (form.messageType === 'store_card' || form.messageType === 'custom_flex') ? 'flex' : form.messageType
    const saveContent = form.messageType === 'store_card'
      ? buildStoreCardJson(storeCard)
      : form.messageType === 'custom_flex'
        ? buildCustomFlexJson(customFlexParts, customFlexSettings)
        : form.messageContent
    try {
      const res = await api.templates.create({
        name: form.name,
        category: form.category,
        messageType: saveType,
        messageContent: saveContent,
      })
      if (res.success) {
        setShowCreate(false)
        setForm({ name: '', category: '', messageType: 'text', messageContent: '' })
        setImagePreview(null)
        setStoreCard(defaultStoreCard)
        setCustomFlexParts([])
        setCustomFlexSettings({ bgColor: '#ffffff' })
        load()
      } else {
        setFormError(res.error)
      }
    } catch {
      setFormError('作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このテンプレートを削除してもよいですか？')) return
    try {
      await api.templates.delete(id)
      load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      await api.templates.duplicate(id)
      load()
    } catch {
      setError('複製に失敗しました')
    }
  }

  const handleEditOpen = (template: Template) => {
    setEditingTemplate(template)
    setEditName(template.name)
    setEditContent(template.messageContent)
    setEditCategory(template.category || '')
    setEditError('')
  }

  const handleEditSave = async () => {
    if (!editingTemplate) return
    if (!editName.trim()) { setEditError('テンプレート名を入力してください'); return }
    if (!editContent.trim()) { setEditError('メッセージ内容を入力してください'); return }
    setEditSaving(true)
    setEditError('')
    try {
      await api.templates.patch(editingTemplate.id, { name: editName.trim(), messageContent: editContent.trim(), category: editCategory })
      setEditingTemplate(null)
      load()
    } catch {
      setEditError('保存に失敗しました')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div>
      <Header
        title="テンプレート管理"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + 新規テンプレート
          </button>
        }
      />

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Category filter */}
      {!loading && categories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 min-h-[44px] text-xs font-medium rounded-full transition-colors ${
              selectedCategory === 'all'
                ? 'text-white'
                : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
            }`}
            style={selectedCategory === 'all' ? { backgroundColor: '#06C755' } : undefined}
          >
            全て
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 min-h-[44px] text-xs font-medium rounded-full transition-colors ${
                selectedCategory === cat
                  ? 'text-white'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={selectedCategory === cat ? { backgroundColor: '#06C755' } : undefined}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingTemplate(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-gray-800 mb-4">テンプレートを編集</h2>
            <div className="flex gap-8 items-start">
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">テンプレート名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">カテゴリ</label>
                <CategorySelect
                  value={editCategory}
                  onChange={setEditCategory}
                  existingCategories={allCategories}
                  selectClassName="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">メッセージ内容 <span className="text-red-500">*</span></label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  rows={6}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                />
              </div>
              {editError && <p className="text-xs text-red-600">{editError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleEditSave}
                  disabled={editSaving}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: '#06C755' }}
                >
                  {editSaving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => setEditingTemplate(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  キャンセル
                </button>
              </div>
            </div>
            <LinePreviewPanel messageType={editingTemplate.messageType} content={editContent} />
            </div>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新規テンプレートを作成</h2>
          <div className="flex gap-8 items-start">
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">テンプレート名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: ウェルカムメッセージ"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">カテゴリ <span className="text-red-500">*</span></label>
              <CategorySelect
                value={form.category}
                onChange={v => setForm(p => ({ ...p, category: v }))}
                existingCategories={allCategories}
                selectClassName="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">メッセージタイプ</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={form.messageType}
                onChange={(e) => {
                  setForm({ ...form, messageType: e.target.value, messageContent: '' })
                  setImagePreview(null)
                  setStoreCard(defaultStoreCard)
                  setCustomFlexParts([])
                  setCustomFlexSettings({ bgColor: '#ffffff' })
                }}
              >
                <option value="text">テキスト</option>
                <option value="image">画像</option>
                <option value="flex">Flex（JSON直接入力）</option>
                <option value="store_card">店舗案内カード（Flex）</option>
                <option value="custom_flex">カスタムFlex（ビジュアルエディタ）</option>
              </select>
            </div>

            {/* メッセージ内容（タイプ別） */}
            {form.messageType === 'text' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">メッセージ内容 <span className="text-red-500">*</span></label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  rows={4}
                  placeholder="メッセージ内容を入力してください"
                  value={form.messageContent}
                  onChange={(e) => setForm({ ...form, messageContent: e.target.value })}
                />
              </div>
            )}

            {form.messageType === 'flex' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Flex JSON <span className="text-red-500">*</span>
                  <span className="ml-1 text-gray-400 font-normal">（bubbleまたはcarouselのJSONを入力）</span>
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none font-mono"
                  rows={8}
                  placeholder={'{\n  "type": "bubble",\n  "body": { ... },\n  "footer": { ... }\n}'}
                  value={form.messageContent}
                  onChange={(e) => setForm({ ...form, messageContent: e.target.value })}
                />
                {form.messageContent && (() => {
                  try { JSON.parse(form.messageContent); return <p className="text-xs text-green-600 mt-1">✓ 有効なJSON</p> }
                  catch { return <p className="text-xs text-red-500 mt-1">⚠ JSONが無効です</p> }
                })()}
              </div>
            )}

            {form.messageType === 'store_card' && (
              <div className="space-y-3 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-xs font-semibold text-blue-700">店舗案内カード設定</p>

                {/* ① ヘッダー画像 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ヘッダー画像URL</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="https://example.com/image.jpg"
                    value={storeCard.headerImageUrl}
                    onChange={e => setStoreCard(prev => ({ ...prev, headerImageUrl: e.target.value }))}
                  />
                  <div className="mt-1">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 bg-white">
                      📎 画像をアップロード（Base64）
                      <input type="file" accept="image/jpeg,image/png,image/gif" className="hidden" onChange={handleStoreCardImageSelect} />
                    </label>
                    {storeCard.headerImageUrl && (
                      <img src={storeCard.headerImageUrl} alt="header" className="mt-1 max-h-20 rounded border border-gray-200" />
                    )}
                  </div>
                </div>

                {/* ② 店舗名 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">店舗名 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="リペアマスター五反田店"
                    value={storeCard.storeName}
                    onChange={e => setStoreCard(prev => ({ ...prev, storeName: e.target.value }))}
                  />
                </div>

                {/* ③ 住所 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">住所</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="〒141-0022 東京都品川区東五反田1-1-1"
                    value={storeCard.address}
                    onChange={e => setStoreCard(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>

                {/* ④ 電話番号 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">電話番号</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="03-1234-5678"
                    value={storeCard.phone}
                    onChange={e => setStoreCard(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>

                {/* ⑤ 営業時間 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">営業時間</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="10:00〜20:00"
                    value={storeCard.hours}
                    onChange={e => setStoreCard(prev => ({ ...prev, hours: e.target.value }))}
                  />
                </div>

                {/* ⑥ ボタンテキスト */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ボタンテキスト</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="来店予約をする"
                    value={storeCard.buttonText}
                    onChange={e => setStoreCard(prev => ({ ...prev, buttonText: e.target.value }))}
                  />
                </div>

                {/* ⑦ ボタンURL */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ボタンURL</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="https://liff.line.me/..."
                    value={storeCard.buttonUrl}
                    onChange={e => setStoreCard(prev => ({ ...prev, buttonUrl: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {form.messageType === 'custom_flex' && (
              <FlexVisualEditor
                parts={customFlexParts}
                setParts={setCustomFlexParts}
                settings={customFlexSettings}
                setSettings={setCustomFlexSettings}
              />
            )}

            {form.messageType === 'image' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">画像 <span className="text-red-500">*</span></label>
                {imagePreview ? (
                  <div className="relative inline-block mb-2">
                    <img src={imagePreview} alt="プレビュー" className="max-h-40 rounded-lg border border-gray-200" />
                    <button
                      type="button"
                      onClick={() => { setImagePreview(null); setForm(prev => ({ ...prev, messageContent: '' })) }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-gray-800"
                    >×</button>
                  </div>
                ) : null}
                <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  📎 画像を選択
                  <input type="file" accept="image/jpeg,image/png,image/gif" className="hidden" onChange={handleImageFileSelect} />
                </label>
                <p className="text-xs text-gray-400 mt-1">JPG / PNG / GIF（Base64として保存されます）</p>
              </div>
            )}

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: '#06C755' }}
              >
                {saving ? '作成中...' : '作成'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setFormError(''); setImagePreview(null); setCustomFlexParts([]); setCustomFlexSettings({ bgColor: '#ffffff' }) }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
          <LinePreviewPanel
            messageType={(form.messageType === 'store_card' || form.messageType === 'custom_flex') ? 'flex' : form.messageType}
            content={form.messageContent}
          />
          </div>
        </div>
      )}

      {/* Loading skeleton */}
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
      ) : templates.length === 0 && !showCreate ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">テンプレートがありません。「新規テンプレート」から作成してください。</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="pl-3 pr-1 py-3 w-8" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  テンプレート名
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  カテゴリ
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  メッセージタイプ
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  作成日時
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={templates.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <tbody className="divide-y divide-gray-100">
                  {templates.map((template) => (
                    <SortableTemplateRow
                      key={template.id}
                      template={template}
                      onEdit={handleEditOpen}
                      onDuplicate={handleDuplicate}
                      onDelete={handleDelete}
                      formatDate={formatDate}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
          </div>
        </div>
      )}
      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
