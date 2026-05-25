'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Keyboard, X } from 'lucide-react'

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'],  desc: 'Global qidiruv' },
  { keys: ['?'],          desc: 'Ushbu modal' },
  { keys: ['G', 'D'],     desc: 'Dashboard' },
  { keys: ['G', 'C'],     desc: 'Kurslar' },
  { keys: ['G', 'U'],     desc: "O'quvchilar" },
  { keys: ['G', 'A'],     desc: 'Davomat' },
  { keys: ['G', 'N'],     desc: 'Analitika' },
  { keys: ['G', 'S'],     desc: 'Xavfsizlik' },
  { keys: ['G', 'E'],     desc: 'Sozlamalar' },
  { keys: ['Esc'],        desc: 'Yopish' },
]

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let lastKey = ''
    let timer: ReturnType<typeof setTimeout>

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key === '?') { setOpen(v => !v); return }

      if (e.key.toLowerCase() === 'g') {
        lastKey = 'g'
        clearTimeout(timer)
        timer = setTimeout(() => { lastKey = '' }, 1000)
        return
      }

      if (lastKey === 'g') {
        clearTimeout(timer)
        lastKey = ''
        switch (e.key.toLowerCase()) {
          case 'd': router.push('/dashboard');  break
          case 'c': router.push('/courses');    break
          case 'u': router.push('/users');      break
          case 'a': router.push('/attendance'); break
          case 'n': router.push('/analytics');  break
          case 's': router.push('/security');   break
          case 'e': router.push('/settings');   break
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => { document.removeEventListener('keydown', handler); clearTimeout(timer) }
  }, [router])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <Keyboard className="size-4" style={{ color: 'var(--color-accent)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text1)' }}>
                  Klaviatura yorliqlari
                </h3>
              </div>
              <button onClick={() => setOpen(false)}
                className="p-1 rounded-md transition-colors"
                style={{ color: 'var(--color-text3)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text1)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text3)'}>
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 space-y-1">
              {SHORTCUTS.map(({ keys, desc }) => (
                <div key={desc} className="flex items-center justify-between py-2 px-1">
                  <span className="text-sm" style={{ color: 'var(--color-text2)' }}>{desc}</span>
                  <div className="flex items-center gap-1">
                    {keys.map((k, i) => (
                      <span key={k} className="flex items-center gap-1">
                        {i > 0 && <span style={{ color: 'var(--color-text3)', fontSize: '11px' }}>+</span>}
                        <kbd style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '24px',
                          padding: '2px 6px',
                          borderRadius: '5px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text1)',
                        }}>{k}</kbd>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t text-center"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <p className="text-[11px]" style={{ color: 'var(--color-text3)' }}>
                <kbd style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '10px',
                  border: '1px solid var(--color-border)' }}>?</kbd>
                {' '}bosib qayta yoping
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
