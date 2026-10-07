'use client'

import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { FloatingInput, GradientButton } from './login-ui'

export function CredentialsStep({
  email, setEmail, password, setPassword, loading, onSubmit,
}: {
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  loading: boolean
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <motion.div
      key="credentials"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.32 }}
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-1.5" style={{ color: 'var(--s-text)' }}>Xush kelibsiz</h2>
        <p className="text-sm" style={{ color: 'var(--s-muted)' }}>Davom etish uchun tizimga kiring</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <FloatingInput
          id="email" label="Email manzil" type="email"
          value={email} onChange={setEmail} required
        />
        <FloatingInput
          id="password" label="Parol" type="password"
          value={password} onChange={setPassword} required
        />

        <div className="flex justify-end mt-0.5">
          <button
            type="button"
            onClick={() => toast.info(
              "Parolni tiklash uchun tizim administratoriga murojaat qiling",
              { description: 'Hozircha avtomatik tiklash mavjud emas.' },
            )}
            className="text-[11px] hover:text-blue-400 transition-colors"
            style={{ color: 'var(--s-muted)' }}
          >
            Parolni unutdingizmi?
          </button>
        </div>

        <GradientButton type="submit" loading={loading} disabled={loading}>
          {!loading && 'Kirish'}
          {loading && 'Kirilmoqda...'}
        </GradientButton>
      </form>
    </motion.div>
  )
}
