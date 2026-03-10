/**
 * ModuleGuard — Layer 1 access control (subscription / tenant plan).
 *
 * Hides or replaces content when the current tenant's active subscription
 * does not include the requested module. This sits ABOVE RoleGuard in the
 * hierarchy: a module must be active before individual role permissions apply.
 *
 * Usage:
 *   <ModuleGuard module="tickets">
 *     <TicketList />
 *   </ModuleGuard>
 *
 *   <ModuleGuard module="accounting" fallback={<ModuleLockedScreen module="Accounting" />}>
 *     <AccountingScreen />
 *   </ModuleGuard>
 */
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { useModules } from '@/hooks/useModules'
import type { ModuleKey } from '@/store/authStore'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ModuleGuardProps {
  /** Module key matching backend Module.key slug (e.g. 'tickets', 'projects') */
  module: ModuleKey
  /** Rendered when module is not active. Defaults to null (renders nothing). */
  fallback?: React.ReactNode
  children: React.ReactNode
}

// ---------------------------------------------------------------------------
// Guard Component
// ---------------------------------------------------------------------------

export function ModuleGuard({ module, fallback = null, children }: ModuleGuardProps) {
  const { has } = useModules()

  if (!has(module)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

// ---------------------------------------------------------------------------
// ModuleLockedScreen — full-screen locked state shown when module is not
// included in the tenant's subscription plan.
// ---------------------------------------------------------------------------

interface ModuleLockedScreenProps {
  /** Human-readable module name shown to the user (e.g. "Tickets", "Accounting") */
  module: string
  /** Optional custom message. Falls back to a generic contact-admin message. */
  message?: string
}

export function ModuleLockedScreen({ module, message }: ModuleLockedScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Ionicons name="lock-closed-outline" size={56} color="#9CA3AF" />
      </View>

      <Text style={styles.title}>{module} is not available</Text>

      <Text style={styles.body}>
        {message ??
          `The ${module} module is not included in your current plan.\nContact your administrator to enable access.`}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#F9FAFB',
  },
  iconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
})
