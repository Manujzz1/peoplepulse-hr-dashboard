import { describe, expect, it } from 'vitest'
import { DEFAULT_INCREMENT_BAND_LIMITS, getIncrementBandLabel, getIncrementDistribution, normalizeIncrementBandLimits } from './incrementPolicy'

describe('configurable increment policy bands', () => {
  it('validates increasing percentage cutoffs and rejects invalid configurations', () => {
    expect(normalizeIncrementBandLimits([2.5, 7, 12])).toEqual([2.5, 7, 12])
    expect(normalizeIncrementBandLimits([3, 3, 9])).toBeNull()
    expect(normalizeIncrementBandLimits([3, 9, 6])).toBeNull()
    expect(normalizeIncrementBandLimits([0, 6, 9])).toBeNull()
    expect(normalizeIncrementBandLimits([3, 6, 100])).toBeNull()
  })

  it('places boundary values in the upper band and includes every reported increment once', () => {
    const rows = [0, 2.99, 3, 5.99, 6, 8.99, 9, 25, null].map((incrementPercent) => ({ incrementPercent }))
    expect(getIncrementDistribution(rows)).toEqual([
      { band: '0–<3%', count: 2 },
      { band: '3–<6%', count: 2 },
      { band: '6–<9%', count: 2 },
      { band: '9%+', count: 2 },
    ])
    expect(getIncrementBandLabel(6, [2.5, 6, 12])).toBe('6–<12%')
    expect(getIncrementBandLabel(null)).toBe('Not provided')
    expect(getIncrementDistribution([{ incrementPercent: 3 }], [9, 3, 6])).toEqual(getIncrementDistribution([{ incrementPercent: 3 }], DEFAULT_INCREMENT_BAND_LIMITS))
  })
})
