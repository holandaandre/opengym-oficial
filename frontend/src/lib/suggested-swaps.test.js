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

describe('swapConfig', () => {
  test('the new exercise decides what it is; the slot only keeps its prescription', async () => {
    const { swapConfig } = await import('./history.js')
    // A bodyweight plank slot swapped for a barbell bench press: carrying `bodyweight` across
    // would leave the bench flagged as bodyweight and never asking for load again.
    const plank = { id: '1775', sets: 3, reps: 10, weight: 0, mode: 'reps', bodyweight: true }
    const out = swapConfig(plank, '0025')
    expect(out.bodyweight).toBeUndefined()
    expect(out.mode).toBe('reps')
  })

  test('sets, reps and load survive a swap between two exercises of the same mode', async () => {
    const { swapConfig } = await import('./history.js')
    const out = swapConfig({ id: '0025', sets: 4, reps: 6, weight: 80, mode: 'reps', prog: 'linear' }, '0027')
    expect(out).toMatchObject({ sets: 4, reps: 6, weight: 80, prog: 'linear' })
  })

  test('the superset group and the slot note are kept', async () => {
    const { swapConfig } = await import('./history.js')
    const out = swapConfig({ id: '0025', sets: 3, reps: 10, sg: 'a', note: 'pegada fechada' }, '0027')
    expect(out.sg).toBe('a')
    expect(out.note).toBe('pegada fechada')
  })
})
