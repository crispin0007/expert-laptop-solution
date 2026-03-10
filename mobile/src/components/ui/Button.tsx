import React from 'react'
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native'
import { useTheme } from '@/theme/ThemeContext'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  icon?: React.ReactNode
  fullWidth?: boolean
  style?: ViewStyle
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
}: ButtonProps) {
  const theme = useTheme()

  const isDisabled = disabled || loading

  const containerStyles: Record<Variant, ViewStyle> = {
    primary: {
      backgroundColor: isDisabled ? theme.primary[300] : theme.primary[600],
    },
    secondary: {
      backgroundColor: theme.primary[100],
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: theme.primary[500],
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    destructive: {
      backgroundColor: isDisabled ? theme.colors.errorLight : theme.colors.error,
    },
  }

  const textStyles: Record<Variant, TextStyle> = {
    primary: { color: theme.colors.textInverse },
    secondary: { color: theme.primary[700] },
    outline: { color: theme.primary[600] },
    ghost: { color: theme.primary[600] },
    destructive: { color: theme.colors.textInverse },
  }

  const sizePad: Record<Size, ViewStyle> = {
    sm: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs + 2, borderRadius: theme.radius.md },
    md: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm + 2, borderRadius: theme.radius.md },
    lg: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md, borderRadius: theme.radius.lg },
  }

  const textSize: Record<Size, TextStyle> = {
    sm: { fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold },
    md: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    lg: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold },
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
          opacity: isDisabled ? 0.65 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        containerStyles[variant],
        sizePad[size],
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'destructive' ? '#fff' : theme.primary[600]}
        />
      ) : (
        icon
      )}
      <Text style={[textStyles[variant], textSize[size]]}>{label}</Text>
    </TouchableOpacity>
  )
}
