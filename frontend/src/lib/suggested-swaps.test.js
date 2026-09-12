import { describe, test, expect } from 'vitest'
import { suggestedSwaps, EXIDX } from './exercises.js'

/* The catalogue is 1300 exercises deep and most of them are variations nobody trains, so a
 * suggestion list is only useful if it puts a real alternative first. These lock the three
 * signals that decide the order: same target muscle, same movement pattern, and what this
 * lifter actually trains. */

const BENCH = '0025'              // barbell bench press — tg pectorals, sm triceps/shoulders
const state = (workouts = [], routines = []) => ({ customEx: [], routines, workouts })

const workoutWith = (...ids) => ({ entries: ids.map(id => ({ id })) })

describe('suggestedSwaps', () => {
  test('only offers exercises for the same target muscle, never the exercise itself', () => {
    const out = suggestedSwaps(state(), BENCH, { limit: 8 })
    const target = EXIDX[BENCH].tg
    expect(out.length).toBeGreaterThan(0)
    expect(out.every(e => e.tg === target)).toBe(true)
    expect(out.some(e => e.id === BENCH)).toBe(false)
  })

  test('what the lifter already trains outranks an untrained exercise', () => {
    const trained = suggestedSwaps(state(), BENCH, { limit: 20 }).at(-1)
    const history = Array.from({ length: 8 }, () => workoutWith(trained.id))
    const out = suggestedSwaps(state(history), BENCH, { limit: 3 })
    expect(out[0].id).toBe(trained.id)
  })

  test('mobility work is never a substitute for a lift', () => {
    const out = suggestedSwaps(state(), BENCH, { limit: 40 })
    expect(out.some(e => /stretch/i.test(e.n))).toBe(false)
  })

  test('available equipment breaks a tie', () => {
    const both = suggestedSwaps(state(), BENCH, { limit: 40 })
    const pick = both.at(-1)
    const out = suggestedSwaps(state(), BENCH, { limit: 40, available: e => e.id === pick.id })
    expect(out.indexOf(out.find(e => e.id === pick.id))).toBeLessThan(both.indexOf(pick))
  })

  test('an unknown id yields nothing rather than throwing', () => {
    expect(suggestedSwaps(state(), 'nao-existe')).toEqual([])
  })
})
