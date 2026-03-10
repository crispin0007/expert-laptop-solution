import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { useRouter } from 'expo-router'
import * as LocalAuthentication from 'expo-local-authentication'
import apiClient, { tenantBaseUrl } from '@/api/client'
import { AUTH, NOTIFICATIONS } from '@/api/endpoints'
import { useAuthStore } from '@/store/authStore'
import { useTenantStore, loadPersistedTenantAsync } from '@/store/tenantStore'

const BIOMETRIC_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export function useAuthBootstrap() {
  const { bootstrap, setTokens, setUserFromApi, clearAuth } = useAuthStore.getState()
  const router = useRouter()

  useEffect(() => {
    async function init() {
      // Restore persisted tenant into store before anything else
      await loadPersistedTenantAsync()

      const refreshToken = await bootstrap()
      if (!refreshToken) {
        router.replace('/(auth)/login')
        return
      }

      try {
        // Attempt to get a new access token from the stored refresh token
        const { default: axios } = await import('axios')
        const Constants = (await import('expo-constants')).default
        const base: string =
          Constants.expoConfig?.extra?.apiBaseUrl ?? 'https://bms.techyatra.com.np/api/v1'

        // Use tenant subdomain for refresh (root domain rejects staff tokens)
        const slug = useTenantStore.getState().tenant?.slug
        const refreshBase = slug ? tenantBaseUrl(slug) : base

        const res = await axios.post(
          `${refreshBase}${AUTH.REFRESH}`,
          { refresh: refreshToken },
        )
        await setTokens(res.data.access, res.data.refresh)

        // Fetch user profile and normalize nested membership fields
        const meRes = await apiClient.get(AUTH.ME)
        setUserFromApi(meRes.data.data ?? meRes.data)

        router.replace('/(app)/(tabs)/dashboard')
      } catch {
        await clearAuth()
        router.replace('/(auth)/login')
      }
    }

    init()
  }, [])
}

export function useBiometricLock() {
  const router = useRouter()
  const lastForeground = useRef<number>(Date.now())
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (!accessToken) return

    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'active') {
        const elapsed = Date.now() - lastForeground.current
        if (elapsed > BIOMETRIC_TIMEOUT_MS) {
          const hasHardware = await LocalAuthentication.hasHardwareAsync()
          const isEnrolled = await LocalAuthentication.isEnrolledAsync()

          if (hasHardware && isEnrolled) {
            const result = await LocalAuthentication.authenticateAsync({
              promptMessage: 'Verify your identity to continue',
              fallbackLabel: 'Use passcode',
              cancelLabel: 'Sign out',
            })

            if (!result.success) {
              await useAuthStore.getState().clearAuth()
              router.replace('/(auth)/login')
            }
          }
        }
      } else if (state === 'background' || state === 'inactive') {
        lastForeground.current = Date.now()
      }
    })

    return () => sub.remove()
  }, [accessToken])
}

export async function registerPushToken(expoPushToken: string, platform: 'ios' | 'android') {
  try {
    await apiClient.post(NOTIFICATIONS.DEVICES, {
      token: expoPushToken,
      platform,
    })
  } catch {
    // Non-fatal — token registration can be retried on next launch
  }
}

export async function deregisterPushToken(token: string) {
  try {
    await apiClient.delete(NOTIFICATIONS.DEVICE(token))
  } catch {
    // Non-fatal
  }
}
