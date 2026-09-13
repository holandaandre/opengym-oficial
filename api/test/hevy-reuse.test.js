/* The rule that broke on 13/09/2026: a custom exercise renamed into Portuguese was recreated in
 * English by the next import, because the only handle on it was its name. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { reuseCustoms } from '../hevy/webhook.js';

test('the same Hevy exercise is reused even after being renamed', () => {
  const S = { customEx: [{ id: 'imAntigo', hevyId: 'T1', n: 'tríceps na corda (polia)' }] };
  const parsed = {
    customEx: [{ id: 'imNovo', hevyId: 'T1', n: 'triceps rope pushdown' }],
    workouts: [{ entries: [{ id: 'imNovo' }] }],
  };
  reuseCustoms(S, parsed);
  assert.equal(parsed.customEx.length, 0, 'a second copy must not be created');
  assert.equal(parsed.workouts[0].entries[0].id, 'imAntigo', 'the workout points at the one that existed');
});

test('without a Hevy id the name still resolves, so older imports keep working', () => {
  const S = { customEx: [{ id: 'imA', n: 'agachamento pendular (máquina)' }] };
  const parsed = {
    customEx: [{ id: 'imB', n: 'Agachamento Pendular (Máquina)' }],
    workouts: [{ entries: [{ id: 'imB' }] }],
  };
  reuseCustoms(S, parsed);
  assert.equal(parsed.customEx.length, 0);
  assert.equal(parsed.workouts[0].entries[0].id, 'imA');
});

test('a genuinely new exercise is still created', () => {
  const S = { customEx: [{ id: 'imA', hevyId: 'T1', n: 'algo' }] };
  const parsed = { customEx: [{ id: 'imB', hevyId: 'T9', n: 'outro' }], workouts: [{ entries: [{ id: 'imB' }] }] };
  reuseCustoms(S, parsed);
  assert.equal(parsed.customEx.length, 1);
  assert.equal(parsed.workouts[0].entries[0].id, 'imB');
});
