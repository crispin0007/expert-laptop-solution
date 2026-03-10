import React, { useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, Animated, Dimensions,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, usePathname } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDrawerStore } from '@/store/drawerStore'
import { useModules, } from '@/hooks/useModules'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore, ModuleKey } from '@/store/authStore'
import { useTenantStore } from '@/store/tenantStore'
import { useTheme } from '@/theme/ThemeContext'

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.82, 320)

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface NavItem {
  label: string
  icon: IoniconName
  iconActive: IoniconName
  route: string
  /** Layer 2: role-based permission (checked after module gate) */
  permission?: string
  /** Layer 1: subscription module gate — hide item if module not in tenant plan */
  module?: ModuleKey
  isTab?: boolean
}

const MAIN_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'grid-outline', iconActive: 'grid', route: '/(app)/(tabs)/dashboard', isTab: true },
  { label: 'Tickets', icon: 'document-text-outline', iconActive: 'document-text', route: '/(app)/(tabs)/tickets', module: 'tickets', permission: 'tickets.view', isTab: true },
  { label: 'Projects', icon: 'briefcase-outline', iconActive: 'briefcase', route: '/(app)/(tabs)/projects', module: 'projects', permission: 'projects.view', isTab: true },
  { label: 'Customers', icon: 'people-outline', iconActive: 'people', route: '/(app)/(tabs)/customers', module: 'customers', permission: 'customers.view', isTab: true },
]

const MANAGE_ITEMS: NavItem[] = [
  // Core modules — always shown (no module gate)
  { label: 'Staff', icon: 'person-circle-outline', iconActive: 'person-circle', route: '/(app)/staff', permission: 'staff.view' },
  { label: 'Departments', icon: 'business-outline', iconActive: 'business', route: '/(app)/departments', permission: 'staff.view' },
  { label: 'Roles', icon: 'shield-outline', iconActive: 'shield', route: '/(app)/roles', permission: 'settings.manage' },
  // Optional modules — subscription-gated
  { label: 'Accounting', icon: 'cash-outline', iconActive: 'cash', route: '/(app)/accounting', module: 'accounting', permission: 'accounting.view' },
  // Core
  { label: 'Settings', icon: 'settings-outline', iconActive: 'settings', route: '/(app)/settings', permission: 'settings.manage' },
]

const EXTRA_ITEMS: NavItem[] = [
  { label: 'Notifications', icon: 'notifications-outline', iconActive: 'notifications', route: '/(app)/notifications' },
  { label: 'My Profile', icon: 'person-outline', iconActive: 'person', route: '/(app)/profile' },
]

export function AppDrawer({ children }: { children: React.ReactNode }) {
  const theme = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const isOpen = useDrawerStore((s) => s.isOpen)
  const user = useAuthStore((s) => s.user)
  const { has: hasModule } = useModules()
  const { can: hasPermission } = usePermissions()
  const tenant = useTenantStore((s) => s.tenant)

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: isOpen ? 0 : -DRAWER_WIDTH,
        useNativeDriver: true,
        stiffness: 300,
        damping: 28,
        mass: 0.8,
      }),
      Animated.timing(opacity, {
        toValue: isOpen ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()
  }, [isOpen])

  // Close synchronously via store, then navigate after animation starts
  function handleClose() {
    useDrawerStore.getState().close()
  }

  function navigateTo(route: string, isTab = false) {
    // Close the drawer immediately
    useDrawerStore.getState().close()
    // Wait for animation to at least start before navigating
    setTimeout(() => {
      if (isTab) {
        router.replace(route as never)
      } else {
        router.push(route as never)
      }
    }, 150)
  }

  function isActive(route: string): boolean {
    const segment = route
      .replace('/(app)/(tabs)/', '')
      .replace('/(app)/', '')
      .split('/')[0]
    return pathname.includes(segment)
  }

  const renderItem = (item: NavItem) => {
    // Layer 1: subscription module gate (same as web sidebar: modules.has('tickets'))
    if (item.module && !hasModule(item.module)) return null
    // Layer 2: role-based permission gate (same as web sidebar: perms.can('can_view_tickets'))
    if (item.permission && !hasPermission(item.permission as never)) return null
    const active = isActive(item.route)
    return (
      <TouchableOpacity
        key={item.label}
        onPress={() => navigateTo(item.route, item.isTab)}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 11,
          borderRadius: 12,
          marginHorizontal: 10,
          marginVertical: 1,
          backgroundColor: active ? `${theme.primary[500]}18` : 'transparent',
        }}
      >
        <View style={{
          width: 34, height: 34, borderRadius: 10,
          backgroundColor: active ? theme.primary[600] : `${theme.primary[500]}12`,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons
            name={active ? item.iconActive : item.icon}
            size={18}
            color={active ? '#fff' : theme.primary[600]}
          />
        </View>
        <Text style={{
          flex: 1, fontSize: 14,
          fontWeight: active ? '700' : '500',
          color: active ? theme.primary[700] : theme.colors.text,
        }}>
          {item.label}
        </Text>
        {active && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.primary[600] }} />}
      </TouchableOpacity>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {children}

      {/* Backdrop — always mounted, hidden via opacity + pointerEvents */}
      <Animated.View
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          opacity,
          zIndex: 998,
          pointerEvents: isOpen ? 'auto' : 'none',
        } as any}
      >
        {/* Full-area pressable to close */}
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={handleClose}
        />
      </Animated.View>

      {/* Drawer panel — always mounted, slides in/out */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0, left: 0, bottom: 0,
          width: DRAWER_WIDTH,
          backgroundColor: theme.colors.surface,
          transform: [{ translateX }],
          zIndex: 999,
          shadowColor: '#000',
          shadowOffset: { width: 4, height: 0 },
          shadowOpacity: 0.2,
          shadowRadius: 20,
          elevation: 24,
          pointerEvents: isOpen ? 'auto' : 'none',
        } as any}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Header */}
          <View style={{
            paddingTop: insets.top + 16,
            paddingBottom: 20,
            paddingHorizontal: 18,
            backgroundColor: theme.primary[600],
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 1, textTransform: 'uppercase' }}>
                {tenant?.name ?? 'NEXUS BMS'}
              </Text>
              {/* Close button — large hit area */}
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 50, height: 50, borderRadius: 25,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
              }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>
                  {user?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }} numberOfLines={1}>
                  {user?.full_name}
                </Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, marginTop: 4 }}>
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.9)', fontWeight: '700', textTransform: 'capitalize' }}>
                    {user?.role}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Main nav */}
          <View style={{ paddingTop: 12 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 20, paddingBottom: 6 }}>
              Main
            </Text>
            {MAIN_ITEMS.map(renderItem)}
          </View>

          <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 18, marginVertical: 12 }} />

          <View>
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 20, paddingBottom: 6 }}>
              Manage
            </Text>
            {MANAGE_ITEMS.map(renderItem)}
          </View>

          <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 18, marginVertical: 12 }} />

          {EXTRA_ITEMS.map(renderItem)}
        </ScrollView>
      </Animated.View>
    </View>
  )
}

/** Hamburger button — place in any screen header */
export function DrawerToggle({ color, light }: { color?: string; light?: boolean }) {
  const theme = useTheme()
  const iconColor = color ?? (light ? theme.colors.text : '#fff')
  const bgColor = light ? theme.colors.background : 'rgba(255,255,255,0.15)'
  return (
    <TouchableOpacity
      onPress={() => useDrawerStore.getState().toggle()}
      hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
      style={{
        width: 38, height: 38, borderRadius: 10,
        backgroundColor: bgColor,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: light ? 1 : 0,
        borderColor: light ? theme.colors.border : 'transparent',
      }}
    >
      <Ionicons name="menu-outline" size={22} color={iconColor} />
    </TouchableOpacity>
  )
}
