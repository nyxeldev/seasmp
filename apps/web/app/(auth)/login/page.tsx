'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { authApi, ApiError, type User } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import { ShieldCheck, Key, Copy, ArrowLeft, Loader2 } from 'lucide-react'

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

  const [step, setStep]       = useState<Step>('credentials')
  const [loading, setLoading] = useState(false)

  // Credentials step
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  // TOTP verify step
  const [twoFactorToken, setTwoFactorToken] = useState('')
  const [otpCode, setOtpCode]               = useState('')

  // Backup code step
  const [backupInput, setBackupInput] = useState('')

  // Setup flow
  const [setupToken, setSetupToken]       = useState('')
  const [qrCodeUrl, setQrCodeUrl]         = useState('')
  const [secret, setSecret]               = useState('')
  const [setupCode, setSetupCode]         = useState('')
  const [backupCodes, setBackupCodes]     = useState<string[]>([])
  const [pendingToken, setPendingToken]   = useState('')
  const [pendingUser, setPendingUser]     = useState<User | null>(null)

  // Load QR code when entering setup_loading
  useEffect(() => {
    if (step !== 'setup_loading') return
    let cancelled = false
    authApi.setup2faStart(setupToken)
      .then(res => {
        if (cancelled) return
        setQrCodeUrl(res.data.qrCodeUrl)
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

  // ── Handlers ─────────────────────────────────────────────────────────────

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
      // 'done' → auth-context navigates to /dashboard
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

  const isWide = step === 'setup_qr' || step === 'setup_codes'

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className={`w-full ${isWide ? 'max-w-md' : 'max-w-sm'}`}>

        {/* ─── Step 1: Credentials ─────────────────────────────────────── */}
        {step === 'credentials' && (
          <>
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl">SEASMP</CardTitle>
              <CardDescription>Smart Education Platform</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCredentials} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="admin@seasmp.uz"
                    value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Parol</Label>
                  <Input id="password" type="password" placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full mt-2" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  {loading ? 'Kirilmoqda...' : 'Kirish'}
                </Button>
              </form>
              <p className="mt-4 text-xs text-muted-foreground text-center">
                Admin: admin@seasmp.uz / Admin@1234
              </p>
            </CardContent>
          </>
        )}

        {/* ─── Step 2: TOTP ────────────────────────────────────────────── */}
        {step === 'totp' && (
          <>
            <CardHeader className="pb-2">
              <button type="button" onClick={() => setStep('credentials')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2 w-fit">
                <ArrowLeft className="size-3.5" /> Orqaga
              </button>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                <CardTitle className="text-xl">Ikki bosqichli tasdiqlash</CardTitle>
              </div>
              <CardDescription>
                Authenticator ilovangizdan 6 raqamli kodni kiriting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTotp} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="otp">Tasdiqlash kodi</Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                    autoFocus
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || otpCode.length !== 6}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Kirish
                </Button>
              </form>
              <button
                type="button"
                onClick={() => setStep('backup')}
                className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
              >
                <Key className="size-3.5" />
                Backup kod ishlatish
              </button>
            </CardContent>
          </>
        )}

        {/* ─── Step 2b: Backup code ────────────────────────────────────── */}
        {step === 'backup' && (
          <>
            <CardHeader className="pb-2">
              <button type="button" onClick={() => setStep('totp')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2 w-fit">
                <ArrowLeft className="size-3.5" /> Authenticator kodiga qaytish
              </button>
              <div className="flex items-center gap-2">
                <Key className="size-5 text-primary" />
                <CardTitle className="text-xl">Backup kod</CardTitle>
              </div>
              <CardDescription>Avval saqlangan backup kodingizni kiriting</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBackup} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="backup">Backup kod</Label>
                  <Input
                    id="backup"
                    type="text"
                    placeholder="XXXX-XXXX"
                    value={backupInput}
                    onChange={e => setBackupInput(e.target.value.toUpperCase())}
                    className="font-mono tracking-wider"
                    autoFocus
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !backupInput.trim()}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Kirish
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {/* ─── Step 3: Setup loading ───────────────────────────────────── */}
        {step === 'setup_loading' && (
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">2FA sozlanmoqda...</p>
          </CardContent>
        )}

        {/* ─── Step 4: Setup QR ────────────────────────────────────────── */}
        {step === 'setup_qr' && (
          <>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                <CardTitle className="text-xl">2FA Sozlash</CardTitle>
                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                  Majburiy
                </span>
              </div>
              <CardDescription>
                Admin va Teacher akkauntlari uchun 2FA majburiy. Quyidagi QR kodni
                Google Authenticator yoki Authy bilan skanerlang.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {qrCodeUrl && (
                <img src={qrCodeUrl} alt="2FA QR Code" className="border rounded p-2 size-44" />
              )}
              <div className="w-full">
                <p className="text-xs text-muted-foreground mb-1">Qo'lda kiritish uchun secret:</p>
                <div className="flex items-center gap-2 bg-muted rounded px-3 py-2">
                  <code className="text-xs font-mono flex-1 break-all select-all">{secret}</code>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(secret); toast.success('Nusxalandi') }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
              </div>
              <Button className="w-full" onClick={() => setStep('setup_verify')}>
                Scan qildim, kodni kiritaman →
              </Button>
            </CardContent>
          </>
        )}

        {/* ─── Step 5: Setup verify ────────────────────────────────────── */}
        {step === 'setup_verify' && (
          <>
            <CardHeader className="pb-2">
              <button type="button" onClick={() => setStep('setup_qr')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2 w-fit">
                <ArrowLeft className="size-3.5" /> Orqaga
              </button>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                <CardTitle className="text-xl">Kodni kiriting</CardTitle>
              </div>
              <CardDescription>
                Authenticator ilovangiz ko'rsatayotgan 6 raqamli kodni kiriting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSetupVerify} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="setup-otp">Tasdiqlash kodi</Label>
                  <Input
                    id="setup-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={setupCode}
                    onChange={e => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                    autoFocus
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || setupCode.length !== 6}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  2FA ni yoqish
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {/* ─── Step 6: Backup codes ────────────────────────────────────── */}
        {step === 'setup_codes' && (
          <>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Key className="size-5 text-amber-600" />
                <CardTitle className="text-xl">Backup kodlaringiz</CardTitle>
              </div>
              <CardDescription>
                Bu kodlarni xavfsiz joyga saqlang. Har biri faqat bir marta ishlatiladi.
                Agar qurilmangizga kirish imkoni bo'lmasa, shu kodlar orqali tizimga kirasiz.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <p className="text-xs font-medium text-amber-800">
                  ⚠ Bu kodlar faqat bir marta ko'rsatiladi. Sahifani yopsangiz qaytarib bo'lmaydi.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, i) => (
                  <div key={i} className="font-mono text-sm bg-muted rounded px-3 py-1.5 text-center tracking-wider select-all">
                    {code}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(backupCodes.join('\n'))
                  toast.success('Barcha kodlar nusxalandi')
                }}
              >
                <Copy className="size-3.5 mr-1.5" />
                Barcha kodlarni nusxalash
              </Button>
              <Button
                className="w-full"
                type="button"
                onClick={() => pendingUser && completeLogin(pendingToken, pendingUser)}
              >
                Saqdim, davom etish →
              </Button>
            </CardContent>
          </>
        )}

      </Card>
    </div>
  )
}
