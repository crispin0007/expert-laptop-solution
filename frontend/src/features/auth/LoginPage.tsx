import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogin, useTwoFAVerify, isTwoFAPending } from './useLogin'
import { useAuthStore } from '../../store/authStore'
import { useTenantStore } from '../../store/tenantStore'
import apiClient from '../../api/client'
import toast from 'react-hot-toast'
import { ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const verify2FA = useTwoFAVerify()
  const { clearTenant } = useTenantStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState<string | null>(null)

  // 2FA pending state
  const [twoFAToken, setTwoFAToken] = useState<string | null>(null)
  const [otpCode, setOtpCode] = useState('')

  // Always clear any stale tenant slug when the login page loads.
  // This prevents persisted localStorage from a previous tenant session
  // from being sent as X-Tenant-Slug on the login POST, which would cause
  // the backend to reject superadmin logins with 401.
  useEffect(() => { clearTenant() }, [clearTenant])

  useEffect(() => {
    // Only fetch tenant branding when on a tenant subdomain.
    // On localhost / bare IP (super-admin root domain) this endpoint always
    // returns 404 by design — skip the call to avoid console noise.
    const hostname = window.location.hostname
    const isRootDomain =
      hostname === 'localhost' ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname) ||   // bare IP
      hostname === (import.meta.env.VITE_ROOT_DOMAIN ?? '')

    if (isRootDomain) return

    apiClient.get('/tenants/public-info/')
      .then((r) => { if (r.data?.name) setTenantName(r.data.name) })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const result = await login.mutateAsync({ email, password })
      if (isTwoFAPending(result)) {
        setTwoFAToken(result.two_factor_token)
        return
      }
      redirectAfterLogin()
    } catch {
      toast.error('Invalid email or password. Please try again.')
    }
  }

  async function handleOTPSubmit(e: FormEvent) {
    e.preventDefault()
    if (!twoFAToken) return
    try {
      await verify2FA.mutateAsync({ two_factor_token: twoFAToken, code: otpCode.trim() })
      redirectAfterLogin()
    } catch {
      toast.error('Invalid code. Please try again.')
      setOtpCode('')
    }
  }

  function redirectAfterLogin() {
    const storedUser = useAuthStore.getState().user
    if (storedUser?.is_superadmin || storedUser?.domain_type === 'main') {
      toast.success('Welcome back, Super Admin!')
    } else {
      toast.success('Welcome back!')
    }
    navigate('/')
  }

  // ── OTP step ─────────────────────────────────────────────────────────────
  if (twoFAToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-50 mb-4">
              <ShieldCheck size={28} className="text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Enter the 6-digit code from your authenticator app, or an 8-character backup code.
            </p>
          </div>

          <form onSubmit={handleOTPSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\s/g, ''))}
                placeholder="123456 or backup code"
                maxLength={8}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={verify2FA.isPending || otpCode.length < 6}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {verify2FA.isPending ? 'Verifying…' : 'Verify & Sign In'}
            </button>
          </form>

          <button
            onClick={() => { setTwoFAToken(null); setOtpCode('') }}
            className="mt-4 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition mx-auto"
          >
            <ArrowLeft size={14} /> Back to sign in
          </button>

          <p className="mt-5 text-center text-xs text-gray-400">
            Lost your authenticator?{' '}
            <span className="text-indigo-500 font-medium">
              Enter one of your 8-character backup codes above.
            </span>
          </p>
        </div>
      </div>
    )
  }

  // ── Credentials step ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-indigo-600 tracking-tight">
            {tenantName ?? 'NEXUS BMS'}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 flex items-center gap-1.5 justify-center text-xs text-gray-400">
          <KeyRound size={12} />
          Two-factor authentication is supported
        </div>
      </div>
    </div>
  )
}

