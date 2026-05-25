'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/hooks/useRole'
import type { UserRole } from '@/lib/api'

interface RoleGuardProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
  redirectTo?: string
}

export function RoleGuard({ children, allowedRoles, redirectTo = '/dashboard' }: RoleGuardProps) {
  const { role } = useRole()
  const router = useRouter()

  useEffect(() => {
    if (role && !allowedRoles.includes(role as UserRole)) {
      router.replace(redirectTo)
    }
  }, [role, allowedRoles, redirectTo, router])

  if (!role || !allowedRoles.includes(role as UserRole)) return null
  return <>{children}</>
}
