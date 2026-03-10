import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { useAuthStore } from '@/store/authStore'
import { registerPushToken, deregisterPushToken } from './useAuth'

// Expo Go does not support remote push notifications from SDK 53+.
// All push notification setup is skipped when running in Expo Go.
const IS_EXPO_GO = Constants.appOwnership === 'expo'

// ── Foreground notification behaviour ─────────────────────────────────────────
if (!IS_EXPO_GO) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

// ── Helper: request permission + get Expo push token ─────────────────────────
async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    // Simulators cannot receive real push notifications
    return null
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId

  if (!projectId) {
    console.warn('[PushNotifications] EAS project ID not configured — skipping token registration')
    return null
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })
    return tokenData.data
  } catch (e) {
    console.warn('[PushNotifications] Failed to get push token:', e)
    return null
  }
}

// ── Main hook ─────────────────────────────────────────────────────────────────
/**
 * Call once in the root layout (inside AppShell).
 * Handles permission request, token registration, background-tap routing,
 * and cleanup on logout.
 */
export function usePushNotifications() {
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const registeredToken = useRef<string | null>(null)

  // Android notification channel
  useEffect(() => {
    if (IS_EXPO_GO || Platform.OS !== 'android') return
    Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4f46e5',
    })
  }, [])

  // Register / deregister token based on auth state
  useEffect(() => {
    if (IS_EXPO_GO) return
    if (!accessToken) {
      if (registeredToken.current) {
        deregisterPushToken(registeredToken.current)
        registeredToken.current = null
      }
      return
    }
    getExpoPushToken().then((token) => {
      if (!token) return
      registeredToken.current = token
      const platform = Platform.OS === 'ios' ? 'ios' : 'android'
      registerPushToken(token, platform)
    })
  }, [accessToken])

  // Handle tap on a notification that opened the app from background / quit
  useEffect(() => {
    if (IS_EXPO_GO) return
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>
      handleNotificationNavigation(data, router)
    })
    return () => sub.remove()
  }, [router])

  // Foreground notification listener (no-op navigation — banner is enough)
  useEffect(() => {
    if (IS_EXPO_GO) return
    const sub = Notifications.addNotificationReceivedListener(() => {})
    return () => sub.remove()
  }, [])

  // Cold-start: app launched via notification tap
  useEffect(() => {
    if (IS_EXPO_GO) return
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return
      const data = response.notification.request.content.data as Record<string, unknown>
      handleNotificationNavigation(data, router)
    })
  }, [])
}

// ── Navigation helper ─────────────────────────────────────────────────────────
function handleNotificationNavigation(
  data: Record<string, unknown>,
  router: ReturnType<typeof useRouter>,
) {
  const type = data?.source_type as string | undefined
  const id = data?.source_id as number | string | undefined

  if (!type || !id) return

  switch (type) {
    case 'ticket':
      router.push(`/(app)/(tabs)/tickets/${id}` as never)
      break
    case 'project':
      router.push(`/(app)/(tabs)/projects/${id}` as never)
      break
    default:
      // General notification — open the notifications list
      router.push('/(app)/notifications' as never)
  }
}
