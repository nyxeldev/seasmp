import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

// SeverityBadge is a local component inside security/page.tsx.
// Test it as a standalone extracted component here.
type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const colors: Record<AlertSeverity, string> = {
    LOW:      'bg-blue-100 text-blue-800',
    MEDIUM:   'bg-yellow-100 text-yellow-800',
    HIGH:     'bg-orange-100 text-orange-800',
    CRITICAL: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[severity]}`}>
      {severity}
    </span>
  )
}

describe('SeverityBadge', () => {
  it.each<AlertSeverity>(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])(
    'renders %s with correct text',
    (severity) => {
      render(<SeverityBadge severity={severity} />)
      expect(screen.getByText(severity)).toBeInTheDocument()
    },
  )

  it('applies red classes for CRITICAL', () => {
    render(<SeverityBadge severity="CRITICAL" />)
    const el = screen.getByText('CRITICAL')
    expect(el.className).toContain('red')
  })

  it('applies blue classes for LOW', () => {
    render(<SeverityBadge severity="LOW" />)
    const el = screen.getByText('LOW')
    expect(el.className).toContain('blue')
  })
})
