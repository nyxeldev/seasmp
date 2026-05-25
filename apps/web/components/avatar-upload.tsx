'use client'

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { usersApi } from '@/lib/api'

interface AvatarUploadProps {
  currentUrl?: string
  initials: string
  onUploadComplete: (url: string) => void
}

export function AvatarUpload({ currentUrl, initials, onUploadComplete }: AvatarUploadProps) {
  const [preview, setPreview]     = useState<string | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Faqat rasm fayllari qabul qilinadi')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Fayl 2MB dan kichik bo'lishi kerak")
      return
    }

    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)

      const res = await fetch('/api/avatar', { method: 'POST', body })
      if (!res.ok) throw new Error('Yuklash muvaffaqiyatsiz')
      const { url } = await res.json() as { url: string }

      await usersApi.updateMe({ avatarUrl: url })
      onUploadComplete(url)
      toast.success('Avatar yangilandi')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Xato yuz berdi')
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  const displaySrc = preview ?? currentUrl

  return (
    <div className="flex items-center gap-4">
      {/* Drop zone / avatar circle */}
      <div
        className="relative group cursor-pointer"
        onClick={() => fileRef.current?.click()}
        onDragEnter={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
      >
        <div
          className="size-16 rounded-full flex items-center justify-center text-xl font-bold overflow-hidden transition-all"
          style={{
            background:    displaySrc ? 'transparent' : 'linear-gradient(135deg, #3B82F6, #2563EB)',
            outline:       dragging ? '2px dashed #3B82F6' : '2px solid transparent',
            outlineOffset: '2px',
            color:         '#fff',
          }}
        >
          {displaySrc
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={displaySrc} alt="Avatar" className="size-full object-cover" />
            : initials}
        </div>

        {/* Drag/upload overlay */}
        <AnimatePresence>
          {(dragging || uploading) && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.5)' }}
            >
              {uploading
                ? <div className="size-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : <Upload className="size-5 text-white" />}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Camera badge */}
        <div
          className="absolute -bottom-1 -right-1 size-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: '#3B82F6', border: '2px solid var(--s-bg-card)' }}
        >
          <Camera className="size-3 text-white" />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />

      <div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors block"
        >
          Rasmni o'zgartirish
        </button>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--s-muted)' }}>
          PNG, JPG · max 2MB · drag &amp; drop
        </p>
        {preview && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setPreview(null) }}
            className="text-[11px] text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 mt-1"
          >
            <X className="size-3" /> Bekor qilish
          </button>
        )}
      </div>
    </div>
  )
}
