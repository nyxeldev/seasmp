'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import {
  User, Lock, Bell, Shield, Eye, EyeOff,
  Check, Camera, Mail, Phone,
} from 'lucide-react'

// ── Animation ─────────────────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
})

// ── Shared card ───────────────────────────────────────────────────────────────
function SettingsCard({
  title,
  description,
  icon: Icon,
  children,
  delay = 0,
}: {
  title: string
  description: string
  icon: React.ElementType<{ className?: string; style?: React.CSSProperties }>
  children: React.ReactNode
  delay?: number
}) {
  return (
    <motion.div
      {...fadeUp(delay)}
      className="rounded-xl border p-6"
      style={{ background: '#1E293B', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start gap-3 mb-6 pb-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="p-2.5 rounded-lg shrink-0" style={{ background: 'rgba(59,130,246,0.1)' }}>
          <Icon className="size-4.5" style={{ color: '#3B82F6' }} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </motion.div>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────
function Field({
  label,
  type = 'text',
  defaultValue = '',
  placeholder = '',
  disabled = false,
}: {
  label: string
  type?: string
  defaultValue?: string
  placeholder?: string
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      <div className="relative">
        <input
          type={isPassword && show ? 'text' : type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition-all disabled:opacity-40"
          style={{
            background:  'rgba(255,255,255,0.04)',
            border:      '1px solid rgba(255,255,255,0.1)',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = '#3B82F6'
            e.currentTarget.style.boxShadow   = 'inset 3px 0 0 #3B82F6'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.boxShadow   = 'none'
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0"
      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className="relative shrink-0 w-10 h-5.5 rounded-full transition-colors"
        style={{ background: checked ? '#3B82F6' : 'rgba(255,255,255,0.1)' }}
      >
        <span
          className="absolute top-0.5 left-0.5 size-4.5 rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  )
}

// ── Save button ───────────────────────────────────────────────────────────────
function SaveButton({ saved }: { saved: boolean }) {
  return (
    <button
      type="submit"
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all seasmp-btn"
      style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}
    >
      {saved ? <><Check className="size-4" /> Saqlandi</> : 'Saqlash'}
    </button>
  )
}

// ── Profile section ───────────────────────────────────────────────────────────
function ProfileSection() {
  const { user } = useAuth()
  const [saved, setSaved] = useState(false)

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'U'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <SettingsCard
      title="Profil ma'lumotlari"
      description="Ismingiz, email va avatar sozlamalari"
      icon={User}
      delay={0}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div
              className="size-16 rounded-full flex items-center justify-center text-xl font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}
            >
              {initials}
            </div>
            <button
              type="button"
              className="absolute -bottom-1 -right-1 size-6 rounded-full flex items-center justify-center"
              style={{ background: '#3B82F6', border: '2px solid #1E293B' }}
            >
              <Camera className="size-3 text-white" />
            </button>
          </div>
          <div>
            <p className="text-sm font-medium text-white">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-slate-400 mt-0.5">{user?.role}</p>
            <button
              type="button"
              className="text-xs text-blue-400 hover:text-blue-300 mt-1 transition-colors"
            >
              Rasmni o'zgartirish
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Ism" defaultValue={user?.firstName ?? ''} placeholder="Ismingiz" />
          <Field label="Familiya" defaultValue={user?.lastName ?? ''} placeholder="Familiyangiz" />
        </div>
        <Field
          label="Email"
          type="email"
          defaultValue={user?.email ?? ''}
          placeholder="email@example.com"
        />
        <Field label="Telefon" placeholder="+998 90 000 00 00" />

        <div className="flex justify-end pt-1">
          <SaveButton saved={saved} />
        </div>
      </form>
    </SettingsCard>
  )
}

// ── Security section ──────────────────────────────────────────────────────────
function SecuritySection() {
  const [saved, setSaved]   = useState(false)
  const [twoFa, setTwoFa]   = useState(true)
  const [sessions, setSessions] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <SettingsCard
      title="Xavfsizlik"
      description="Parol va ikki faktorli autentifikatsiya"
      icon={Lock}
      delay={0.1}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Joriy parol" type="password" placeholder="••••••••" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Yangi parol" type="password" placeholder="••••••••" />
          <Field label="Yangi parolni tasdiqlang" type="password" placeholder="••••••••" />
        </div>

        <div
          className="rounded-lg p-4 space-y-0 mt-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Toggle
            label="Ikki faktorli autentifikatsiya (2FA)"
            description="TOTP ilovasi orqali qo'shimcha himoya"
            checked={twoFa}
            onChange={setTwoFa}
          />
          <Toggle
            label="Shubhali kirishlar haqida xabar"
            description="Noma'lum IP yoki qurilmadan kirishda ogohlantirish"
            checked={sessions}
            onChange={setSessions}
          />
        </div>

        <div
          className="flex items-start gap-3 rounded-lg p-3"
          style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}
        >
          <Shield className="size-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">
            So'nggi kirish: <span className="text-white font-medium">Bugun, 10:32</span> — Toshkent, O'zbekiston
          </p>
        </div>

        <div className="flex justify-end pt-1">
          <SaveButton saved={saved} />
        </div>
      </form>
    </SettingsCard>
  )
}

// ── Notifications section ─────────────────────────────────────────────────────
function NotificationsSection() {
  const [prefs, setPrefs] = useState({
    attendance:   true,
    grades:       true,
    risk:         true,
    system:       false,
    weeklyReport: true,
    email:        true,
  })

  const set = (k: keyof typeof prefs) => (v: boolean) =>
    setPrefs(p => ({ ...p, [k]: v }))

  const [saved, setSaved] = useState(false)

  return (
    <SettingsCard
      title="Bildirishnomalar"
      description="Qaysi hodisalar haqida xabardor bo'lishni tanlang"
      icon={Bell}
      delay={0.2}
    >
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center gap-2">
            <Bell className="size-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Tizim ichida</span>
          </div>
        </div>
        <div className="px-4">
          <Toggle label="Davomat ogohlantirishlari" description="O'quvchi dars qoldirganda" checked={prefs.attendance} onChange={set('attendance')} />
          <Toggle label="Baho yangilanishlari" description="Yangi baho kiritilganda" checked={prefs.grades} onChange={set('grades')} />
          <Toggle label="Xavf ogohlantirishlari" description="O'quvchi xavf darajasi oshganda" checked={prefs.risk} onChange={set('risk')} />
          <Toggle label="Tizim xabarlari" description="Texnik xizmat va yangilanishlar" checked={prefs.system} onChange={set('system')} />
        </div>

        <div className="px-4 py-2.5 mt-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center gap-2">
            <Mail className="size-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Email</span>
          </div>
        </div>
        <div className="px-4">
          <Toggle label="Email bildirishnomalar" description="Muhim voqealar haqida emailga xabar" checked={prefs.email} onChange={set('email')} />
          <Toggle label="Haftalik hisobot" description="Har dushanba kuni umumiy hisobot" checked={prefs.weeklyReport} onChange={set('weeklyReport')} />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all seasmp-btn"
          style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}
        >
          {saved ? <><Check className="size-4" /> Saqlandi</> : 'Saqlash'}
        </button>
      </div>
    </SettingsCard>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-5">
      <motion.div {...fadeUp()}>
        <h1 className="text-xl font-semibold text-white">Sozlamalar</h1>
        <p className="text-sm text-slate-400 mt-1">Hisobingiz va tizim afzalliklarini boshqaring</p>
      </motion.div>

      <ProfileSection />
      <SecuritySection />
      <NotificationsSection />
    </div>
  )
}
