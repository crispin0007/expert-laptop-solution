import React from 'react'
import { Tabs } from 'expo-router'
import { View, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/ThemeContext'
import { useAuthStore } from '@/store/authStore'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function TabIcon({
  name,
  nameActive,
  focused,
  color,
}: {
  name: IoniconName
  nameActive: IoniconName
  focused: boolean
  color: string
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 32, height: 32 }}>
      <Ionicons name={focused ? nameActive : name} size={22} color={color} />
    </View>
  )
}

export default function TabLayout() {
  const theme = useTheme()
  const hasPermission = useAuthStore((s) => s.hasPermission)

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary[600],
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 0.5,
          paddingBottom: Platform.OS === 'ios' ? 10 : 6,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 88 : 64,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 16,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 1,
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard/index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="grid-outline" nameActive="grid" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets/index"
        options={{
          title: 'Tickets',
          href: hasPermission('tickets.view') ? undefined : null,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="document-text-outline" nameActive="document-text" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="projects/index"
        options={{
          title: 'Projects',
          href: hasPermission('projects.view') ? undefined : null,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="briefcase-outline" nameActive="briefcase" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers/index"
        options={{
          title: 'Customers',
          href: hasPermission('customers.view') ? undefined : null,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="people-outline" nameActive="people" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more/index"
        options={{
          title: 'More',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="ellipsis-horizontal-circle-outline" nameActive="ellipsis-horizontal-circle" focused={focused} color={color} />
          ),
        }}
      />
      {/* Hide detail screens from tab bar AND suppress tab bar on those screens */}
      <Tabs.Screen name="tickets/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="projects/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="customers/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  )
}
