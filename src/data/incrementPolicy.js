export const DEFAULT_INCREMENT_BAND_LIMITS = Object.freeze([3, 6, 9])

export function normalizeIncrementBandLimits(values) {
  if (!Array.isArray(values) || values.length !== 3) return null
  const limits = values.map(Number)
  if (limits.some((value) => !Number.isFinite(value) || value <= 0 || value >= 100)) return null
  if (!(limits[0] < limits[1] && limits[1] < limits[2])) return null
  return limits
}

const percentLabel = (value) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))

export function getIncrementBandLabel(value, limits = DEFAULT_INCREMENT_BAND_LIMITS) {
  if (value == null || value === '') return 'Not provided'
  const percentage = Number(value)
  if (!Number.isFinite(percentage)) return 'Not provided'
  const [first, second, third] = normalizeIncrementBandLimits(limits) || DEFAULT_INCREMENT_BAND_LIMITS
  if (percentage < first) return `0–<${percentLabel(first)}%`
  if (percentage < second) return `${percentLabel(first)}–<${percentLabel(second)}%`
  if (percentage < third) return `${percentLabel(second)}–<${percentLabel(third)}%`
  return `${percentLabel(third)}%+`
}

export function getIncrementDistribution(increments, limits = DEFAULT_INCREMENT_BAND_LIMITS) {
  const [first, second, third] = normalizeIncrementBandLimits(limits) || DEFAULT_INCREMENT_BAND_LIMITS
  const bands = [
    { band: `0–<${percentLabel(first)}%`, lower: 0, upper: first },
    { band: `${percentLabel(first)}–<${percentLabel(second)}%`, lower: first, upper: second },
    { band: `${percentLabel(second)}–<${percentLabel(third)}%`, lower: second, upper: third },
    { band: `${percentLabel(third)}%+`, lower: third, upper: Infinity },
  ]
  return bands.map(({ band, lower, upper }) => ({
    band,
    count: increments.filter((row) => {
      const percentage = Number(row.incrementPercent)
      return row.incrementPercent != null && Number.isFinite(percentage) && percentage >= lower && percentage < upper
    }).length,
  }))
}
