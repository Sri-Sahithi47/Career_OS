import { describe, expect, it } from 'vitest'
import { buildSplinePath, daysSince } from './dashboardUtils'

describe('Dashboard activity', () => {
  it('shows an empty chart for an empty workspace', () => {
    expect(buildSplinePath([]).points.every(([, y]) => y === 180)).toBe(true)
  })
  it('does not count saved jobs as applications', () => {
    const job = { Status: 'not_applied', 'Date Found': new Date().toISOString() }
    expect(buildSplinePath([job]).points.every(([, y]) => y === 180)).toBe(true)
    expect(buildSplinePath([{ ...job, Status: 'applied' }]).points.at(-1)[1]).toBeLessThan(180)
  })
  it('handles API date strings and malformed dates', () => {
    expect(daysSince(new Date().toISOString())).toBe(0)
    expect(daysSince('not-a-date')).toBeNull()
  })
})
