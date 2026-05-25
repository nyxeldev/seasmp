'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div style={{ width: 52, height: 28 }} />

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Light modega o\'tish' : 'Dark modega o\'tish'}
      style={{
        position:   'relative',
        width:      52,
        height:     28,
        borderRadius: 14,
        padding:    3,
        border:     '1px solid var(--s-border)',
        background: isDark
          ? 'rgba(59,130,246,0.18)'
          : 'rgba(251,191,36,0.18)',
        cursor:     'pointer',
        outline:    'none',
        transition: 'background 0.35s ease',
        flexShrink: 0,
      }}
    >
      <motion.div
        animate={{ x: isDark ? 22 : 0 }}
        transition={{ type: 'spring', stiffness: 480, damping: 28 }}
        style={{
          width:          22,
          height:         22,
          borderRadius:   11,
          background:     isDark ? '#1d3f6b' : '#fef3c7',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontSize:       13,
          lineHeight:     1,
          boxShadow:      '0 1px 4px rgba(0,0,0,0.25)',
          userSelect:     'none',
        }}
      >
        {isDark ? '🌙' : '☀️'}
      </motion.div>
    </button>
  )
}
