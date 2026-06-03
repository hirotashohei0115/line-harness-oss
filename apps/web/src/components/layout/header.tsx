'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface HeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export default function Header({ title, description, action }: HeaderProps) {
  const [staffName, setStaffName] = useState('')
  const [staffRole, setStaffRole] = useState('')
  const router = useRouter()

  useEffect(() => {
    setStaffName(localStorage.getItem('lh_staff_name') || '')
    setStaffRole(localStorage.getItem('lh_staff_role') || '')
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('lh_api_key')
    localStorage.removeItem('lh_staff_name')
    localStorage.removeItem('lh_staff_role')
    localStorage.removeItem('lh_staff_id')
    localStorage.removeItem('lh_assigned_stores')
    router.push('/login')
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-white">{description}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {action && <div>{action}</div>}
          {staffName && (
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium text-gray-700">{staffName}</p>
                <p className="text-xs text-white">{staffRole === 'admin' ? '管理者' : staffRole === 'owner' ? 'オーナー' : 'スタッフ'}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs px-3 py-1.5 text-gray-500 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
