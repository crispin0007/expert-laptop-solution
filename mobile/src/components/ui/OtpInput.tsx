/**
 * OtpInput — segmented one-time-password input.
 *
 * Uses a single hidden TextInput that captures keystrokes, with visual-only
 * Box views for each digit. This avoids the focus-management complexity of
 * six separate TextInputs and correctly handles paste.
 *
 * Usage:
 *   <OtpInput length={6} value={otp} onChange={setOtp} />
 *   <OtpInput length={8} value={code} onChange={setCode} alphanumeric />
 */
import React, { useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native'
import { useTheme } from '@/theme/ThemeContext'

interface OtpInputProps {
  /** Number of input boxes. Default 6. */
  length?: number
  value: string
  onChange: (v: string) => void
  /** Allow letters in addition to digits (for backup codes). */
  alphanumeric?: boolean
  /** Auto-focus the hidden input when mounted. */
  autoFocus?: boolean
  /** Called when the last box is filled. */
  onComplete?: (v: string) => void
  error?: boolean
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  alphanumeric = false,
  autoFocus = false,
  onComplete,
  error = false,
}: OtpInputProps) {
  const theme = useTheme()
  const inputRef = useRef<TextInput>(null)
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  function handleChange(raw: string) {
    const cleaned = alphanumeric
      ? raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, length)
      : raw.replace(/\D/g, '').slice(0, length)
    onChange(cleaned)
    if (cleaned.length === length) onComplete?.(cleaned)
  }

  const activeIndex = Math.min(value.length, length - 1)

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => inputRef.current?.focus()}
      style={styles.container}
    >
      {/* Hidden real input */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType={alphanumeric ? 'default' : 'number-pad'}
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        style={styles.hidden}
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
      />

      {/* Visual boxes */}
      <View style={styles.boxRow}>
        {digits.map((ch, i) => {
          const isFilled = !!ch
          const isActive = i === activeIndex || (i === length - 1 && value.length >= length)
          const borderColor = error
            ? theme.colors.error
            : isActive
              ? theme.primary[500]
              : isFilled
                ? theme.primary[300]
                : theme.colors.border

          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  borderColor,
                  backgroundColor: isFilled
                    ? theme.primary[50]
                    : theme.colors.surface,
                  // gap between box pair groups (middle spacer)
                  marginLeft: length === 6 && i === 3 ? 12 : i === 0 ? 0 : 8,
                },
              ]}
            >
              {/* Cursor blink when active and empty */}
              {isActive && !ch ? (
                <View style={{ width: 2, height: 22, backgroundColor: theme.primary[500], borderRadius: 1 }} />
              ) : (
                <Text style={{ fontSize: 22, fontWeight: '700', color: theme.colors.text, includeFontPadding: false }}>
                  {ch}
                </Text>
              )}
            </View>
          )
        })}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  boxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  box: {
    width: 46,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
