import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import apiClient from '@/api/client'
import { AUTH, TENANT } from '@/api/endpoints'
import { useAuthStore, type User } from '@/store/authStore'
import { useTenantStore, type TenantConfig } from '@/store/tenantStore'
import { useTheme } from '@/theme/ThemeContext'
import { useUiStore } from '@/store/uiStore'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

// ── Schemas ────────────────────────────────────────────────────────────────
const tenantSchema = z.object({
  slug: z.string().min(1, 'Workspace slug is required').toLowerCase().trim(),
})

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type TenantForm = z.infer<typeof tenantSchema>
type LoginForm = z.infer<typeof loginSchema>

// ── Two-factor token type check ─────────────────────────────────────────────
function isTwoFAPending(data: unknown): data is { requires_2fa: true; two_factor_token: string } {
  return typeof data === 'object' && data !== null && (data as Record<string, unknown>).requires_2fa === true
}

// ── Screen ─────────────────────────────────────────────────────────────────
type Step = 'tenant' | 'credentials'

export default function LoginScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { setTokens, setUser } = useAuthStore.getState()
  const { setTenant } = useTenantStore.getState()
  const showToast = useUiStore((s) => s.showToast)

  const [step, setStep] = useState<Step>('tenant')
  const [resolvingTenant, setResolvingTenant] = useState(false)
  const [resolvedSlug, setResolvedSlug] = useState('')

  const tenantForm = useForm<TenantForm>({
    resolver: zodResolver(tenantSchema),
    defaultValues: { slug: '' },
  })

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  // ── Step 1: Resolve tenant ───────────────────────────────────────────────
  async function handleResolveTenant(data: TenantForm) {
    setResolvingTenant(true)
    try {
      // Public endpoint — no auth required
      const { default: axios } = await import('axios')
      const Constants = (await import('expo-constants')).default
      const base: string =
        Constants.expoConfig?.extra?.apiBaseUrl ?? 'https://bms.techyatra.com.np/api/v1'

      // Accept full domain/URL input — extract just the subdomain slug.
      // e.g. "els.bms.techyatra.com.np" or "https://els.bms.techyatra.com.np" → "els"
      let slug = data.slug.trim().toLowerCase()
      try {
        // If it looks like a URL, strip the scheme first
        const withScheme = slug.startsWith('http') ? slug : `https://${slug}`
        const hostname = new URL(withScheme).hostname  // "els.bms.techyatra.com.np"
        // If the hostname contains dots it's a domain — take the first label as slug
        if (hostname.includes('.')) {
          slug = hostname.split('.')[0]
        }
      } catch {
        // Not a parseable URL — treat the raw input as the slug as-is
      }

      const res = await axios.get(`${base}${TENANT.RESOLVE}`, {
        params: { slug },
      })
      const tenantData: TenantConfig = res.data.data ?? res.data
      setTenant(tenantData)
      setResolvedSlug(slug)
      setStep('credentials')
    } catch (err: unknown) {
      const httpStatus = (err as { response?: { status?: number } })?.response?.status
      if (httpStatus === 404) {
        // Real 404 — slug is not a registered workspace
        tenantForm.setError('slug', { message: `No workspace found for "${slug}". Check the slug and try again.` })
      } else {
        // Network error or server issue — proceed optimistically.
        // Login itself will fail fast if the slug is wrong (X-Tenant-Slug header).
        setTenant({ slug, name: slug, logo: '', primary_color: '#4f46e5', currency: 'NPR', vat_enabled: false, vat_rate: '13.00' })
        setResolvedSlug(slug)
        setStep('credentials')
      }
    } finally {
      setResolvingTenant(false)
    }
  }

  // ── Step 2: Login ────────────────────────────────────────────────────────
  async function handleLogin(data: LoginForm) {
    try {
      const res = await apiClient.post(AUTH.TOKEN, {
        email: data.email,
        password: data.password,
      })
      const payload = res.data.data ?? res.data

      // 2FA required — navigate to verify screen
      if (isTwoFAPending(payload)) {
        router.push({
          pathname: '/(auth)/verify-2fa',
          params: { two_factor_token: payload.two_factor_token },
        })
        return
      }

      // Direct login success
      await setTokens(payload.access, payload.refresh)
      const meRes = await apiClient.get(AUTH.ME)
      const user: User = meRes.data.data ?? meRes.data
      setUser(user)

      showToast(`Welcome back, ${user.full_name}!`, 'success')
      router.replace('/(app)/(tabs)/dashboard')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { errors?: { detail?: string } } } })
        ?.response?.data?.errors?.detail
      loginForm.setError('password', { message: detail ?? 'Invalid email or password.' })
    }
  }

  const tenant = useTenantStore((s) => s.tenant)

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
          backgroundColor: theme.colors.background,
          justifyContent: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / Brand */}
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <View style={{
            width: 72, height: 72, borderRadius: 20,
            backgroundColor: theme.primary[600],
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff' }}>N</Text>
          </View>
          <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.extrabold, color: theme.colors.text }}>
            {tenant?.name ?? 'NEXUS BMS'}
          </Text>
          <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted, marginTop: 4 }}>
            {step === 'tenant' ? 'Enter your workspace to continue' : 'Sign in to your account'}
          </Text>
        </View>

        {/* Card */}
        <View style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.xl,
          padding: 24,
          gap: 20,
          ...theme.shadow.md,
        }}>
          {/* ── Step 1: Tenant slug ── */}
          {step === 'tenant' && (
            <>
              <Controller
                control={tenantForm.control}
                name="slug"
                render={({ field, fieldState }) => (
                  <Input
                    label="Workspace"
                    placeholder="els  or  els.bms.techyatra.com.np"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    required
                    hint="Enter your workspace slug or full domain"
                  />
                )}
              />
              <Button
                label={resolvingTenant ? 'Looking up workspace…' : 'Continue'}
                onPress={tenantForm.handleSubmit(handleResolveTenant)}
                loading={resolvingTenant}
                fullWidth
                size="lg"
              />
            </>
          )}

          {/* ── Step 2: Credentials ── */}
          {step === 'credentials' && (
            <>
              {/* Resolved workspace banner */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: theme.primary[50], borderRadius: theme.radius.md,
                paddingHorizontal: 12, paddingVertical: 8,
              }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary[500] }} />
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.primary[700], fontWeight: theme.fontWeight.medium }}>
                  {resolvedSlug}
                </Text>
                <TouchableOpacity onPress={() => setStep('tenant')} style={{ marginLeft: 'auto' }}>
                  <Text style={{ fontSize: theme.fontSize.xs, color: theme.primary[600] }}>Change</Text>
                </TouchableOpacity>
              </View>

              <Controller
                control={loginForm.control}
                name="email"
                render={({ field, fieldState }) => (
                  <Input
                    label="Email"
                    placeholder="you@company.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />

              <Controller
                control={loginForm.control}
                name="password"
                render={({ field, fieldState }) => (
                  <Input
                    label="Password"
                    placeholder="••••••••"
                    secureTextEntry
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />

              <Button
                label={loginForm.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
                onPress={loginForm.handleSubmit(handleLogin)}
                loading={loginForm.formState.isSubmitting}
                fullWidth
                size="lg"
              />
            </>
          )}
        </View>

        <Text style={{ textAlign: 'center', marginTop: 24, fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
          Two-factor authentication is supported
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
