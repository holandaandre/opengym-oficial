import { describe, it, expect } from 'vitest'
import { parseWorkoutCSV, parseWhen } from './import-csv.js'

// Same columns the real Hevy export writes, trimmed to what matters here.
const HEVY = 'title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps,rpe'
const line = (ex, w, r) =>
  `Lower A,"9 de set. de 2026, 08:09","9 de set. de 2026, 08:57",${ex},0,normal,${w},${r},`

describe('a date written in the phone language', () => {
  it('reads the pt-BR month a Brazilian export writes', () => {
    expect(parseWhen('9 de set. de 2026, 08:09')).toEqual({ d: '2026-09-09', t: 8 * 3600000 + 9 * 60000 })
    expect(parseWhen('8 de abr. de 2025, 11:16')).toEqual({ d: '2025-04-08', t: 11 * 3600000 + 16 * 60000 })
    expect(parseWhen('1 de dez. de 2025, 06:00')).toEqual({ d: '2025-12-01', t: 6 * 3600000 })
  })

  it('reads the Spanish one too', () => {
    expect(parseWhen('9 de sept. de 2026, 08:09')).toEqual({ d: '2026-09-09', t: 8 * 3600000 + 9 * 60000 })
  })

  it('still reads the English and ISO forms', () => {
    expect(parseWhen('12 Jan 2026, 18:00')).toEqual({ d: '2026-01-12', t: 18 * 3600000 })
    expect(parseWhen('2026-03-07 18:51')).toEqual({ d: '2026-03-07', t: 18 * 3600000 + 51 * 60000 })
  })

  // Before this, every row of a localised export was dropped as undated and the
  // import finished reporting nothing imported.
  it('keeps the sets instead of skipping the whole file', () => {
    const p = parseWorkoutCSV([HEVY, line('Seated Calf Raise (Machine)', 20, 20), line('Squat (Barbell)', 60, 5)].join('\n'), { unit: 'kg' })
    expect(p.error).toBeUndefined()
    expect(p.skipped).toBe(0)
    expect(p.sets).toBe(2)
    expect(p.workouts).toHaveLength(1)
    expect(p.workouts[0].d).toBe('2026-09-09')
  })
})
