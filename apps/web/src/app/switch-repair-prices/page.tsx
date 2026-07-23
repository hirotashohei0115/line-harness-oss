'use client'
import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

interface SwitchProduct {
  product_id: string
  name: string
  estimate_note: string | null
  sort_order: number
}

interface SymptomPrice {
  product_id: string
  symptom_id: string
  symptom_name: string
  sort_order: number
  price_id: string | null
  price_from: number | null
  price_to: number | null
  delivery_days_from: number | null
  delivery_days_to: number | null
}

interface RepairMenuItem {
  id: string
  product_id: string
  name: string
  price_from: number | null
  price_to: number | null
  delivery_days: string | null
  sort_order: number
}

interface EditPriceState {
  name: string
  priceFrom: string
  priceTo: string
  deliveryFrom: string
  deliveryTo: string
  deliveryDays: string
}

function formatPrice(from: number | null, to: number | null): string {
  if (from == null) return '未設定'
  if (from === 0) return '¥0（お問い合わせ）'
  if (to != null) return `¥${from.toLocaleString()}〜¥${to.toLocaleString()}`
  return `¥${from.toLocaleString()}`
}

function formatDelivery(from: number | null, to: number | null): string {
  if (from == null) return '未設定'
  if (from === 0) return '即日'
  if (to != null && to !== 0) return `${from}〜${to}日`
  return `${from}日〜`
}

function formatDeliveryStr(val: string | null): string {
  if (!val) return '未設定'
  if (val === '0' || val === '0日') return '即日'
  return val
}

export default function SwitchRepairPricesPage() {
  const [products, setProducts] = useState<SwitchProduct[]>([])
  const [symptomData, setSymptomData] = useState<SymptomPrice[]>([])
  const [menuItems, setMenuItems] = useState<RepairMenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeProductId, setActiveProductId] = useState('')
  const [subTab, setSubTab] = useState<'symptoms' | 'menu'>('symptoms')
  const [error, setError] = useState('')

  // 機種設定
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [editProductState, setEditProductState] = useState({ name: '', estimate_note: '' })
  const [savingProduct, setSavingProduct] = useState(false)

  // 症状
  const [editingSymptom, setEditingSymptom] = useState<string | null>(null)
  const [editSymptomState, setEditSymptomState] = useState<EditPriceState | null>(null)
  const [savingSymptom, setSavingSymptom] = useState(false)
  const [addingSymptom, setAddingSymptom] = useState(false)
  const [newSymptomName, setNewSymptomName] = useState('')
  const [addingSymptomSaving, setAddingSymptomSaving] = useState(false)

  // 全体設定
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [editingSettings, setEditingSettings] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({})
  const [savingSettings, setSavingSettings] = useState(false)

  // 修理メニュー
  const [editingMenuItem, setEditingMenuItem] = useState<string | null>(null)
  const [editMenuState, setEditMenuState] = useState<EditPriceState | null>(null)
  const [savingMenu, setSavingMenu] = useState(false)
  const [addingMenu, setAddingMenu] = useState(false)
  const [newMenuName, setNewMenuName] = useState('')
  const [newMenuPriceFrom, setNewMenuPriceFrom] = useState('')
  const [newMenuPriceTo, setNewMenuPriceTo] = useState('')
  const [newMenuDeliveryDays, setNewMenuDeliveryDays] = useState('')
  const [addingMenuSaving, setAddingMenuSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, sympRes, settingsRes] = await Promise.all([
        fetchApi<{ success: boolean; data: SwitchProduct[] }>('/api/switch-repair/products'),
        fetchApi<{ success: boolean; data: SymptomPrice[] }>('/api/switch-repair/symptom-prices'),
        fetchApi<{ success: boolean; data: Record<string, string> }>('/api/switch-repair/settings'),
      ])
      if (prodRes.success && prodRes.data.length > 0) {
        setProducts(prodRes.data)
        setActiveProductId(prodRes.data[0].product_id)
        const mRes = await fetchApi<{ success: boolean; data: RepairMenuItem[] }>(`/api/switch-repair/menu-items?productId=${prodRes.data[0].product_id}`)
        if (mRes.success) setMenuItems(mRes.data)
      }
      if (sympRes.success) setSymptomData(sympRes.data)
      if (settingsRes.success) setSettings(settingsRes.data)
    } catch { setError('読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function switchProduct(productId: string) {
    setActiveProductId(productId)
    setEditingProduct(null); setEditingSymptom(null); setEditingMenuItem(null)
    setAddingSymptom(false); setAddingMenu(false)
    try {
      const res = await fetchApi<{ success: boolean; data: RepairMenuItem[] }>(`/api/switch-repair/menu-items?productId=${productId}`)
      if (res.success) setMenuItems(res.data)
    } catch { /* ignore */ }
  }

  const activeProduct = products.find(p => p.product_id === activeProductId)
  const symptomRows = symptomData.filter(d => d.product_id === activeProductId).sort((a, b) => a.sort_order - b.sort_order)
  const menuRows = menuItems.filter(m => m.product_id === activeProductId).sort((a, b) => a.sort_order - b.sort_order)

  // --- 全体設定 ---
  async function saveSettings() {
    setSavingSettings(true)
    try {
      const res = await fetchApi<{ success: boolean }>('/api/switch-repair/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsDraft),
      })
      if (res.success) { setSettings(settingsDraft); setEditingSettings(false) }
    } catch { setError('保存に失敗しました') }
    finally { setSavingSettings(false) }
  }

  // --- 機種設定 ---
  async function saveProduct(productId: string) {
    setSavingProduct(true)
    try {
      const res = await fetchApi<{ success: boolean; data: SwitchProduct }>(`/api/switch-repair/products/${productId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editProductState.name, estimate_note: editProductState.estimate_note.trim() || null }),
      })
      if (res.success && res.data) { setProducts(prev => prev.map(p => p.product_id === productId ? res.data : p)); setEditingProduct(null) }
    } catch { setError('保存に失敗しました') }
    finally { setSavingProduct(false) }
  }

  // --- 症状 ---
  async function saveSymptom(row: SymptomPrice) {
    if (!editSymptomState) return
    setSavingSymptom(true)
    try {
      if (editSymptomState.name.trim() !== row.symptom_name) {
        await fetchApi(`/api/switch-repair/symptoms/${row.symptom_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editSymptomState.name.trim() }) })
      }
      const deliveryDaysFrom = editSymptomState.deliveryFrom !== '' ? Number(editSymptomState.deliveryFrom) : null
      const deliveryDaysTo = editSymptomState.deliveryTo !== '' ? Number(editSymptomState.deliveryTo) : null
      const res = await fetchApi<{ success: boolean; data: SymptomPrice }>(`/api/switch-repair/symptom-prices/${row.symptom_id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: row.product_id,
          priceFrom: editSymptomState.priceFrom !== '' ? Number(editSymptomState.priceFrom) : 0,
          priceTo: editSymptomState.priceTo !== '' ? Number(editSymptomState.priceTo) : null,
          deliveryDaysFrom,
          deliveryDaysTo,
        }),
      })
      if (res.success && res.data) {
        const updated = editSymptomState.name.trim() !== row.symptom_name ? { ...res.data, symptom_name: editSymptomState.name.trim() } : res.data
        setSymptomData(prev => prev.map(d => d.symptom_id === row.symptom_id && d.product_id === row.product_id ? updated : d))
        setEditingSymptom(null); setEditSymptomState(null)
      }
    } catch { setError('保存に失敗しました') }
    finally { setSavingSymptom(false) }
  }

  async function deleteSymptom(row: SymptomPrice) {
    if (!confirm(`「${row.symptom_name}」を削除しますか？`)) return
    try {
      await fetchApi(`/api/switch-repair/symptoms/${row.symptom_id}`, { method: 'DELETE' })
      setSymptomData(prev => prev.filter(d => !(d.symptom_id === row.symptom_id && d.product_id === row.product_id)))
    } catch { setError('削除に失敗しました') }
  }

  async function addSymptom() {
    if (!newSymptomName.trim()) return
    setAddingSymptomSaving(true)
    try {
      const res = await fetchApi<{ success: boolean; data: SymptomPrice }>('/api/switch-repair/symptoms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: activeProductId, name: newSymptomName.trim() }),
      })
      if (res.success && res.data) { setSymptomData(prev => [...prev, res.data]); setNewSymptomName(''); setAddingSymptom(false) }
    } catch { setError('追加に失敗しました') }
    finally { setAddingSymptomSaving(false) }
  }

  // --- 修理メニュー ---
  async function saveMenuItem(item: RepairMenuItem) {
    if (!editMenuState) return
    setSavingMenu(true)
    try {
      const res = await fetchApi<{ success: boolean; data: RepairMenuItem }>(`/api/switch-repair/menu-items/${item.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editMenuState.name.trim(),
          priceFrom: editMenuState.priceFrom !== '' ? Number(editMenuState.priceFrom) : null,
          priceTo: editMenuState.priceTo !== '' ? Number(editMenuState.priceTo) : null,
          deliveryDays: editMenuState.deliveryDays.trim() || null,
        }),
      })
      if (res.success && res.data) { setMenuItems(prev => prev.map(m => m.id === item.id ? res.data : m)); setEditingMenuItem(null); setEditMenuState(null) }
    } catch { setError('保存に失敗しました') }
    finally { setSavingMenu(false) }
  }

  async function deleteMenuItem(item: RepairMenuItem) {
    if (!confirm(`「${item.name}」を削除しますか？`)) return
    try {
      await fetchApi(`/api/switch-repair/menu-items/${item.id}`, { method: 'DELETE' })
      setMenuItems(prev => prev.filter(m => m.id !== item.id))
    } catch { setError('削除に失敗しました') }
  }

  async function addMenuItem() {
    if (!newMenuName.trim()) return
    setAddingMenuSaving(true)
    try {
      const res = await fetchApi<{ success: boolean; data: RepairMenuItem }>('/api/switch-repair/menu-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: activeProductId,
          name: newMenuName.trim(),
          priceFrom: newMenuPriceFrom !== '' ? Number(newMenuPriceFrom) : null,
          priceTo: newMenuPriceTo !== '' ? Number(newMenuPriceTo) : null,
          deliveryDays: newMenuDeliveryDays.trim() || null,
        }),
      })
      if (res.success && res.data) {
        setMenuItems(prev => [...prev, res.data])
        setNewMenuName(''); setNewMenuPriceFrom(''); setNewMenuPriceTo(''); setNewMenuDeliveryDays('')
        setAddingMenu(false)
      }
    } catch { setError('追加に失敗しました') }
    finally { setAddingMenuSaving(false) }
  }

  if (loading) return <div><Header title="Switch修理料金設定" /><div className="p-8 text-center text-gray-400 text-sm">読み込み中...</div></div>

  return (
    <div>
      <Header title="Switch修理料金設定" />
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}<button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* 機種タブ */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {products.map(p => (
          <button key={p.product_id} onClick={() => switchProduct(p.product_id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeProductId === p.product_id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {p.name}
          </button>
        ))}
      </div>

      {/* 機種設定 */}
      {activeProduct && (
        <div className="mb-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">機種設定</h2>
            {editingProduct !== activeProduct.product_id && (
              <button onClick={() => { setEditingProduct(activeProduct.product_id); setEditProductState({ name: activeProduct.name, estimate_note: activeProduct.estimate_note ?? '' }) }}
                className="px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200">編集</button>
            )}
          </div>
          {editingProduct === activeProduct.product_id ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">機種名（LINEのボタンに表示）</label>
                <input type="text" value={editProductState.name} onChange={e => setEditProductState(s => ({ ...s, name: e.target.value }))} maxLength={20}
                  className="w-full max-w-xs px-2 py-1 border border-gray-300 rounded text-sm" />
                <p className="text-xs text-gray-400 mt-1">{editProductState.name.length}/20</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">仮見積もりの案内文（価格提示時にLINEへ追加送信）</label>
                <textarea value={editProductState.estimate_note} onChange={e => setEditProductState(s => ({ ...s, estimate_note: e.target.value }))} rows={3}
                  placeholder="例：この金額はあくまで目安です。実際の費用は診断後に確定します。"
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm resize-y" />
                <p className="text-xs text-gray-400 mt-1">空欄の場合は送信しません</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveProduct(activeProduct.product_id)} disabled={savingProduct || !editProductState.name.trim()}
                  className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50">保存</button>
                <button onClick={() => setEditingProduct(null)} className="px-3 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50">キャンセル</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex gap-4"><span className="text-gray-500 w-28 shrink-0">機種名</span><span className="font-medium text-gray-800">{activeProduct.name}</span></div>
              <div className="flex gap-4"><span className="text-gray-500 w-28 shrink-0">仮見積もり案内文</span>
                <span className={activeProduct.estimate_note ? 'text-gray-800 whitespace-pre-wrap' : 'text-gray-300'}>{activeProduct.estimate_note ?? '未設定'}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* サブタブ */}
      <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setSubTab('symptoms')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${subTab === 'symptoms' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          症状一覧
        </button>
        <button onClick={() => setSubTab('menu')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${subTab === 'menu' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          修理メニュー
        </button>
      </div>

      {/* 症状一覧 */}
      {subTab === 'symptoms' && (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">症状（LINEに表示）</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600 w-56">料金（仮見積もり）</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600 w-44">納期目安</th>
                  <th className="px-4 py-3 w-36"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {symptomRows.map(row => (
                  <tr key={row.symptom_id} className="hover:bg-gray-50">
                    {editingSymptom === row.symptom_id && editSymptomState ? (
                      <>
                        <td className="px-4 py-3">
                          <input type="text" value={editSymptomState.name} maxLength={20}
                            onChange={e => setEditSymptomState(s => s ? { ...s, name: e.target.value } : s)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
                          <p className="text-xs text-gray-400 mt-1">{editSymptomState.name.length}/20</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <input type="number" placeholder="最低" value={editSymptomState.priceFrom} onChange={e => setEditSymptomState(s => s ? { ...s, priceFrom: e.target.value } : s)} className="w-20 px-2 py-1 border border-gray-300 rounded text-xs" />
                            <span className="text-gray-400 text-xs">〜</span>
                            <input type="number" placeholder="最高" value={editSymptomState.priceTo} onChange={e => setEditSymptomState(s => s ? { ...s, priceTo: e.target.value } : s)} className="w-20 px-2 py-1 border border-gray-300 rounded text-xs" />
                            <span className="text-gray-400 text-xs">円</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">0円=お問い合わせ表示</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <input type="number" placeholder="最短" value={editSymptomState.deliveryFrom} onChange={e => setEditSymptomState(s => s ? { ...s, deliveryFrom: e.target.value } : s)} className="w-16 px-2 py-1 border border-gray-300 rounded text-xs" />
                            <span className="text-gray-400 text-xs">〜</span>
                            <input type="number" placeholder="最長" value={editSymptomState.deliveryTo} onChange={e => setEditSymptomState(s => s ? { ...s, deliveryTo: e.target.value } : s)} className="w-16 px-2 py-1 border border-gray-300 rounded text-xs" />
                            <span className="text-gray-400 text-xs">日</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => saveSymptom(row)} disabled={savingSymptom} className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50">保存</button>
                            <button onClick={() => { setEditingSymptom(null); setEditSymptomState(null) }} className="px-3 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50">キャンセル</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-700">{row.symptom_name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-medium ${row.price_from == null ? 'text-gray-300' : 'text-gray-800'}`}>{formatPrice(row.price_from, row.price_to)}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm ${row.delivery_days_from == null ? 'text-gray-300' : 'text-gray-700'}`}>{formatDelivery(row.delivery_days_from, row.delivery_days_to)}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => {
                              setEditingSymptom(row.symptom_id)
                              setEditSymptomState({
                                name: row.symptom_name,
                                priceFrom: row.price_from != null ? String(row.price_from) : '',
                                priceTo: row.price_to != null ? String(row.price_to) : '',
                                deliveryFrom: row.delivery_days_from != null ? String(row.delivery_days_from) : '',
                                deliveryTo: row.delivery_days_to != null ? String(row.delivery_days_to) : '',
                                deliveryDays: '',
                              })
                            }} className="px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200">編集</button>
                            <button onClick={() => deleteSymptom(row)} className="px-3 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded border border-red-200">削除</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {addingSymptom && (
                  <tr className="bg-blue-50">
                    <td className="px-4 py-3" colSpan={4}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <input type="text" value={newSymptomName} onChange={e => setNewSymptomName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSymptom() }}
                            maxLength={20} autoFocus placeholder="症状名（20文字以内）"
                            className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          <p className="text-xs text-gray-400 mt-1">{newSymptomName.length}/20</p>
                        </div>
                        <button onClick={addSymptom} disabled={addingSymptomSaving || !newSymptomName.trim()} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">追加</button>
                        <button onClick={() => { setAddingSymptom(false); setNewSymptomName('') }} className="px-3 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50">キャンセル</button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!addingSymptom && (
            <button onClick={() => setAddingSymptom(true)} className="mt-3 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors">
              + 症状を追加
            </button>
          )}
        </>
      )}

      {/* 修理メニュー */}
      {subTab === 'menu' && (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">修理メニュー名（LINEに表示）</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600 w-56">料金（仮見積もり）</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600 w-36">納期目安</th>
                  <th className="px-4 py-3 w-36"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {menuRows.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    {editingMenuItem === item.id && editMenuState ? (
                      <>
                        <td className="px-4 py-3">
                          <input type="text" value={editMenuState.name} onChange={e => setEditMenuState(s => s ? { ...s, name: e.target.value } : s)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <input type="number" placeholder="最低" value={editMenuState.priceFrom} onChange={e => setEditMenuState(s => s ? { ...s, priceFrom: e.target.value } : s)} className="w-20 px-2 py-1 border border-gray-300 rounded text-xs" />
                            <span className="text-gray-400 text-xs">〜</span>
                            <input type="number" placeholder="最高" value={editMenuState.priceTo} onChange={e => setEditMenuState(s => s ? { ...s, priceTo: e.target.value } : s)} className="w-20 px-2 py-1 border border-gray-300 rounded text-xs" />
                            <span className="text-gray-400 text-xs">円</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">0円=お問い合わせ表示</p>
                        </td>
                        <td className="px-4 py-3">
                          <input type="text" placeholder="例：3〜7日" value={editMenuState.deliveryDays}
                            onChange={e => setEditMenuState(s => s ? { ...s, deliveryDays: e.target.value } : s)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => saveMenuItem(item)} disabled={savingMenu} className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50">保存</button>
                            <button onClick={() => { setEditingMenuItem(null); setEditMenuState(null) }} className="px-3 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50">キャンセル</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-700">{item.name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-medium ${item.price_from == null ? 'text-gray-300' : 'text-gray-800'}`}>{formatPrice(item.price_from, item.price_to)}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm ${!item.delivery_days ? 'text-gray-300' : 'text-gray-700'}`}>{formatDeliveryStr(item.delivery_days)}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => {
                              setEditingMenuItem(item.id)
                              setEditMenuState({
                                name: item.name,
                                priceFrom: item.price_from != null ? String(item.price_from) : '',
                                priceTo: item.price_to != null ? String(item.price_to) : '',
                                deliveryFrom: '',
                                deliveryTo: '',
                                deliveryDays: item.delivery_days ?? '',
                              })
                            }} className="px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200">編集</button>
                            <button onClick={() => deleteMenuItem(item)} className="px-3 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded border border-red-200">削除</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {addingMenu && (
                  <tr className="bg-blue-50">
                    <td className="px-4 py-3">
                      <input type="text" value={newMenuName} onChange={e => setNewMenuName(e.target.value)} autoFocus
                        placeholder="修理メニュー名" className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <input type="number" placeholder="最低" value={newMenuPriceFrom} onChange={e => setNewMenuPriceFrom(e.target.value)} className="w-20 px-2 py-1 border border-blue-300 rounded text-xs" />
                        <span className="text-gray-400 text-xs">〜</span>
                        <input type="number" placeholder="最高" value={newMenuPriceTo} onChange={e => setNewMenuPriceTo(e.target.value)} className="w-20 px-2 py-1 border border-blue-300 rounded text-xs" />
                        <span className="text-gray-400 text-xs">円</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input type="text" placeholder="例：3〜7日" value={newMenuDeliveryDays} onChange={e => setNewMenuDeliveryDays(e.target.value)}
                        className="w-full px-2 py-1 border border-blue-300 rounded text-xs" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={addMenuItem} disabled={addingMenuSaving || !newMenuName.trim()} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">追加</button>
                        <button onClick={() => { setAddingMenu(false); setNewMenuName(''); setNewMenuPriceFrom(''); setNewMenuPriceTo(''); setNewMenuDeliveryDays('') }} className="px-3 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50">キャンセル</button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!addingMenu && (
            <button onClick={() => setAddingMenu(true)} className="mt-3 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors">
              + 修理メニューを追加
            </button>
          )}
        </>
      )}

      {/* 全体設定 */}
      <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">全体設定</h2>
          {!editingSettings && (
            <button onClick={() => { setSettingsDraft({ ...settings }); setEditingSettings(true) }}
              className="px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200">編集</button>
          )}
        </div>
        {editingSettings ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">挨拶メッセージ（友達追加・再フォロー時に送信）</label>
              <textarea
                value={settingsDraft.welcome_text ?? ''}
                onChange={e => setSettingsDraft(s => ({ ...s, welcome_text: e.target.value }))}
                rows={10}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm resize-y font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">「電話/チャットで相談する」返信メッセージ</label>
              <textarea
                value={settingsDraft.consult_phone_text ?? ''}
                onChange={e => setSettingsDraft(s => ({ ...s, consult_phone_text: e.target.value }))}
                rows={10}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm resize-y font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={saveSettings} disabled={savingSettings}
                className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50">保存</button>
              <button onClick={() => setEditingSettings(false)}
                className="px-3 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50">キャンセル</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">挨拶メッセージ（友達追加・再フォロー時に送信）</p>
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans bg-gray-50 rounded p-3 border border-gray-100">{settings.welcome_text ?? '未設定'}</pre>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">「電話/チャットで相談する」返信メッセージ</p>
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans bg-gray-50 rounded p-3 border border-gray-100">{settings.consult_phone_text ?? '未設定'}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
