import { spacing, radius, fontSize, fontWeight, shadow } from './base'

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

// Generate tinted colour palette from a primary hex
function palette(hex: string) {
  const rgb = hexToRgb(hex) ?? { r: 79, g: 70, b: 229 } // fallback indigo
  const mix = (amount: number) => {
    const r = Math.round(rgb.r + (255 - rgb.r) * amount)
    const g = Math.round(rgb.g + (255 - rgb.g) * amount)
    const b = Math.round(rgb.b + (255 - rgb.b) * amount)
    return `rgb(${r},${g},${b})`
  }
  const darken = (amount: number) => {
    const r = Math.round(rgb.r * (1 - amount))
    const g = Math.round(rgb.g * (1 - amount))
    const b = Math.round(rgb.b * (1 - amount))
    return `rgb(${r},${g},${b})`
  }
  return {
    50: mix(0.9),
    100: mix(0.8),
    200: mix(0.6),
    300: mix(0.4),
    400: mix(0.2),
    500: hex,
    600: darken(0.1),
    700: darken(0.2),
    800: darken(0.35),
    900: darken(0.5),
  }
}

export interface Theme {
  // Brand
  primary: ReturnType<typeof palette>
  // Semantic colours
  colors: {
    background: string
    surface: string
    surfaceRaised: string
    border: string
    borderStrong: string
    text: string
    textSecondary: string
    textMuted: string
    textInverse: string
    success: string
    successLight: string
    warning: string
    warningLight: string
    error: string
    errorLight: string
    info: string
    infoLight: string
    overlay: string
  }
  // Status badge colours
  status: {
    open: { bg: string; text: string }
    in_progress: { bg: string; text: string }
    pending_customer: { bg: string; text: string }
    resolved: { bg: string; text: string }
    closed: { bg: string; text: string }
    cancelled: { bg: string; text: string }
  }
  // Priority badge colours
  priority: {
    low: { bg: string; text: string }
    medium: { bg: string; text: string }
    high: { bg: string; text: string }
    critical: { bg: string; text: string }
  }
  // Tokens
  spacing: typeof spacing
  radius: typeof radius
  fontSize: typeof fontSize
  fontWeight: typeof fontWeight
  shadow: typeof shadow
  // Tenant meta
  tenantName: string
}

export function buildTheme(config: { primary_color?: string; name?: string }): Theme {
  const p = palette(config.primary_color ?? '#4f46e5')

  return {
    primary: p,
    colors: {
      background: '#f8f9fa',
      surface: '#ffffff',
      surfaceRaised: '#ffffff',
      border: '#e5e7eb',
      borderStrong: '#d1d5db',
      text: '#111827',
      textSecondary: '#374151',
      textMuted: '#6b7280',
      textInverse: '#ffffff',
      success: '#10b981',
      successLight: '#d1fae5',
      warning: '#f59e0b',
      warningLight: '#fef3c7',
      error: '#ef4444',
      errorLight: '#fee2e2',
      info: '#3b82f6',
      infoLight: '#dbeafe',
      overlay: 'rgba(0,0,0,0.5)',
    },
    status: {
      open: { bg: '#dbeafe', text: '#1d4ed8' },
      in_progress: { bg: '#fef3c7', text: '#b45309' },
      pending_customer: { bg: '#f3e8ff', text: '#7c3aed' },
      resolved: { bg: '#d1fae5', text: '#065f46' },
      closed: { bg: '#f1f5f9', text: '#475569' },
      cancelled: { bg: '#fee2e2', text: '#b91c1c' },
    },
    priority: {
      low: { bg: '#f0fdf4', text: '#15803d' },
      medium: { bg: '#fefce8', text: '#a16207' },
      high: { bg: '#fff7ed', text: '#c2410c' },
      critical: { bg: '#fef2f2', text: '#dc2626' },
    },
    spacing,
    radius,
    fontSize,
    fontWeight,
    shadow,
    tenantName: config.name ?? 'NEXUS BMS',
  }
}
