'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

interface LineAccount { id: string; channelId: string; name: string; isActive: boolean }

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number }
  action:
    | { type: 'message'; text: string }
    | { type: 'uri'; uri: string; label?: string }
    | { type: 'postback'; data: string; displayText?: string; label?: string }
}

interface RichMenuObject {
  richMenuId?: string
  size: { width: number; height: number }
  selected: boolean
  name: string
  chatBarText: string
  areas: RichMenuArea[]
}

interface TemplateItem { id: string; name: string; category: string; messageType: string }
interface TapStat { action_label: string; unique_users: number; total_taps: number; last_tapped: string | null }
interface UserStat { id: string; display_name: string | null; line_user_id: string; tap_count: number; last_tapped: string | null }

type AreaActionKind = 'message' | 'uri' | 'tpl' | 'custom_msg' | 'flow'

const LINE_W = 2500
const DISP_W = 600
const STROKE = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4']
const FILL   = ['#3b82f622', '#ef444422', '#22c55e22', '#f59e0b22', '#8b5cf622', '#06b6d422']

const FLOW_OPTIONS = [
  { id: 'product_select',   label: '修理フロー起点（機種選択）',     displayText: '修理の相談' },
  { id: 'visit_repair',     label: '出張修理フォーム（MacBook）',    displayText: '出張修理で依頼する' },
  { id: 'consult_category', label: 'Switch相談（よくある質問カテゴリ）', displayText: 'よくある質問' },
]

export default function RichMenusPage() {
  const [accounts, setAccounts]           = useState<LineAccount[]>([])
  const [channelId, setChannelId]         = useState('')
  const [richMenus, setRichMenus]         = useState<RichMenuObject[]>([])
  const [defaultId, setDefaultId]         = useState<string | null>(null)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState('')
  const [success, setSuccess]             = useState('')
  const [showCreate, setShowCreate]       = useState(false)

  // --- Create form state ---
  const [menuName, setMenuName]           = useState('新しいリッチメニュー')
  const [chatBarText, setChatBarText]     = useState('メニュー')
  const [menuHeight, setMenuHeight]       = useState<843 | 1686>(843)
  const [setAsDefault, setSetAsDefault]   = useState(true)
  const [areas, setAreas]                 = useState<RichMenuArea[]>([])
  const [selIdx, setSelIdx]               = useState<number | null>(null)
  const [uploadedImg, setUploadedImg]     = useState<string | null>(null)
  const [creating, setCreating]           = useState(false)
  const [templates, setTemplates]         = useState<TemplateItem[]>([])

  // per-area UI edit state
  const [areaKinds, setAreaKinds]         = useState<AreaActionKind[]>([])
  const [customMsgTexts, setCustomMsgs]   = useState<string[]>([])

  // Canvas + drawing
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const imgElRef   = useRef<HTMLImageElement | null>(null)
  const [imgReady, setImgReady]           = useState(false)
  const dragStart  = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft]                 = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Analytics
  const [tapStats, setTapStats]           = useState<TapStat[]>([])
  const [statsLoading, setStatsLoading]   = useState(false)
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')
  const [modalLabel, setModalLabel]       = useState<string | null>(null)
  const [userList, setUserList]           = useState<UserStat[]>([])
  const [userListLoading, setUserListLoading] = useState(false)

  // Re-upload for existing menu
  const reuploadRef = useRef<HTMLInputElement>(null)
  const [reupTarget, setReupTarget]       = useState<string | null>(null)
  const [reuploading, setReuploading]     = useState(false)

  // Edit mode
  const [editTarget, setEditTarget]       = useState<string | null>(null)

  // Binary blob ready for upload (avoids base64 JSON overhead)
  const [uploadBlob, setUploadBlob]       = useState<Blob | null>(null)

  const dispH = Math.round(DISP_W * menuHeight / LINE_W)

  // ── Load accounts ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchApi<{ success: boolean; data: LineAccount[] }>('/api/line-accounts')
      .then(r => { if (r.success) setAccounts(r.data.filter(a => a.isActive)) })
      .catch(() => {})
  }, [])

  // ── Load rich menus for selected account ───────────────────────────────────
  const loadMenus = useCallback(async (cid: string) => {
    setLoading(true); setError('')
    try {
      const [menusR, defR] = await Promise.allSettled([
        fetchApi<{ success: boolean; data: RichMenuObject[] }>(`/api/rich-menus?channelId=${encodeURIComponent(cid)}`),
        fetchApi<{ success: boolean; data: { richMenuId: string } | null }>(`/api/rich-menus/default?channelId=${encodeURIComponent(cid)}`),
      ])
      if (menusR.status === 'fulfilled' && menusR.value.success) setRichMenus(menusR.value.data)
      else if (menusR.status === 'rejected') setError(menusR.reason?.message ?? '取得に失敗しました')
      if (defR.status === 'fulfilled' && defR.value.success) setDefaultId(defR.value.data?.richMenuId ?? null)
    } catch (e) { setError(e instanceof Error ? e.message : '取得に失敗しました') }
    setLoading(false)
  }, [])

  const loadStats = useCallback(async (cid: string, from?: string, to?: string) => {
    setStatsLoading(true)
    try {
      const p = new URLSearchParams({ channelId: cid })
      if (from) p.set('from', from)
      if (to)   p.set('to', to)
      const r = await fetchApi<{ success: boolean; data: TapStat[] }>(`/api/rich-menu-analytics?${p}`)
      if (r.success) setTapStats(r.data)
    } catch { /* ignore */ }
    setStatsLoading(false)
  }, [])

  async function loadUserList(label: string, from: string, to: string) {
    setModalLabel(label)
    setUserList([])
    setUserListLoading(true)
    try {
      const p = new URLSearchParams({ label })
      if (channelId) p.set('channelId', channelId)
      if (from) p.set('from', from)
      if (to)   p.set('to', to)
      const r = await fetchApi<{ success: boolean; data: UserStat[] }>(`/api/rich-menu-analytics/users?${p}`)
      if (r.success) setUserList(r.data)
    } catch { /* ignore */ }
    setUserListLoading(false)
  }

  useEffect(() => { if (channelId) { loadMenus(channelId); loadStats(channelId) } }, [channelId, loadMenus, loadStats])

  // ── Load templates when create form opens ─────────────────────────────────
  useEffect(() => {
    if (!showCreate) return
    fetchApi<{ success: boolean; data: TemplateItem[] }>('/api/templates')
      .then(r => { if (r.success) setTemplates(r.data) })
      .catch(() => {})
  }, [showCreate])

  // ── Sync image element ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!uploadedImg) { imgElRef.current = null; setImgReady(false); return }
    const img = new Image()
    img.onload = () => { imgElRef.current = img; setImgReady(true) }
    img.src = uploadedImg
  }, [uploadedImg])

  // ── Draw canvas ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, DISP_W, dispH)

    if (imgReady && imgElRef.current) {
      ctx.drawImage(imgElRef.current, 0, 0, DISP_W, dispH)
    } else {
      ctx.fillStyle = '#f3f4f6'
      ctx.fillRect(0, 0, DISP_W, dispH)
      ctx.fillStyle = '#9ca3af'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('画像をアップロードしてください', DISP_W / 2, dispH / 2)
    }

    const sc = DISP_W / LINE_W
    areas.forEach((area, i) => {
      const x = area.bounds.x * sc, y = area.bounds.y * sc
      const w = area.bounds.width * sc, h = area.bounds.height * sc
      ctx.fillStyle = FILL[i % FILL.length]
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = STROKE[i % STROKE.length]
      ctx.lineWidth = selIdx === i ? 3 : 1.5
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
      ctx.fillStyle = STROKE[i % STROKE.length]
      ctx.beginPath(); ctx.arc(x + 14, y + 14, 11, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), x + 14, y + 14)
    })

    if (draft) {
      ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.strokeRect(draft.x + 0.5, draft.y + 0.5, draft.w - 1, draft.h - 1)
      ctx.setLineDash([])
    }
  }, [areas, selIdx, imgReady, draft, dispH])

  // ── Canvas mouse events ────────────────────────────────────────────────────
  function canvasXY(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = canvasXY(e)
    const sc = DISP_W / LINE_W
    for (let i = areas.length - 1; i >= 0; i--) {
      const a = areas[i].bounds
      if (x >= a.x * sc && x <= (a.x + a.width) * sc && y >= a.y * sc && y <= (a.y + a.height) * sc) {
        setSelIdx(i); return
      }
    }
    setSelIdx(null)
    dragStart.current = { x, y }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragStart.current) return
    const { x, y } = canvasXY(e)
    const { x: sx, y: sy } = dragStart.current
    setDraft({ x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) })
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragStart.current) return
    const { x, y } = canvasXY(e)
    const { x: sx, y: sy } = dragStart.current
    dragStart.current = null; setDraft(null)
    const dw = Math.abs(x - sx), dh = Math.abs(y - sy)
    if (dw < 8 || dh < 8) return
    const sc = DISP_W / LINE_W
    const newArea: RichMenuArea = {
      bounds: {
        x: Math.round(Math.min(sx, x) / sc),
        y: Math.round(Math.min(sy, y) / sc),
        width:  Math.round(dw / sc),
        height: Math.round(dh / sc),
      },
      action: { type: 'message', text: `ボタン${areas.length + 1}` },
    }
    setAreas(prev => [...prev, newArea])
    setAreaKinds(prev => [...prev, 'message'])
    setCustomMsgs(prev => [...prev, ''])
    setSelIdx(areas.length)
  }

  // ── Image upload helpers ───────────────────────────────────────────────────
  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = e => res(e.target!.result as string)
      r.onerror = rej
      r.readAsDataURL(file)
    })
  }

  // Resize to 2500×h, compress JPEG with toBlob() until binary < 920KB (LINE limit is 1MB)
  function compressForLine(dataUrl: string, h: number): Promise<{ blob: Blob; preview: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = LINE_W
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas error')); return }
        ctx.drawImage(img, 0, 0, LINE_W, h)
        const attempt = (quality: number) => {
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error('toBlob failed')); return }
            if (blob.size <= 700 * 1024 || quality <= 0.15) {
              resolve({ blob, preview: canvas.toDataURL('image/jpeg', quality) })
            } else {
              attempt(Math.round((quality - 0.08) * 100) / 100)
            }
          }, 'image/jpeg', quality)
        }
        attempt(0.92)
      }
      img.onerror = reject
      img.src = dataUrl
    })
  }

  // Upload image binary directly to worker (avoids base64 JSON overhead)
  async function uploadImageBinary(rid: string, blob: Blob, cid: string): Promise<void> {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('lh_api_key') || '' : ''
    const res = await fetch(
      `${apiUrl}/api/rich-menus/${rid}/image?channelId=${encodeURIComponent(cid)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', 'Authorization': `Bearer ${apiKey}` },
        body: blob,
      }
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { error?: string })
      const sizeInfo = `[client-blob:${(blob.size / 1024).toFixed(0)}KB]`
      throw new Error(((body as { error?: string }).error ?? '画像のアップロードに失敗しました') + ' ' + sizeInfo)
    }
  }

  async function handleImgSelect(file: File) {
    const dataUrl = await readFileAsDataUrl(file)
    const { blob, preview } = await compressForLine(dataUrl, menuHeight)
    setUploadedImg(preview)
    setUploadBlob(blob)
  }

  // ── Area action helpers ───────────────────────────────────────────────────
  function updateArea(idx: number, action: RichMenuArea['action']) {
    setAreas(prev => prev.map((a, i) => i === idx ? { ...a, action } : a))
  }

  function removeArea(idx: number) {
    setAreas(prev => prev.filter((_, i) => i !== idx))
    setAreaKinds(prev => prev.filter((_, i) => i !== idx))
    setCustomMsgs(prev => prev.filter((_, i) => i !== idx))
    if (selIdx === idx) setSelIdx(null)
    else if (selIdx !== null && selIdx > idx) setSelIdx(selIdx - 1)
  }

  function changeKind(idx: number, kind: AreaActionKind) {
    setAreaKinds(prev => prev.map((k, i) => i === idx ? kind : k))
    if (kind === 'message') updateArea(idx, { type: 'message', text: '' })
    else if (kind === 'uri') updateArea(idx, { type: 'uri', uri: '' })
    else if (kind === 'tpl') updateArea(idx, { type: 'postback', data: '', displayText: '' })
    else if (kind === 'flow') updateArea(idx, { type: 'postback', data: 'action=rich_menu_flow&id=', displayText: '' })
    else updateArea(idx, { type: 'postback', data: 'action=rich_menu_msg&text=', displayText: '' })
  }

  function selectTemplate(idx: number, tplId: string) {
    const tpl = templates.find(t => t.id === tplId)
    updateArea(idx, {
      type: 'postback',
      data: `action=rich_menu_tpl&id=${tplId}`,
      displayText: tpl?.name ?? '',
      label: tpl?.name?.slice(0, 20) ?? 'メニュー',
    })
  }

  function selectFlow(idx: number, flowId: string) {
    const opt = FLOW_OPTIONS.find(f => f.id === flowId)
    if (!opt) return
    updateArea(idx, {
      type: 'postback',
      data: `action=rich_menu_flow&id=${flowId}`,
      displayText: opt.displayText,
      label: opt.displayText.slice(0, 20),
    })
  }

  function setCustomText(idx: number, text: string) {
    setCustomMsgs(prev => prev.map((t, i) => i === idx ? text : t))
    const encoded = encodeURIComponent(text).slice(0, 270)
    updateArea(idx, {
      type: 'postback',
      data: `action=rich_menu_msg&text=${encoded}`,
      displayText: text.slice(0, 20),
      label: text.slice(0, 20) || 'メッセージ',
    })
  }

  // ── Presets ────────────────────────────────────────────────────────────────
  function applyPreset(cols: number) {
    const colW = Math.floor(LINE_W / cols)
    const newAreas: RichMenuArea[] = Array.from({ length: cols }, (_, i) => ({
      bounds: { x: i * colW, y: 0, width: colW, height: menuHeight },
      action: { type: 'message', text: `ボタン${i + 1}` },
    }))
    setAreas(newAreas)
    setAreaKinds(Array(cols).fill('message'))
    setCustomMsgs(Array(cols).fill(''))
    setSelIdx(null)
  }

  function applyPreset2x(rows: number, cols: number) {
    const colW = Math.floor(LINE_W / cols)
    const rowH = Math.floor(menuHeight / rows)
    const newAreas: RichMenuArea[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newAreas.push({
          bounds: { x: c * colW, y: r * rowH, width: colW, height: rowH },
          action: { type: 'message', text: `ボタン${r * cols + c + 1}` },
        })
      }
    }
    setAreas(newAreas)
    setAreaKinds(Array(rows * cols).fill('message'))
    setCustomMsgs(Array(rows * cols).fill(''))
    setSelIdx(null)
  }

  // ── Validate areas ─────────────────────────────────────────────────────────
  function validateAreas(): string | null {
    for (let i = 0; i < areas.length; i++) {
      const act = areas[i]
      const kind = areaKinds[i] ?? 'message'
      const n = i + 1
      if (act.action.type === 'uri') {
        if (!act.action.uri?.trim()) return `エリア${n}のURLが入力されていません`
        try { new URL(act.action.uri) } catch { return `エリア${n}のURLが不正です（https://〜の形式で入力してください）` }
      }
      if (act.action.type === 'message' && !act.action.text?.trim()) {
        return `エリア${n}のメッセージが入力されていません`
      }
      if (act.action.type === 'postback') {
        if (kind === 'tpl' && !act.action.data.includes('action=rich_menu_tpl&id=') || (kind === 'tpl' && act.action.data === 'action=rich_menu_tpl&id=')) {
          return `エリア${n}のテンプレートが選択されていません`
        }
        if (kind === 'flow' && (act.action.data === 'action=rich_menu_flow&id=' || !act.action.data.match(/id=[^&]+/))) {
          return `エリア${n}のフローが選択されていません`
        }
        if (kind === 'custom_msg' && (!customMsgTexts[i]?.trim())) {
          return `エリア${n}のメッセージが入力されていません`
        }
      }
    }
    return null
  }

  // ── Create / Update ────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!uploadedImg) { setError('画像をアップロードしてください'); return }
    if (areas.length === 0) { setError('エリアを1つ以上設定してください'); return }
    const validErr = validateAreas()
    if (validErr) { setError(validErr); return }

    setCreating(true); setError('')
    const oldId = editTarget
    try {
      // uploadBlob が未設定の場合（キャッシュ等で古いコードが動いた場合）は再圧縮
      let blob = uploadBlob
      if (!blob) {
        const { blob: b } = await compressForLine(uploadedImg, menuHeight)
        blob = b
      }

      const body: RichMenuObject = {
        size: { width: LINE_W, height: menuHeight },
        selected: false,
        name: menuName,
        chatBarText,
        areas,
      }
      const createR = await fetchApi<{ success: boolean; data: { richMenuId: string } }>(
        `/api/rich-menus?channelId=${encodeURIComponent(channelId)}`,
        { method: 'POST', body: JSON.stringify(body) }
      )
      if (!createR.success || !createR.data?.richMenuId) throw new Error('リッチメニューの作成に失敗しました')
      const rid = createR.data.richMenuId

      await uploadImageBinary(rid, blob, channelId)

      if (setAsDefault) {
        await fetchApi(`/api/rich-menus/${rid}/default?channelId=${encodeURIComponent(channelId)}`, { method: 'POST' })
        setDefaultId(rid)
      }

      // 編集モード: 旧メニューを削除
      if (oldId) {
        await fetchApi(`/api/rich-menus/${oldId}?channelId=${encodeURIComponent(channelId)}`, { method: 'DELETE' })
      }

      setSuccess(`${oldId ? '更新' : '作成'}完了${setAsDefault ? '・デフォルト設定済み' : ''} (ID: ${rid})`)
      setShowCreate(false); resetForm()
      await loadMenus(channelId)
    } catch (e) { setError(e instanceof Error ? e.message : `${oldId ? '更新' : '作成'}に失敗しました`) }
    setCreating(false)
  }

  function resetForm() {
    setMenuName('新しいリッチメニュー'); setChatBarText('メニュー'); setMenuHeight(843)
    setAreas([]); setAreaKinds([]); setCustomMsgs([])
    setSelIdx(null); setUploadedImg(null); setUploadBlob(null); setSetAsDefault(true)
    setEditTarget(null)
  }

  function inferKind(action: RichMenuArea['action']): AreaActionKind {
    if (action.type === 'message') return 'message'
    if (action.type === 'uri') return 'uri'
    if (action.type === 'postback') {
      if (action.data.includes('action=rich_menu_tpl')) return 'tpl'
      if (action.data.includes('action=rich_menu_flow')) return 'flow'
      if (action.data.includes('action=rich_menu_msg')) return 'custom_msg'
    }
    return 'message'
  }

  function startEdit(menu: RichMenuObject) {
    const h = (menu.size?.height === 1686 ? 1686 : 843) as 843 | 1686
    setMenuName(menu.name)
    setChatBarText(menu.chatBarText)
    setMenuHeight(h)
    setAreas(menu.areas ?? [])
    const kinds = (menu.areas ?? []).map(a => inferKind(a.action))
    setAreaKinds(kinds)
    setCustomMsgs((menu.areas ?? []).map((a, i) => {
      if (kinds[i] === 'custom_msg' && a.action.type === 'postback') {
        try { return decodeURIComponent(a.action.data.replace('action=rich_menu_msg&text=', '')) } catch { return '' }
      }
      return ''
    }))
    setSelIdx(null)
    setUploadedImg(null)
    setSetAsDefault(menu.richMenuId === defaultId)
    setEditTarget(menu.richMenuId ?? null)
    setShowCreate(true)
    setError('')
  }

  // ── List actions ──────────────────────────────────────────────────────────
  async function handleSetDefault(rid: string) {
    try {
      await fetchApi(`/api/rich-menus/${rid}/default?channelId=${encodeURIComponent(channelId)}`, { method: 'POST' })
      setDefaultId(rid); setSuccess('デフォルトに設定しました')
    } catch (e) { setError(e instanceof Error ? e.message : 'デフォルト設定に失敗しました') }
  }

  async function handleDelete(rid: string) {
    if (!confirm('このリッチメニューを削除しますか？')) return
    try {
      await fetchApi(`/api/rich-menus/${rid}?channelId=${encodeURIComponent(channelId)}`, { method: 'DELETE' })
      if (defaultId === rid) setDefaultId(null)
      setSuccess('削除しました'); await loadMenus(channelId)
    } catch (e) { setError(e instanceof Error ? e.message : '削除に失敗しました') }
  }

  async function handleReupload(file: File) {
    if (!reupTarget) return
    setReuploading(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const { blob } = await compressForLine(dataUrl, 843)
      await uploadImageBinary(reupTarget, blob, channelId)
      setSuccess('画像を再アップロードしました')
    } catch (e) { setError(e instanceof Error ? e.message : '画像アップロードに失敗しました') }
    setReuploading(false); setReupTarget(null)
  }

  // ── Area editor ──────────────────────────────────────────────────────────
  function renderAreaEditor(idx: number) {
    const area = areas[idx]
    const kind = areaKinds[idx] ?? 'message'
    if (!area) return null
    const act = area.action

    // Current flow ID for 'flow' kind
    const currentFlowId = act.type === 'postback' ? (act.data.match(/id=([^&]+)/)?.[1] ?? '') : ''
    // Current template ID for 'tpl' kind
    const currentTplId = act.type === 'postback' && act.data.startsWith('action=rich_menu_tpl')
      ? (act.data.replace('action=rich_menu_tpl&id=', ''))
      : ''

    return (
      <div key={idx} className={`rounded-lg border p-3 cursor-pointer transition-colors ${selIdx === idx ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
        onClick={() => setSelIdx(idx)}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold" style={{ color: STROKE[idx % STROKE.length] }}>
            エリア {idx + 1}
          </span>
          <button onClick={e => { e.stopPropagation(); removeArea(idx) }}
            className="text-xs text-red-400 hover:text-red-600 px-1">✕</button>
        </div>

        <select
          value={kind}
          onClick={e => e.stopPropagation()}
          onChange={e => changeKind(idx, e.target.value as AreaActionKind)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-2"
        >
          <option value="message">テキストメッセージ送信</option>
          <option value="uri">URLを開く</option>
          <option value="tpl">テンプレートを送る</option>
          <option value="custom_msg">その場でメッセージ作成</option>
          <option value="flow">LINEフロー起動</option>
        </select>

        {kind === 'message' && (
          <div>
            <input
              type="text"
              placeholder="タップ時に送信するテキスト"
              value={'text' in act ? act.text : ''}
              onClick={e => e.stopPropagation()}
              onChange={e => updateArea(idx, { type: 'message', text: e.target.value })}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1"
            />
            <p className="text-xs text-gray-400 mt-1">ユーザーが送信したように見えるテキスト</p>
          </div>
        )}

        {kind === 'uri' && (
          <div>
            <input
              type="url"
              placeholder="https://..."
              value={'uri' in act ? act.uri : ''}
              onClick={e => e.stopPropagation()}
              onChange={e => updateArea(idx, { type: 'uri', uri: e.target.value })}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1"
            />
            <p className="text-xs text-gray-400 mt-1">外部URLを開く（https://〜）</p>
          </div>
        )}

        {kind === 'tpl' && (
          <div>
            <select
              value={currentTplId}
              onClick={e => e.stopPropagation()}
              onChange={e => selectTemplate(idx, e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1"
            >
              <option value="">テンプレートを選択...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} [{t.category}]</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">タップ時に選択したテンプレートを送信</p>
          </div>
        )}

        {kind === 'custom_msg' && (
          <div>
            <textarea
              rows={3}
              placeholder="ボタンタップ時にユーザーへ送るメッセージを入力（最大200文字）"
              maxLength={200}
              value={customMsgTexts[idx] ?? ''}
              onClick={e => e.stopPropagation()}
              onChange={e => setCustomText(idx, e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">タップ時にこのテキストをユーザーへ送信</p>
          </div>
        )}

        {kind === 'flow' && (
          <div>
            <select
              value={currentFlowId}
              onClick={e => e.stopPropagation()}
              onChange={e => selectFlow(idx, e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1"
            >
              <option value="">フローを選択...</option>
              {FLOW_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">タップ時にLINE上でフローを起動</p>
            {currentFlowId && (
              <div className="mt-1.5 px-2 py-1 bg-purple-50 rounded text-xs text-purple-700 border border-purple-100">
                {FLOW_OPTIONS.find(f => f.id === currentFlowId)?.label}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <Header title="リッチメニュー管理" />

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">✕</button>
        </div>
      )}
      {success && (
        <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-600 ml-2">✕</button>
        </div>
      )}

      {/* Account selector */}
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 shrink-0">LINEアカウント</label>
        <select
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          value={channelId}
          onChange={e => { setChannelId(e.target.value); setShowCreate(false); setSuccess('') }}
        >
          <option value="">選択してください</option>
          {accounts.map(a => (
            <option key={a.id} value={a.channelId}>{a.name} ({a.channelId})</option>
          ))}
        </select>
        {channelId && !showCreate && (
          <button
            onClick={() => { setShowCreate(true); resetForm() }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            ＋ 新規作成
          </button>
        )}
      </div>

      {/* ── Create Form ── */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">
                {editTarget ? 'リッチメニュー編集' : '新規リッチメニュー作成'}
              </h2>
              {editTarget && (
                <p className="text-xs text-gray-400 mt-0.5">ID: {editTarget}</p>
              )}
            </div>
            <button onClick={() => { setShowCreate(false); resetForm() }}
              className="text-gray-400 hover:text-gray-600 text-sm">✕ 閉じる</button>
          </div>

          <div className="flex gap-0">
            {/* Left: Canvas */}
            <div className="flex-1 p-5 border-r border-gray-100">
              {/* Image upload */}
              <div className="mb-3 flex items-center gap-3">
                <label className="text-xs font-medium text-gray-600 shrink-0">
                  背景画像（推奨: 2500×{menuHeight}px / 1MB以下 / JPG・PNG）
                </label>
                <label className="px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-600 cursor-pointer hover:bg-gray-50">
                  ファイルを選択
                  <input type="file" accept="image/png,image/jpeg" className="hidden"
                    onChange={e => e.target.files?.[0] && handleImgSelect(e.target.files[0])} />
                </label>
                {uploadedImg
                  ? <span className="text-xs text-green-600">✓ アップロード済み</span>
                  : editTarget && <span className="text-xs text-amber-600">編集時は画像の再アップロードが必要です</span>
                }
              </div>

              {/* Preset buttons */}
              <div className="mb-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">エリアプリセット:</span>
                {[1, 2, 3].map(c => (
                  <button key={c} onClick={() => applyPreset(c)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">{c}列</button>
                ))}
                <button onClick={() => applyPreset2x(2, 3)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">2行×3列</button>
                <button onClick={() => applyPreset2x(2, 2)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">2行×2列</button>
                {areas.length > 0 && (
                  <button onClick={() => { setAreas([]); setAreaKinds([]); setCustomMsgs([]); setSelIdx(null) }}
                    className="px-2 py-1 text-xs text-red-500 border border-red-200 rounded hover:bg-red-50">全削除</button>
                )}
              </div>

              {/* Canvas editor */}
              <canvas
                ref={canvasRef}
                width={DISP_W}
                height={dispH}
                className="border border-gray-200 rounded cursor-crosshair block"
                style={{ width: DISP_W, height: dispH, maxWidth: '100%' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { dragStart.current = null; setDraft(null) }}
              />
              <p className="text-xs text-gray-400 mt-1">
                クリック＆ドラッグでエリア追加 / エリアをクリックで選択
              </p>
            </div>

            {/* Right: Settings + Area list */}
            <div className="w-80 shrink-0 flex flex-col">
              {/* Basic settings */}
              <div className="p-4 border-b border-gray-100 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">メニュー名（管理用）</label>
                  <input className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                    value={menuName} onChange={e => setMenuName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">チャットバーテキスト</label>
                  <input className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                    value={chatBarText} onChange={e => setChatBarText(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">高さ</label>
                  <select
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                    value={menuHeight}
                    onChange={e => setMenuHeight(Number(e.target.value) as 843 | 1686)}
                  >
                    <option value={843}>コンパクト（843px）</option>
                    <option value={1686}>フル（1686px）</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={setAsDefault} onChange={e => setSetAsDefault(e.target.checked)} />
                  作成後にデフォルト設定する
                </label>
              </div>

              {/* Area list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <div className="text-xs font-medium text-gray-500 mb-2">
                  エリア設定（{areas.length} 個）
                </div>

                {/* Flow reference */}
                <div className="mb-3 p-2.5 bg-gray-50 rounded border border-gray-200 text-xs text-gray-600 space-y-1">
                  <p className="font-medium text-gray-700 mb-1">利用可能なLINEフロー</p>
                  {FLOW_OPTIONS.map(f => (
                    <div key={f.id} className="flex items-start gap-1.5">
                      <span className="text-purple-500 shrink-0">▸</span>
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>

                {areas.length === 0 ? (
                  <p className="text-xs text-gray-400">キャンバス上でドラッグするか、プリセットを使ってエリアを追加してください</p>
                ) : (
                  areas.map((_, i) => renderAreaEditor(i))
                )}
              </div>

              {/* Create button */}
              <div className="p-4 border-t border-gray-100">
                <button
                  onClick={handleCreate}
                  disabled={creating || !uploadedImg || areas.length === 0}
                  className="w-full py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: editTarget ? '#2563eb' : '#06C755' }}
                >
                  {creating ? (editTarget ? '更新中...' : '作成中...') : (editTarget ? '更新する（旧メニューを置き換え）' : '作成する')}
                </button>
                {(!uploadedImg || areas.length === 0) && (
                  <p className="text-xs text-gray-400 mt-1 text-center">
                    {!uploadedImg ? '画像を選択してください' : 'エリアを追加してください'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Menu list ── */}
      {channelId && !showCreate && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-700">
              登録済みリッチメニュー
              {defaultId && <span className="ml-2 text-xs text-gray-400">（デフォルト設定済み）</span>}
            </span>
            <button onClick={() => loadMenus(channelId)} className="text-xs text-blue-600 hover:underline">更新</button>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : richMenus.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">リッチメニューがありません</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium">名前</th>
                  <th className="px-4 py-3 text-left font-medium">ID</th>
                  <th className="px-4 py-3 text-left font-medium">チャットバー</th>
                  <th className="px-4 py-3 text-left font-medium">エリア数</th>
                  <th className="px-4 py-3 text-center font-medium w-52">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {richMenus.map(menu => (
                  <tr key={menu.richMenuId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {menu.name}
                      {menu.richMenuId === defaultId && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">デフォルト</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{menu.richMenuId}</td>
                    <td className="px-4 py-3 text-gray-600">{menu.chatBarText}</td>
                    <td className="px-4 py-3 text-gray-600 text-center">{menu.areas?.length ?? '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center flex-wrap">
                        {menu.richMenuId !== defaultId && (
                          <button onClick={() => handleSetDefault(menu.richMenuId!)}
                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded border border-blue-200">
                            デフォルト設定
                          </button>
                        )}
                        <button onClick={() => startEdit(menu)}
                          className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-200">
                          編集
                        </button>
                        <label className={`px-2 py-1 text-xs cursor-pointer rounded border ${reuploading && reupTarget === menu.richMenuId ? 'opacity-50' : ''} text-orange-600 hover:bg-orange-50 border-orange-200`}>
                          {reuploading && reupTarget === menu.richMenuId ? '...' : '画像再登録'}
                          <input type="file" accept="image/png,image/jpeg" className="hidden"
                            onChange={e => {
                              if (e.target.files?.[0]) {
                                setReupTarget(menu.richMenuId!)
                                handleReupload(e.target.files[0])
                              }
                            }} />
                        </label>
                        <button onClick={() => handleDelete(menu.richMenuId!)}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200">
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Button tap analytics ── */}
      {channelId && !showCreate && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-gray-700 shrink-0">ボタンタップ集計</span>
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <input
                type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-xs"
              />
              <span className="text-gray-400 text-xs">〜</span>
              <input
                type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-xs"
              />
              <button
                onClick={() => loadStats(channelId, dateFrom || undefined, dateTo || undefined)}
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
              >絞り込み</button>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); loadStats(channelId); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >クリア</button>
              )}
            </div>
            <button onClick={() => loadStats(channelId, dateFrom || undefined, dateTo || undefined)} className="text-xs text-blue-600 hover:underline shrink-0">更新</button>
          </div>
          {statsLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : tapStats.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">タップデータがまだありません</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium">ボタン</th>
                  <th className="px-4 py-3 text-center font-medium w-32">ユニーク人数</th>
                  <th className="px-4 py-3 text-center font-medium w-24">総タップ数</th>
                  <th className="px-4 py-3 text-left font-medium w-40">最終タップ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tapStats.map(s => (
                  <tr key={s.action_label} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{s.action_label}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => loadUserList(s.action_label, dateFrom, dateTo)}
                        className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold min-w-[40px] hover:bg-blue-200 transition-colors cursor-pointer"
                      >
                        {s.unique_users}人
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{s.total_taps}回</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {s.last_tapped ? new Date(s.last_tapped).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── User list modal ── */}
      {modalLabel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setModalLabel(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-800">「{modalLabel}」タップ者一覧</h3>
                {(dateFrom || dateTo) && (
                  <p className="text-xs text-gray-400 mt-0.5">{dateFrom || '〜'} 〜 {dateTo || '〜'}</p>
                )}
              </div>
              <button onClick={() => setModalLabel(null)} className="text-gray-400 hover:text-gray-600 ml-4 shrink-0">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {userListLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">読み込み中...</div>
              ) : userList.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">データがありません</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="px-4 py-2 text-left font-medium">名前</th>
                      <th className="px-4 py-2 text-center font-medium w-16">回数</th>
                      <th className="px-4 py-2 text-left font-medium w-36">最終タップ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {userList.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{u.display_name ?? '（名前なし）'}</td>
                        <td className="px-4 py-2.5 text-center text-gray-600">{u.tap_count}回</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">
                          {u.last_tapped ? new Date(u.last_tapped).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {!userListLoading && (
              <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 text-right">
                {userList.length}人
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden re-upload input */}
      <input ref={reuploadRef} type="file" accept="image/png,image/jpeg" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleReupload(e.target.files[0]) }} />
    </div>
  )
}
