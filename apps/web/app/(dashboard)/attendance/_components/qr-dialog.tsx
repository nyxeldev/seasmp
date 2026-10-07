'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { QrCode, RefreshCw } from 'lucide-react'
import { attendanceApi } from '@/lib/api'
import { useLocale } from '@/store/locale'

/** Davomatni QR-kod orqali belgilash uchun o'qituvchi tomonidan generatsiya
 *  qilinadigan vaqtinchalik kod — muddati tugaguncha sanoq bilan. */
export function QrDialog({ courses }: { courses: { id: string; title: string }[] }) {
  const { t } = useLocale()
  const [qrOpen, setQrOpen]       = useState(false)
  const [qrData, setQrData]       = useState<{ token: string; qrCodeUrl: string; expiresIn: number } | null>(null)
  const [countdown, setCountdown] = useState(0)
  const countdownRef              = useRef<ReturnType<typeof setInterval> | null>(null)
  const [qrForm, setQrForm]       = useState({ courseId: '', lessonDate: '' })
  const [qrLoading, setQrLoading] = useState(false)

  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (!qrData) { setCountdown(0); return }
    setCountdown(qrData.expiresIn)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!)
          setQrData(null)
          toast.warning('QR kod muddati tugadi')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [qrData])

  const generateQr = async (e: React.FormEvent) => {
    e.preventDefault()
    setQrLoading(true)
    try {
      const res = await attendanceApi.generateQr(qrForm.courseId, qrForm.lessonDate)
      setQrData(res.data)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Xato')
    } finally {
      setQrLoading(false)
    }
  }

  return (
    <Dialog open={qrOpen} onOpenChange={v => { setQrOpen(v); if (!v) setQrData(null) }}>
      <DialogTrigger render={
        <button
          style={{
            position:     'fixed',
            bottom:       '32px',
            right:        '32px',
            display:      'flex',
            alignItems:   'center',
            gap:          '8px',
            padding:      '12px 20px',
            background:   'linear-gradient(135deg, #3b82f6, #2563eb)',
            color:        'white',
            border:       'none',
            borderRadius: '12px',
            cursor:       'pointer',
            fontSize:     '14px',
            fontWeight:   500,
            boxShadow:    '0 4px 20px rgba(59,130,246,0.4)',
            zIndex:       100,
          }}
        />
      }>
        <QrCode className="size-[18px]" /> {t('attendance.qr')}
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('attendance.qrTitle')}</DialogTitle></DialogHeader>
        <form onSubmit={generateQr} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t('attendance.course')}</Label>
            <Select value={qrForm.courseId} onValueChange={v => setQrForm(f => ({...f, courseId: v ?? ''}))}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t('attendance.selectCourse')} /></SelectTrigger>
              <SelectContent>
                {courses.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('attendance.lessonDate')}</Label>
            <Input type="date" value={qrForm.lessonDate}
              onChange={e => setQrForm(f => ({...f, lessonDate: e.target.value}))} required />
          </div>
          <Button type="submit" disabled={!qrForm.courseId || !qrForm.lessonDate || qrLoading}>
            {qrLoading ? t('attendance.generating') : t('attendance.qr')}
          </Button>
        </form>

        {qrData && (
          <div className="flex flex-col items-center gap-3 pt-3 border-t"
            style={{ borderColor: 'var(--s-border)' }}>
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrData.qrCodeUrl} alt="QR Code"
                className="rounded-xl p-2 size-56"
                style={{ background: '#fff' }} />
              {countdown <= 30 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-4xl font-bold font-mono ${countdown <= 10 ? 'text-red-500' : 'text-orange-500'}`}>
                    {countdown}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--s-muted)' }}>
              <span className={countdown <= 10 ? 'text-red-400 font-semibold' : ''}>{countdown}s qoldi</span>
              <button
                type="button"
                onClick={() => generateQr({ preventDefault: () => {} } as React.FormEvent)}
                disabled={qrLoading}
                className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors"
              >
                <RefreshCw className="size-4" /> {t('attendance.refresh')}
              </button>
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--s-muted)' }}>
              {t('attendance.qrScan')}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
