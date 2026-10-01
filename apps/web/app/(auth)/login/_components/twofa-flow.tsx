'use client'

// Ikki faktorli autentifikatsiya bilan bog'liq barcha bosqichlar: kodni
// tasdiqlash, backup kod, va birinchi marta sozlash (QR → tasdiqlash →
// backup kodlar). Bittasi — "2FA oqimi" — bitta mas'uliyat, shuning uchun
// bitta faylda.

import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ShieldCheck, Key, Copy, ArrowLeft, Loader2 } from 'lucide-react'
import { GradientButton, otpInputBase, otpInputStyle } from './login-ui'

export function TotpStep({
  otpCode, setOtpCode, loading, onSubmit, onBack, onUseBackup,
}: {
  otpCode: string
  setOtpCode: (v: string) => void
  loading: boolean
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
  onUseBackup: () => void
}) {
  return (
    <motion.div
      key="totp"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.32 }}
    >
      <button type="button" onClick={onBack}
        className="flex items-center gap-1.5 text-xs hover:text-blue-400 mb-7 transition-colors"
        style={{ color: 'var(--s-muted)' }}>
        <ArrowLeft size={13} /> Orqaga
      </button>

      <div className="mb-8">
        <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20
          flex items-center justify-center mb-4">
          <ShieldCheck size={20} className="text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold mb-1.5" style={{ color: 'var(--s-text)' }}>2FA Tasdiqlash</h2>
        <p className="text-sm" style={{ color: 'var(--s-muted)' }}>Authenticator ilovangizdan 6 raqamli kodni kiriting</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <input
          type="text" inputMode="numeric" maxLength={6}
          value={otpCode} autoFocus placeholder="000000"
          onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className={otpInputBase}
          style={otpInputStyle}
        />
        <GradientButton type="submit" loading={loading}
          disabled={loading || otpCode.length !== 6}>
          {!loading && 'Kirish'}
          {loading && 'Tekshirilmoqda...'}
        </GradientButton>
      </form>

      <button type="button" onClick={onUseBackup}
        className="mt-5 w-full flex items-center justify-center gap-1.5
          text-xs hover:text-blue-400 transition-colors"
        style={{ color: 'var(--s-muted)' }}>
        <Key size={12} /> Backup kod ishlatish
      </button>
    </motion.div>
  )
}

export function BackupStep({
  backupInput, setBackupInput, loading, onSubmit, onBack,
}: {
  backupInput: string
  setBackupInput: (v: string) => void
  loading: boolean
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
}) {
  return (
    <motion.div
      key="backup"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.32 }}
    >
      <button type="button" onClick={onBack}
        className="flex items-center gap-1.5 text-xs hover:text-blue-400 mb-7 transition-colors"
        style={{ color: 'var(--s-muted)' }}>
        <ArrowLeft size={13} /> Authenticator kodiga qaytish
      </button>

      <div className="mb-8">
        <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20
          flex items-center justify-center mb-4">
          <Key size={20} className="text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold mb-1.5" style={{ color: 'var(--s-text)' }}>Backup kod</h2>
        <p className="text-sm" style={{ color: 'var(--s-muted)' }}>Avval saqlangan backup kodingizni kiriting</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <input
          type="text" value={backupInput} autoFocus placeholder="XXXX-XXXX"
          onChange={e => setBackupInput(e.target.value.toUpperCase())}
          className={[
            'w-full h-14 text-center font-mono tracking-[0.35em] text-lg rounded-xl',
            'border placeholder-transparent',
            'focus:outline-none focus:border-blue-500',
            'focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] transition-all',
          ].join(' ')}
          style={otpInputStyle}
        />
        <GradientButton type="submit" loading={loading} disabled={loading || !backupInput.trim()}>
          {!loading && 'Kirish'}
          {loading && 'Tekshirilmoqda...'}
        </GradientButton>
      </form>
    </motion.div>
  )
}

export function SetupLoadingStep() {
  return (
    <motion.div
      key="setup_loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-4 py-20"
    >
      <Loader2 size={30} className="animate-spin text-blue-400" />
      <p className="text-sm" style={{ color: 'var(--s-muted)' }}>2FA sozlanmoqda...</p>
    </motion.div>
  )
}

export function SetupQrStep({
  qrCodeUrl, qrError, setQrError, secret, onContinue,
}: {
  qrCodeUrl: string
  qrError: boolean
  setQrError: (v: boolean) => void
  secret: string
  onContinue: () => void
}) {
  return (
    <motion.div
      key="setup_qr"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.32 }}
    >
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1.5">
          <h2 className="text-xl font-bold" style={{ color: 'var(--s-text)' }}>2FA Sozlash</h2>
          <span className="text-[10px] bg-orange-500/12 text-orange-400
            border border-orange-500/18 px-2 py-0.5 rounded-full font-medium">
            Majburiy
          </span>
        </div>
        <p className="text-sm" style={{ color: 'var(--s-muted)' }}>
          QR kodni Google Authenticator yoki Authy bilan skanerlang
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        {qrCodeUrl && !qrError && (
          <div className="p-3 bg-white rounded-2xl shadow-[0_0_32px_rgba(59,130,246,0.2)]">
            <img
              src={qrCodeUrl} alt="2FA QR Code" className="w-44 h-44"
              onError={() => setQrError(true)}
            />
          </div>
        )}
        {qrError && (
          <div className="w-44 h-44 rounded-2xl border flex flex-col items-center justify-center gap-2 text-center px-3"
            style={{ borderColor: 'var(--s-border)', background: 'var(--s-input)' }}>
            <ShieldCheck size={22} style={{ color: 'var(--s-muted)' }} />
            <p className="text-[11px]" style={{ color: 'var(--s-muted)' }}>
              QR kod yuklanmadi — pastdagi kalitni qo'lda kiriting
            </p>
          </div>
        )}
        <div className="w-full">
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--s-muted)' }}>Qo'lda kiritish uchun secret:</p>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 border"
            style={{ background: 'var(--s-input)', borderColor: 'var(--s-border)' }}>
            <code className="text-[11px] font-mono flex-1 break-all select-all" style={{ color: 'var(--s-muted)' }}>
              {secret}
            </code>
            <button type="button"
              onClick={() => { navigator.clipboard.writeText(secret); toast.success('Nusxalandi') }}
              className="transition-colors shrink-0"
              style={{ color: 'var(--s-muted)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)' }}>
              <Copy size={13} />
            </button>
          </div>
        </div>
        <GradientButton onClick={onContinue}>
          Scan qildim, kodni kiritaman →
        </GradientButton>
      </div>
    </motion.div>
  )
}

export function SetupVerifyStep({
  setupCode, setSetupCode, loading, onSubmit, onBack,
}: {
  setupCode: string
  setSetupCode: (v: string) => void
  loading: boolean
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
}) {
  return (
    <motion.div
      key="setup_verify"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.32 }}
    >
      <button type="button" onClick={onBack}
        className="flex items-center gap-1.5 text-xs hover:text-blue-400 mb-7 transition-colors"
        style={{ color: 'var(--s-muted)' }}>
        <ArrowLeft size={13} /> Orqaga
      </button>

      <div className="mb-8">
        <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20
          flex items-center justify-center mb-4">
          <ShieldCheck size={20} className="text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold mb-1.5" style={{ color: 'var(--s-text)' }}>Kodni kiriting</h2>
        <p className="text-sm" style={{ color: 'var(--s-muted)' }}>
          Authenticator ilovangiz ko'rsatayotgan 6 raqamli kodni kiriting
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <input
          type="text" inputMode="numeric" maxLength={6}
          value={setupCode} autoFocus placeholder="000000"
          onChange={e => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className={otpInputBase}
          style={otpInputStyle}
        />
        <GradientButton type="submit" loading={loading}
          disabled={loading || setupCode.length !== 6}>
          {!loading && '2FA ni yoqish'}
          {loading && 'Tekshirilmoqda...'}
        </GradientButton>
      </form>
    </motion.div>
  )
}

export function SetupCodesStep({
  backupCodes, onFinish,
}: {
  backupCodes: string[]
  onFinish: () => void
}) {
  return (
    <motion.div
      key="setup_codes"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.32 }}
    >
      <div className="mb-6">
        <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20
          flex items-center justify-center mb-4">
          <Key size={20} className="text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold mb-1.5" style={{ color: 'var(--s-text)' }}>Backup kodlaringiz</h2>
        <p className="text-sm" style={{ color: 'var(--s-muted)' }}>Har biri faqat bir marta ishlatiladi.</p>
      </div>

      <div className="bg-amber-500/[0.07] border border-amber-500/14 rounded-xl px-4 py-3 mb-4">
        <p className="text-xs text-amber-400/75">
          ⚠ Bu kodlar faqat bir marta ko'rsatiladi. Xavfsiz joyda saqlang.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {backupCodes.map((code, i) => (
          <div key={i}
            className="font-mono text-sm rounded-lg px-3 py-2 text-center tracking-wider select-all border"
            style={{ background: 'var(--s-input)', borderColor: 'var(--s-border)', color: 'var(--s-text)' }}>
            {code}
          </div>
        ))}
      </div>

      <button type="button"
        onClick={() => { navigator.clipboard.writeText(backupCodes.join('\n')); toast.success('Barcha kodlar nusxalandi') }}
        className="w-full h-10 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all mb-3 border"
        style={{ color: 'var(--s-muted)', borderColor: 'var(--s-border)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--s-text)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--s-border)' }}>
        <Copy size={13} /> Barcha kodlarni nusxalash
      </button>

      <GradientButton onClick={onFinish}>
        Saqdim, davom etish →
      </GradientButton>
    </motion.div>
  )
}
