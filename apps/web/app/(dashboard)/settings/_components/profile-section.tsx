'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { useLocale } from '@/store/locale'
import { usersApi } from '@/lib/api'
import { toast } from 'sonner'
import { AvatarUpload } from '@/components/avatar-upload'
import { fadeUp, Field, SubmitBtn } from './settings-ui'

const profileSchema = z.object({
  firstName: z.string().min(2, 'Kamida 2 ta harf'),
  lastName:  z.string().min(2, 'Kamida 2 ta harf'),
  email:     z.string().email('Noto\'g\'ri email'),
  phone:     z.string().optional(),
})
type ProfileForm = z.infer<typeof profileSchema>

export function ProfileSection() {
  const { user, refresh } = useAuth()
  const { t } = useLocale()
  const [saved, setSaved]       = useState(false)
  const [loading, setLoading]   = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user?.avatarUrl)

  const { register, handleSubmit, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName:  user?.lastName ?? '',
      email:     user?.email ?? '',
    },
  })

  const onSubmit = async (data: ProfileForm) => {
    setLoading(true)
    try {
      await usersApi.updateMe(data)
      setSaved(true)
      toast.success("Profil yangilandi")
      setTimeout(() => setSaved(false), 2500)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Xato')
    } finally {
      setLoading(false)
    }
  }

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'U'

  return (
    <motion.div {...fadeUp(0)} className="rounded-2xl border"
      style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}>
      <div className="settings-profile" style={{
        display: 'grid',
        gridTemplateColumns: 'clamp(160px, 20%, 200px) 1fr',
        gap: '32px',
        padding: '32px',
      }}>
        {/* Left: Avatar + name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <AvatarUpload
            currentUrl={avatarUrl}
            initials={initials}
            onUploadComplete={url => { setAvatarUrl(url); refresh() }}
          />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--s-text)' }}>
              {user?.firstName} {user?.lastName}
            </p>
            <span style={{
              display: 'inline-block', marginTop: '4px',
              background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
              fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: 500,
            }}>
              {user?.role}
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--s-muted)', textAlign: 'center' }}>
            {t('settings.avatarHint')}
          </p>
        </div>

        {/* Right: Form fields */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('settings.firstName')} error={errors.firstName?.message}
              {...register('firstName')} placeholder={t('settings.firstName')} />
            <Field label={t('settings.lastName')} error={errors.lastName?.message}
              {...register('lastName')} placeholder={t('settings.lastName')} />
          </div>
          <Field label={t('settings.email')} type="email" error={errors.email?.message}
            {...register('email')} placeholder="email@example.com" />
          <Field label={t('settings.phone')} {...register('phone')} placeholder="+998 90 000 00 00" />
          <div className="flex justify-end pt-1">
            <SubmitBtn loading={loading} saved={saved} />
          </div>
        </form>
      </div>
    </motion.div>
  )
}
