'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { authApi, ApiError, type User } from '@/lib/api'
import { toast } from 'sonner'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { LeftPanel } from './_components/login-ui'
import { CredentialsStep } from './_components/credentials-step'
import {
  TotpStep, BackupStep, SetupLoadingStep, SetupQrStep, SetupVerifyStep, SetupCodesStep,
} from './_components/twofa-flow'

type Step =
  | 'credentials'
  | 'totp'
  | 'backup'
  | 'setup_loading'
  | 'setup_qr'
  | 'setup_verify'
  | 'setup_codes'

export default function LoginPage() {
  const { login, completeLogin } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const [step, setStep]       = useState<Step>('credentials')
  const [loading, setLoading] = useState(false)

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  const [twoFactorToken, setTwoFactorToken] = useState('')
  const [otpCode, setOtpCode]               = useState('')

  const [backupInput, setBackupInput] = useState('')

  const [setupToken, setSetupToken]     = useState('')
  const [qrCodeUrl, setQrCodeUrl]       = useState('')
  const [qrError, setQrError]           = useState(false)
  const [secret, setSecret]             = useState('')
  const [setupCode, setSetupCode]       = useState('')
  const [backupCodes, setBackupCodes]   = useState<string[]>([])
  const [pendingToken, setPendingToken] = useState('')
  const [pendingUser, setPendingUser]   = useState<User | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (step !== 'setup_loading') return
    let cancelled = false
    authApi.setup2faStart(setupToken)
      .then(res => {
        if (cancelled) return
        setQrCodeUrl(res.data.qrCodeUrl)
        setQrError(false)
        setSecret(res.data.secret)
        setStep('setup_qr')
      })
      .catch(err => {
        if (cancelled) return
        toast.error(err instanceof ApiError ? err.message : 'Xatolik yuz berdi')
        setStep('credentials')
      })
    return () => { cancelled = true }
  }, [step, setupToken])

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.step === 'requires_2fa') {
        setTwoFactorToken(result.twoFactorToken)
        setStep('totp')
      } else if (result.step === 'requires_setup') {
        setSetupToken(result.setupToken)
        setStep('setup_loading')
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.verify2fa(twoFactorToken, otpCode)
      completeLogin(res.data.accessToken, res.data.user)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Noto'g'ri kod")
      setOtpCode('')
    } finally {
      setLoading(false)
    }
  }

  const handleBackup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.backupCode(twoFactorToken, backupInput)
      completeLogin(res.data.accessToken, res.data.user)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Noto'g'ri backup kod")
    } finally {
      setLoading(false)
    }
  }

  const handleSetupVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.setup2faFinish(setupToken, setupCode)
      setBackupCodes(res.data.backupCodes)
      setPendingToken(res.data.accessToken)
      setPendingUser(res.data.user)
      setStep('setup_codes')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Noto'g'ri kod")
      setSetupCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Left branding panel ─────────────────────────────────────────── */}
      <LeftPanel />

      {/* ── Right form panel ────────────────────────────────────────────── */}
      <div
        className="relative w-full md:w-[45%] flex flex-col min-h-screen"
        style={{ background: 'var(--s-bg)' }}
      >
        {/* Theme toggle */}
        <div className="absolute top-5 right-5 z-20">
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
            style={{ color: 'var(--s-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'; (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            {mounted && resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        {/* Centered form */}
        <div className="flex-1 flex items-center justify-center px-8 sm:px-12 py-16">
          <div className="w-full max-w-[360px]">
            <AnimatePresence mode="wait">
              {step === 'credentials' && (
                <CredentialsStep
                  email={email} setEmail={setEmail}
                  password={password} setPassword={setPassword}
                  loading={loading} onSubmit={handleCredentials}
                />
              )}

              {step === 'totp' && (
                <TotpStep
                  otpCode={otpCode} setOtpCode={setOtpCode}
                  loading={loading} onSubmit={handleTotp}
                  onBack={() => setStep('credentials')}
                  onUseBackup={() => setStep('backup')}
                />
              )}

              {step === 'backup' && (
                <BackupStep
                  backupInput={backupInput} setBackupInput={setBackupInput}
                  loading={loading} onSubmit={handleBackup}
                  onBack={() => setStep('totp')}
                />
              )}

              {step === 'setup_loading' && <SetupLoadingStep />}

              {step === 'setup_qr' && (
                <SetupQrStep
                  qrCodeUrl={qrCodeUrl} qrError={qrError} setQrError={setQrError}
                  secret={secret} onContinue={() => setStep('setup_verify')}
                />
              )}

              {step === 'setup_verify' && (
                <SetupVerifyStep
                  setupCode={setupCode} setSetupCode={setSetupCode}
                  loading={loading} onSubmit={handleSetupVerify}
                  onBack={() => setStep('setup_qr')}
                />
              )}

              {step === 'setup_codes' && (
                <SetupCodesStep
                  backupCodes={backupCodes}
                  onFinish={() => pendingUser && completeLogin(pendingToken, pendingUser)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-5 text-center">
          <p className="text-[11px]" style={{ color: 'var(--s-muted)' }}>© 2026 SEASMP. Barcha huquqlar himoyalangan.</p>
        </div>
      </div>
    </div>
  )
}
