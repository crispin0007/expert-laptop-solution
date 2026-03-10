import React, { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import { ThemeProvider } from '@/theme/ThemeContext'
import { ToastContainer } from '@/components/ui/Toast'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { useUiStore } from '@/store/uiStore'
import { AuthGuard } from '@/guards/AuthGuard'
import { useAuthBootstrap, useBiometricLock } from '@/hooks/useAuth'
import { usePushNotifications } from '@/hooks/usePushNotifications'

// ── Query client ──────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // 1 minute default
      gcTime: 10 * 60_000,        // 10 minutes default
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: 1,
    },
  },
})



// ── Offline detector ──────────────────────────────────────────────────────────
function NetInfoWatcher() {
  const setOffline = useUiStore((s) => s.setOffline)
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOffline(!state.isConnected)
    })
    return () => unsub()
  }, [])
  return null
}

// ── Root app shell ────────────────────────────────────────────────────────────
function AppShell() {
  useAuthBootstrap()
  useBiometricLock()
  usePushNotifications()

  return (
    <>
      <AuthGuard>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </AuthGuard>
      <ToastContainer />
      <OfflineBanner />
    </>
  )
}

// ── Root layout ───────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <NetInfoWatcher />
            <StatusBar style="auto" />
            <AppShell />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
