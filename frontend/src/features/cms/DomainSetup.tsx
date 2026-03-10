/**
 * frontend/src/features/cms/DomainSetup.tsx
 * Custom domain setup: enter domain → display TXT verification record → verify.
 */
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link2, CheckCircle, Clock, AlertCircle, Copy } from 'lucide-react'
import { useCMSCustomDomain, useSetupCMSCustomDomain, useVerifyCMSCustomDomain } from './hooks'

export default function DomainSetup() {
  const { data: domain, isLoading } = useCMSCustomDomain()
  const setupMutation  = useSetupCMSCustomDomain()
  const verifyMutation = useVerifyCMSCustomDomain()

  const [domainInput, setDomainInput] = useState('')

  const handleSetup = async () => {
    const d = domainInput.trim().toLowerCase().replace(/^https?:\/\//, '')
    if (!d) { toast.error('Enter a domain name'); return }
    try {
      await setupMutation.mutateAsync({ domain: d })
      toast.success('Domain registered — add the TXT record to verify')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors?.[0]
      toast.error(msg ?? 'Failed to register domain')
    }
  }

  const handleVerify = async () => {
    try {
      const result = await verifyMutation.mutateAsync()
      if (result?.is_verified) {
        toast.success('Domain verified!')
      } else {
        toast.error('TXT record not found yet — DNS can take up to 48 hours to propagate.')
      }
    } catch {
      toast.error('Verification check failed')
    }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-indigo-600" />
          <h2 className="text-sm font-semibold text-gray-700">Custom Domain</h2>
        </div>

        {!domain ? (
          /* No domain yet */
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Connect a custom domain (e.g. <code className="bg-gray-100 px-1 rounded">www.yourbusiness.com</code>) to your site.
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={domainInput}
                onChange={e => setDomainInput(e.target.value)}
                placeholder="www.yourbusiness.com"
                onKeyDown={e => e.key === 'Enter' && handleSetup()}
              />
              <button
                onClick={handleSetup}
                disabled={setupMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {setupMutation.isPending ? 'Setting up…' : 'Connect Domain'}
              </button>
            </div>
          </div>
        ) : (
          /* Domain registered */
          <div className="space-y-5">
            {/* Status */}
            <div className="flex items-center gap-2">
              {domain.is_verified ? (
                <><CheckCircle size={16} className="text-emerald-500" /><span className="text-sm text-emerald-700 font-medium">Verified</span></>
              ) : (
                <><Clock size={16} className="text-amber-500" /><span className="text-sm text-amber-700 font-medium">Pending verification</span></>
              )}
              <span className="text-sm text-gray-700 ml-2 font-mono">{domain.domain}</span>
            </div>

            {/* SSL */}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              {domain.ssl_status === 'active' ? (
                <><CheckCircle size={14} className="text-emerald-500" /> SSL Active</>
              ) : domain.ssl_status === 'failed' ? (
                <><AlertCircle size={14} className="text-red-500" /> SSL Failed</>
              ) : (
                <><Clock size={14} className="text-amber-500" /> SSL Pending (auto-provisioned after verification)</>
              )}
            </div>

            {/* TXT record instructions */}
            {!domain.is_verified && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800">
                  Add this TXT record to your domain's DNS settings to verify ownership:
                </p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Type</p>
                    <code className="block text-sm bg-white border border-gray-200 rounded px-3 py-1.5">TXT</code>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Name / Host</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 block text-sm bg-white border border-gray-200 rounded px-3 py-1.5 truncate">
                        _nexus-verify.{domain.domain}
                      </code>
                      <button onClick={() => copy(`_nexus-verify.${domain.domain}`)} className="text-gray-400 hover:text-indigo-600">
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Value</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 block text-sm bg-white border border-gray-200 rounded px-3 py-1.5 truncate">
                        {domain.txt_record}
                      </code>
                      <button onClick={() => copy(domain.txt_record)} className="text-gray-400 hover:text-indigo-600">
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  DNS changes can take up to 48 hours to propagate. Once added, click Verify below
                  or wait — verification runs automatically every 5 minutes.
                </p>
                <button
                  onClick={handleVerify}
                  disabled={verifyMutation.isPending}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {verifyMutation.isPending ? 'Checking…' : 'Check Now'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
