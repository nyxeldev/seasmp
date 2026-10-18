'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Check, X, Copy } from 'lucide-react'
import { securityApi } from '@/lib/api'
import { Field } from './settings-ui'

export function TwoFaModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ qrCodeUrl: string; secret: string; backupCodes?: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  useState(() => {
    securityApi.setup2fa().then(r => {
      setData(r.data)
      setLoading(false)
    }).catch(() => { toast.error('2FA sozlamalarini yuklashda xato'); onClose() })
  })

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setConfirming(true)
    try {
      await securityApi.confirm2fa(code)
      setDone(true)
      toast.success('2FA faollashtirildi!')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setConfirming(false)
    }
  }

  const copySecret = () => {
    if (data?.secret) { navigator.clipboard.writeText(data.secret); toast.success('Nusxalandi') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.25, ease: 'easeOut' as const }}
        className="w-full max-w-sm rounded-2xl border p-6 space-y-5"
        style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: 'var(--s-text)' }}>2FA Sozlash</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--s-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'; (e.currentTarget as HTMLElement).style.background = 'var(--s-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
            <X className="size-[18px]" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="size-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : done ? (
          <div className="text-center py-6 space-y-3">
            <div className="size-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
              <Check className="size-7 text-green-400" />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--s-text)' }}>2FA faollashtirildi!</p>
            <p className="text-xs" style={{ color: 'var(--s-muted)' }}>Hisobingiz endi qo'shimcha himoyalangan.</p>
            <button onClick={onClose}
              className="mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: '#2563EB' }}>Yopish</button>
          </div>
        ) : data ? (
          <>
            <p className="text-xs" style={{ color: 'var(--s-muted)' }}>
              Google Authenticator yoki Authy ilovasida QR-kodni skanerlang.
            </p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.qrCodeUrl} alt="2FA QR Code"
                className="size-40 rounded-lg"
                style={{ background: '#fff', padding: '8px' }} />
            </div>
            <div className="rounded-lg px-3 py-2.5 flex items-center gap-2"
              style={{ background: 'var(--s-input)', border: '1px solid var(--s-border)' }}>
              <code className="text-xs flex-1 break-all" style={{ color: 'var(--s-text)' }}>{data.secret}</code>
              <button onClick={copySecret} className="shrink-0 text-text3 hover:text-text1 transition-colors">
                <Copy className="size-4" />
              </button>
            </div>
            <form onSubmit={confirm} className="space-y-3">
              <Field label="Tasdiqlash kodi (6 raqam)" value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="000000" maxLength={6} inputMode="numeric" />
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2 rounded-lg text-sm transition-colors"
                  style={{ border: '1px solid var(--s-border)', color: 'var(--s-muted)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'}>Bekor</button>
                <button type="submit" disabled={confirming || code.length !== 6}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: '#2563EB' }}>
                  {confirming ? 'Tekshirilmoqda…' : 'Tasdiqlash'}
                </button>
              </div>
            </form>
            {(data.backupCodes?.length ?? 0) > 0 && (
              <details className="text-xs" style={{ color: 'var(--s-muted)' }}>
                <summary className="cursor-pointer transition-colors"
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--s-text)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--s-muted)'}>
                  Zaxira kodlar ({data.backupCodes!.length})
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {data.backupCodes!.map(c => (
                    <code key={c} className="rounded px-2 py-1" style={{ background: 'var(--s-alt)', color: 'var(--s-text)' }}>{c}</code>
                  ))}
                </div>
              </details>
            )}
          </>
        ) : null}
      </motion.div>
    </div>
  )
}
