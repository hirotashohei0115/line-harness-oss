'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Sidebar from './layout/sidebar'
import AuthGuard from './auth-guard'
import { AccountProvider } from '@/contexts/account-context'
import SessionExpiredModal from './session-expired-modal'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

// グローバルな401ハンドラを登録する仕組み
let globalSessionExpiredHandler: (() => void) | null = null
export function triggerSessionExpired() {
  if (globalSessionExpiredHandler) globalSessionExpiredHandler()
}

// JWTペイロードの有効期限を取得
function getTokenExp(token: string): number | null {
  try {
    const [, payload] = token.split('.')
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof decoded.exp === 'number' ? decoded.exp : null
  } catch { return null }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sessionExpired, setSessionExpired] = useState(false)
  const isLoginPage = pathname === '/login' || pathname === '/login/'

  // 401ハンドラを登録
  useEffect(() => {
    globalSessionExpiredHandler = () => setSessionExpired(true)
    return () => { globalSessionExpiredHandler = null }
  }, [])

  // トークン自動更新: 残り1日以内なら更新
  const tryRefreshToken = useCallback(async () => {
    const token = localStorage.getItem('lh_api_key')
    if (!token) return
    const exp = getTokenExp(token)
    if (!exp) return
    const remaining = exp - Math.floor(Date.now() / 1000)
    if (remaining > 86400) return // 1日より多く残っていれば不要

    try {
      const res = await fetch(`${API_URL}/api/staff/refresh-token`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json() as { success: boolean; data?: { token: string } }
        if (data.success && data.data?.token) {
          localStorage.setItem('lh_api_key', data.data.token)
        }
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (pathname === '/login' || pathname === '/login/') return
    tryRefreshToken()
    const id = setInterval(tryRefreshToken, 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [pathname, tryRefreshToken])

  // ログイン後の遷移でセッション切れ状態をリセット
  useEffect(() => {
    if (!isLoginPage && sessionExpired && localStorage.getItem('lh_api_key')) {
      setSessionExpired(false)
    }
  }, [pathname, sessionExpired, isLoginPage])
  if (isLoginPage) {
    return <>{children}</>
  }

  const handleLogin = () => {
    localStorage.removeItem('lh_api_key')
    localStorage.removeItem('lh_staff_name')
    localStorage.removeItem('lh_staff_role')
    localStorage.removeItem('lh_staff_id')
    router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
  }

  return (
    <AuthGuard>
      <AccountProvider>
        {sessionExpired && <SessionExpiredModal onLogin={handleLogin} />}
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 pt-[72px] px-4 pb-24 sm:px-6 lg:pt-8 lg:px-8 lg:pb-24 overflow-auto">
            {children}
          </main>
        </div>
      </AccountProvider>
    </AuthGuard>
  )
}
