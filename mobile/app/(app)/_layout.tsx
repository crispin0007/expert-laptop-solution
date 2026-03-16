import { Stack } from 'expo-router'
import { TenantGuard } from '@/guards/TenantGuard'
import { AppDrawer } from '@/components/ui/AppDrawer'

export default function AppLayout() {
  return (
    <TenantGuard>
      <AppDrawer>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notifications/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="profile/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="profile/2fa" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="tickets/new" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="staff/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="staff/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="departments/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="roles/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="accounting/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="cms/index" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </AppDrawer>
    </TenantGuard>
  )
}
