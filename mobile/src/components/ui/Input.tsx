import React, { forwardRef } from 'react'
import { TextInput, View, Text, TextInputProps, ViewStyle } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'

interface InputProps extends TextInputProps {
  label?: string
  hint?: string
  error?: string
  containerStyle?: ViewStyle
  required?: boolean
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, hint, error, containerStyle, required, style, ...rest }, ref) => {
    const theme = useTheme()
    const hasError = !!error

    return (
      <View style={[{ gap: 6 }, containerStyle]}>
        {label && (
          <Text style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, color: theme.colors.textSecondary }}>
            {label}
            {required && <Text style={{ color: theme.colors.error }}> *</Text>}
          </Text>
        )}
        <TextInput
          ref={ref}
          placeholderTextColor={theme.colors.textMuted}
          style={[
            {
              borderWidth: 1.5,
              borderColor: hasError ? theme.colors.error : theme.colors.border,
              borderRadius: theme.radius.md,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm + 2,
              fontSize: theme.fontSize.base,
              color: theme.colors.text,
              backgroundColor: theme.colors.surface,
            },
            style,
          ]}
          {...rest}
        />
        {hint && !error && (
          <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>{hint}</Text>
        )}
        {error && (
          <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.error }}>{error}</Text>
        )}
      </View>
    )
  },
)

Input.displayName = 'Input'
