import React, { useEffect } from 'react'
import { useRouter, useSegments } from 'expo-router'
import { useAuthStore } from '@/store/authStore'

/**
 * Redirects unauthenticated users to login.
 * Place this in the (app) root _layout so it wraps all protected routes.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const segments = useSegments()
  const accessToken = useAuthStore((s) => s.accessToken)
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped)

  useEffect(() => {
    if (!isBootstrapped) return

    const inAuth = segments[0] === '(auth)'

    if (!accessToken && !inAuth) {
      router.replace('/(auth)/login')
    } else if (accessToken && inAuth) {
      router.replace('/(app)/(tabs)/dashboard')
    }
  }, [accessToken, isBootstrapped, segments])

  return <>{children}</>
}
