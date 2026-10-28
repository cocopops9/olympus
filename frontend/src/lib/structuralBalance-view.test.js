import { describe, expect, it } from 'vitest'
import { balanceStatusView } from './structuralBalance-view.js'

describe('balanceStatusView', () => {
  it('maps every known status to an everyday label and a severity', () => {
    expect(balanceStatusView('balanced')).toEqual({ label: 'On track', severity: 0 })
    expect(balanceStatusView('borderline')).toEqual({ label: 'Slightly behind', severity: 1 })
    expect(balanceStatusView('weak')).toEqual({ label: 'Behind', severity: 2 })
    expect(balanceStatusView('no-data')).toEqual({ label: 'Not measured', severity: 3 })
  })

  it('falls back to no-data for an unknown status', () => {
    expect(balanceStatusView('bogus')).toEqual({ label: 'Not measured', severity: 3 })
  })

  it('reads a logged lift with no anchor to hold it against as not scored, not as no data', () => {
    expect(balanceStatusView('no-data', true)).toEqual({ label: 'Not scored', severity: 3 })
    expect(balanceStatusView('no-data', false)).toEqual({ label: 'Not measured', severity: 3 })
  })
})
