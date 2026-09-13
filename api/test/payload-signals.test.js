/* Three signals the Coach could not see until 13/09/2026.
 *
 * The doctrine this instance runs asks for a deload "sooner on sleep degrading", treats pain as
 * overriding, and plans volume — and the payload carried none of sleep, pain or fatigue. The
 * instruction existed; the evidence did not reach the model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverySummary, fatigueSummary } from '../coach/core/payload.js';

const dia = (base, n) => { const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

/** 28 days ending on `fim`: the last 7 at `recente`, the 21 before at `antes`. */
const noites = (fim, recente, antes) =>
  Array.from({ length: 28 }, (_, i) => {
    const atras = 27 - i;
    return { d: dia(fim, atras), sleepH: atras < 7 ? recente : antes };
  });

test('sleep is reported as a trend, not as a table of nights', () => {
  const r = recoverySummary({ recovery: noites('2026-09-13', 5.5, 7.2) }, null);
  assert.equal(r.to, '2026-09-13');
  assert.equal(r.sleepHours.last7, 5.5);
  assert.equal(r.sleepHours.prior21, 7.2);
  assert.equal(r.sleepHours.delta, -1.7, 'the delta is the number a deload decision turns on');
});

test('too little history says nothing rather than inventing a trend', () => {
  assert.equal(recoverySummary({ recovery: [] }, null), null);
  const tresNoites = noites('2026-09-13', 6, 6).slice(-3);
  assert.equal(recoverySummary({ recovery: tresNoites }, null), null);
});

test('recovery is cut at the day being read, so a debrief cannot see the future', () => {
  const linhas = noites('2026-09-13', 5, 7);
  const r = recoverySummary({ recovery: linhas }, '2026-09-10');
  assert.ok(r === null || r.to <= '2026-09-10');
});

test('an instance that syncs nothing gets no recovery key at all', () => {
  assert.equal(recoverySummary({}, null), null);
});

test('fatigue lists only muscles still carrying load, worst first', () => {
  const hoje = Date.UTC(2026, 8, 13, 20);
  const ontem = Date.UTC(2026, 8, 12, 18);
  const S = {
    unit: 'kg',
    bodyweight: [{ d: '2026-09-12', w: 90 }],
    workouts: [{
      d: '2026-09-12', start: ontem, end: ontem + 3600000,
      entries: [{ id: '0025', sets: Array.from({ length: 6 }, () => ({ done: true, w: 80, r: 8 })) }]
    }]
  };
  const f = fatigueSummary(S, hoje);
  assert.ok(f, 'a session the day before must leave something behind');
  assert.ok(f.muscles.length > 0);
  assert.ok(f.muscles.every(m => m.load > 0.25), 'recovered muscles are noise in a payload');
  const cargas = f.muscles.map(m => m.load);
  assert.deepEqual(cargas, [...cargas].sort((a, b) => b - a), 'worst first');
  assert.ok(f.muscles.every(m => m.state === 'fatigued' || m.state === 'recovering'));
});

test('no history, no fatigue claim', () => {
  assert.equal(fatigueSummary({ workouts: [] }, Date.now()), null);
});

test('a marked-painful exercise reaches the Coach on the entry it happened on', async () => {
  const { build } = await import('../coach/core/payload.js');
  const S = {
    unit: 'kg', routines: [], customEx: [], bodyweight: [], coach: { profile: {} },
    workouts: [{
      id: 'w1', d: '2026-09-12', start: Date.UTC(2026, 8, 12, 18), end: Date.UTC(2026, 8, 12, 19),
      entries: [
        { id: '0025', pain: true, sets: [{ done: true, w: 60, r: 8 }] },
        { id: '0027', sets: [{ done: true, w: 40, r: 10 }] }
      ]
    }]
  };
  const p = build(S, { handle: 'x', kind: 'debrief', workoutId: 'w1' });
  const entries = p.session.entries;
  assert.equal(entries[0].pain, true, 'the exercise that hurt must say so');
  assert.equal(entries[1].pain, undefined, 'and only that one');
});
