import type { CSSProperties } from 'react'

export const styles = {
  bg:      { background: 'var(--color-bg)' }      as CSSProperties,
  card:    { background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '12px' } as CSSProperties,
  surface: { background: 'var(--color-surface)' } as CSSProperties,
  text1:   { color: 'var(--color-text1)' }         as CSSProperties,
  text2:   { color: 'var(--color-text2)' }         as CSSProperties,
  text3:   { color: 'var(--color-text3)' }         as CSSProperties,
  border:  { borderColor: 'var(--color-border)' }  as CSSProperties,
  sidebar: { background: 'var(--color-bg)', borderRight: '1px solid var(--color-border)' } as CSSProperties,
  input:   { background: 'var(--s-input)', border: '1px solid var(--color-border)', color: 'var(--color-text1)', borderRadius: '8px' } as CSSProperties,
  accent:  { color: 'var(--color-accent)' }        as CSSProperties,
  danger:  { color: 'var(--color-danger)' }        as CSSProperties,
  success: { color: 'var(--color-success)' }       as CSSProperties,
}
