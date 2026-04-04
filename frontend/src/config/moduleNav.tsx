/**
 * moduleNav.tsx — Central module navigation registry.
 *
 * HOW TO ADD A NEW MODULE
 * ───────────────────────
 * 1. Backend: create module.py + migration + add module to the right plan.
 * 2. Backend: add permission keys to accounts/serializers.py + authStore.ts interface.
 * 3. Frontend: add one entry to MODULE_SECTIONS (below) or MODULE_ITEMS.
 * 4. Frontend: add the route to Router.tsx.
 * That's it — the sidebar auto-renders with zero further changes.
 *
 * REGISTRY TYPES
 * ──────────────
 * MODULE_SECTIONS → NavSection entries (modules with sub-navigation tabs/pages).
 * MODULE_ITEMS    → Simple single-link NavItem entries (rare — most modules have sub-items).
 *
 * Complex modules with deeply nested sub-sections (Tickets, Accounting, Inventory)
 * keep their own JSX in Sidebar.tsx because they need runtime permission logic
 * (e.g. "All Tickets" only for managers) — adding data-driven support for those
 * would be more code, not less.
 */

import type { ElementType, ReactNode } from 'react'
import type { UserPermissions } from '../store/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModuleSubItem = {
  to: string
  label: string
  icon: ReactNode
}

export type ModuleSectionEntry = {
  /** Must match the Module.key in the DB and the module.py id. */
  key: string
  /** Display label in the NavSection header. */
  label: string
  /** Lucide icon component used in collapsed state and the section header. */
  icon: ElementType
  /** Base URL path — used by NavSection to decide when to highlight as active. */
  basePath: string
  /**
   * Permission key from UserPermissions that the current user must have.
   * Defaults to always-visible (when the module is active).
   */
  perm?: keyof UserPermissions
  /** Sub-nav links rendered inside the section. */
  sub: ModuleSubItem[]
}

export type ModuleItemEntry = {
  key: string
  label: string
  icon: ElementType
  to: string
  perm?: keyof UserPermissions
  section: 'main' | 'people'
}

// ── MODULE_SECTIONS ───────────────────────────────────────────────────────────
// Add new modules here. NavSection with sub-items.
// ─────────────────────────────────────────────────────────────────────────────

export const MODULE_SECTIONS: ModuleSectionEntry[] = [
  // HRM is handled explicitly in Sidebar.tsx (needs manager-only tab guards)

  // ── Future Phase 2 / 3 modules go here ─────────────────────────────────────
  // Example (do NOT uncomment until Phase 2):
  // {
  //   key: 'appointments',
  //   label: 'Appointments',
  //   icon: Calendar,
  //   basePath: '/appointments',
  //   perm: 'can_view_appointments',
  //   sub: [
  //     { to: '/appointments', label: 'All Appointments', icon: <Calendar size={13} /> },
  //     { to: '/appointments/settings', label: 'Settings', icon: <Settings size={13} /> },
  //   ],
  // },
  // {
  //   key: 'crm',
  //   label: 'CRM',
  //   icon: Briefcase,
  //   basePath: '/crm',
  //   perm: 'can_view_crm',
  //   sub: [
  //     { to: '/crm?tab=leads', label: 'Leads', icon: <UserPlus size={13} /> },
  //     { to: '/crm?tab=deals', label: 'Deals', icon: <Briefcase size={13} /> },
  //   ],
  // },
]

// ── MODULE_ITEMS ──────────────────────────────────────────────────────────────
// Simple single-link NavItem modules (no sub-navigation needed).
// `section`: 'main' = above Settings divider, 'people' = inside People section.
// ─────────────────────────────────────────────────────────────────────────────

export const MODULE_ITEMS: ModuleItemEntry[] = [
  // Currently handled by SIMPLE_MODULE_NAV in Sidebar.tsx (departments, customers).
  // Add new single-page modules here instead.
]
